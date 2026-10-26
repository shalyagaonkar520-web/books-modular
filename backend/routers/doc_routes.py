"""The list / read / create / edit / delete / PDF endpoints every document type shares.

Each document router (quotes, sales orders, credit notes, purchase orders,
vendor credits) calls ``register_document_routes`` with its rules as hooks and
adds its own status changes and conversions next to them.

This module deliberately has no ``from __future__ import annotations``: the
request body type of the generated endpoints is a closure variable, which
FastAPI can only see as a real annotation, not as a string.
"""

from dataclasses import dataclass
from datetime import date
from typing import Callable, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Contact, Organization, User
from backend.schemas.common import Message, Page
from backend.schemas.documents_flow import DocumentListItem, DocumentOut
from backend.services import audit, doc_flow, doc_pdf, numbering
from backend.services.doc_flow import DocKind
from backend.services.tenancy import Pagination, paginate


@dataclass
class DocHooks:
    # Statuses in which the document is in the books (posted to the ledger).
    posted_statuses: Tuple[str, ...] = ()
    post: Optional[Callable[[Session, object, User], None]] = None
    unpost: Optional[Callable[[Session, object, User, str], None]] = None
    # Return an error message to refuse the change, or None to allow it.
    edit_error: Callable[[object], Optional[str]] = lambda doc: None
    delete_error: Callable[[object], Optional[str]] = lambda doc: None
    # Extra checks on the payload (e.g. the invoice a credit note names).
    validate: Optional[Callable[[Session, object, object, str], None]] = None


def load(db: Session, kind: DocKind, doc_id: str, org_id: str):
    model = kind.model
    party = getattr(model, kind.party)
    doc = db.execute(
        select(model)
        .where(model.id == doc_id, model.organization_id == org_id)
        .options(selectinload(party), selectinload(model.lines).selectinload(kind.line_model.item))
    ).scalar_one_or_none()
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{kind.label} not found")
    return doc


def register_document_routes(router: APIRouter, kind: DocKind, create_schema, hooks: DocHooks) -> None:
    model = kind.model
    number_col = getattr(model, kind.number_attr)
    party_col = getattr(model, kind.party_attr)

    def _set_status(db: Session, doc, target: str, user: User) -> None:
        doc.status = target
        if target in hooks.posted_statuses and hooks.post:
            hooks.post(db, doc, user)

    @router.get("", response_model=Page[DocumentListItem])
    def list_documents(
        status_filter: Optional[str] = Query(None, alias="status"),
        contact_id: Optional[str] = Query(None, alias="contactId"),
        search: Optional[str] = None,
        start_date: Optional[date] = Query(None, alias="startDate"),
        end_date: Optional[date] = Query(None, alias="endDate"),
        pagination: Pagination = Depends(),
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        stmt = (
            select(model)
            .where(model.organization_id == user.organization_id)
            .options(selectinload(getattr(model, kind.party)), selectinload(model.lines))
        )
        if status_filter == "expired" and kind.second_date:
            stmt = stmt.where(model.status.in_(("draft", "sent")), getattr(model, kind.second_date) < date.today())
        elif status_filter:
            stmt = stmt.where(model.status == status_filter)
        if contact_id:
            stmt = stmt.where(party_col == contact_id)
        if start_date:
            stmt = stmt.where(model.date >= start_date)
        if end_date:
            stmt = stmt.where(model.date <= end_date)
        if search and search.strip():
            q = f"%{search.strip().lower()}%"
            stmt = stmt.join(Contact, Contact.id == party_col).where(
                or_(func.lower(number_col).like(q), func.lower(Contact.display_name).like(q), func.lower(model.reference).like(q))
            )
        stmt = stmt.order_by(model.date.desc(), number_col.desc())
        rows, total = paginate(db, stmt, pagination)
        return Page(
            items=[doc_flow.to_list_item(db, d, kind) for d in rows], total=total, page=pagination.page, page_size=pagination.page_size
        )

    @router.get("/{doc_id}", response_model=DocumentOut)
    def get_document(doc_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
        return doc_flow.to_out(db, load(db, kind, doc_id, user.organization_id), kind)

    @router.get("/{doc_id}/pdf")
    def document_pdf(doc_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
        out = doc_flow.to_out(db, load(db, kind, doc_id, user.organization_id), kind)
        org = db.get(Organization, user.organization_id)
        return Response(
            content=doc_pdf.generate_document_pdf(out, kind.label, org),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{kind.label.replace(" ", "")}-{out.number}.pdf"'},
        )

    def create_document(payload: create_schema, user: User = Depends(require_write), db: Session = Depends(get_db)):
        org_id = user.organization_id
        doc = model(organization_id=org_id, status="draft", created_by=user.id)
        setattr(doc, kind.number_attr, numbering.next_number(db, org_id, kind.key))
        doc_flow.price(db, org_id, doc, payload, kind)
        if hooks.validate:
            hooks.validate(db, doc, payload, org_id)
        db.add(doc)
        db.flush()
        _set_status(db, doc, payload.status, user)
        number = getattr(doc, kind.number_attr)
        audit.record(db, user, "create", kind.key, doc.id, f"Created {kind.label.lower()} {number} ({doc.status})")
        db.commit()
        return doc_flow.to_out(db, load(db, kind, doc.id, org_id), kind)

    def update_document(doc_id: str, payload: create_schema, user: User = Depends(require_write), db: Session = Depends(get_db)):
        org_id = user.organization_id
        doc = load(db, kind, doc_id, org_id)
        error = hooks.edit_error(doc)
        if error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
        was_posted = doc.status in hooks.posted_statuses
        if was_posted and hooks.unpost:
            hooks.unpost(db, doc, user, f"{kind.label} edited")
        doc_flow.price(db, org_id, doc, payload, kind)
        if hooks.validate:
            hooks.validate(db, doc, payload, org_id)
        db.flush()
        # Editing something already in the books keeps it there.
        _set_status(db, doc, doc.status if was_posted else payload.status, user)
        audit.record(db, user, "update", kind.key, doc.id, f"Updated {kind.label.lower()} {getattr(doc, kind.number_attr)}")
        db.commit()
        return doc_flow.to_out(db, load(db, kind, doc.id, org_id), kind)

    # Registered by hand: the body annotation is set here so FastAPI sees the
    # concrete schema rather than a forward reference.
    create_document.__annotations__["payload"] = create_schema
    update_document.__annotations__["payload"] = create_schema
    router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)(create_document)
    router.put("/{doc_id}", response_model=DocumentOut)(update_document)

    @router.delete("/{doc_id}", response_model=Message)
    def delete_document(doc_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
        doc = load(db, kind, doc_id, user.organization_id)
        error = hooks.delete_error(doc)
        if error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
        if doc.status in hooks.posted_statuses and hooks.unpost:
            hooks.unpost(db, doc, user, f"{kind.label} deleted")
        number = getattr(doc, kind.number_attr)
        db.delete(doc)
        audit.record(db, user, "delete", kind.key, doc_id, f"Deleted {kind.label.lower()} {number}")
        db.commit()
        return Message(message=f"{kind.label} {number} deleted")
