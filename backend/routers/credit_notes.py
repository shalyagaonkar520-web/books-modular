"""Credit notes: sales returns and allowances, applied to invoices or refunded."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import require_write
from backend.models import CreditNote, Invoice, User
from backend.routers.doc_routes import DocHooks, load, register_document_routes
from backend.schemas.documents_flow import ApplyCreditRequest, CreditNoteCreate, DocumentOut, RefundCreate, RefundOut, StatusChange
from backend.services import audit, credits, doc_flow
from backend.services.doc_flow import CREDIT_NOTE
from backend.services.tenancy import get_or_404

router = APIRouter(prefix="/api/credit-notes", tags=["Sales"])


def _used_error(cn: CreditNote) -> str | None:
    if cn.amount_applied > 0 or cn.amount_refunded > 0:
        return "This credit note has been applied or refunded; remove those first"
    return None


def _edit_error(cn: CreditNote) -> str | None:
    if cn.status == "void":
        return "A void credit note cannot be edited"
    return _used_error(cn)


def _validate(db: Session, cn: CreditNote, payload: CreditNoteCreate, org_id: str) -> None:
    cn.invoice_id = None
    if not payload.invoice_id:
        return
    invoice = get_or_404(db, Invoice, payload.invoice_id, org_id, "Invoice")
    if invoice.customer_id != cn.customer_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The invoice belongs to a different customer")
    if invoice.status in ("draft", "void"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A credit note cannot be raised against a {invoice.status} invoice")
    if cn.total > invoice.total:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"The credit note total cannot exceed invoice {invoice.invoice_number}'s total of {invoice.total}"
        )
    cn.invoice_id = invoice.id


register_document_routes(
    router,
    CREDIT_NOTE,
    CreditNoteCreate,
    DocHooks(
        posted_statuses=("open", "closed"),
        post=credits.post_credit_note,
        unpost=credits.unpost_credit_note,
        edit_error=_edit_error,
        delete_error=_used_error,
        validate=_validate,
    ),
)


@router.post("/{doc_id}/status", response_model=DocumentOut)
def change_status(doc_id: str, payload: StatusChange, user: User = Depends(require_write), db: Session = Depends(get_db)):
    cn = load(db, CREDIT_NOTE, doc_id, user.organization_id)
    target = payload.status
    if target == "open":
        if cn.status != "draft":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only draft credit notes can be opened")
        cn.status = "open"
        credits.post_credit_note(db, cn, user)
    elif target in ("void", "draft"):
        if target == "void" and cn.status == "void":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Credit note is already void")
        if target == "draft" and cn.status != "open":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only open credit notes can be reverted to draft")
        error = _used_error(cn)
        if error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
        if cn.status in ("open", "closed"):
            credits.unpost_credit_note(db, cn, user, "Credit note voided" if target == "void" else "Credit note reverted to draft")
        cn.status = target
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown credit note status '{target}'")
    audit.record(db, user, "update", "credit_note", cn.id, f"Credit note {cn.credit_note_number} marked {cn.status}")
    db.commit()
    return doc_flow.to_out(db, load(db, CREDIT_NOTE, cn.id, user.organization_id), CREDIT_NOTE)


@router.post("/{doc_id}/apply", response_model=DocumentOut)
def apply_to_invoices(doc_id: str, payload: ApplyCreditRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Use the credit note's remaining balance to settle one or more of the customer's invoices."""
    org_id = user.organization_id
    cn = load(db, CREDIT_NOTE, doc_id, org_id)
    for line in payload.applications:
        invoice = get_or_404(db, Invoice, line.document_id, org_id, "Invoice")
        credits.apply_credit_note(db, cn, invoice, line.amount, payload.date, user)
    db.commit()
    return doc_flow.to_out(db, load(db, CREDIT_NOTE, cn.id, org_id), CREDIT_NOTE)


@router.post("/{doc_id}/refunds", response_model=RefundOut, status_code=status.HTTP_201_CREATED)
def refund(doc_id: str, payload: RefundCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Pay the customer back from the credit note's remaining balance."""
    cn = load(db, CREDIT_NOTE, doc_id, user.organization_id)
    record = credits.record_refund(db, user, "customer", cn.customer, payload, credit_note=cn)
    db.commit()
    db.refresh(record)
    return doc_flow.refund_out(record)
