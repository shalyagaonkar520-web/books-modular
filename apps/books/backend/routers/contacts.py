"""Customers and vendors."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Bill, Contact, Invoice, User
from backend.schemas.common import Message, Page
from backend.schemas.contacts import ContactCreate, ContactOut, ContactSummary, ContactUpdate
from backend.services import audit
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api/contacts", tags=["Contacts"])

OPEN_INVOICE = ("sent", "partially_paid")
OPEN_BILL = ("open", "partially_paid")


def _outstanding_map(db: Session, org_id: str, contact_type: str) -> dict:
    if contact_type == "customer":
        stmt = (
            select(Invoice.customer_id, func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0))
            .where(Invoice.organization_id == org_id, Invoice.status.in_(OPEN_INVOICE))
            .group_by(Invoice.customer_id)
        )
    else:
        stmt = (
            select(Bill.vendor_id, func.coalesce(func.sum(Bill.total - Bill.amount_paid), 0))
            .where(Bill.organization_id == org_id, Bill.status.in_(OPEN_BILL))
            .group_by(Bill.vendor_id)
        )
    return {cid: money(total) for cid, total in db.execute(stmt)}


def to_out(contact: Contact, outstanding: Optional[Decimal] = None) -> ContactOut:
    data = ContactOut.model_validate(contact)
    data.outstanding_balance = money(outstanding or 0)
    return data


@router.get("", response_model=Page[ContactOut])
def list_contacts(
    type: Optional[str] = Query(None, pattern="^(customer|vendor)$"),
    search: Optional[str] = None,
    include_inactive: bool = False,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Contact).where(Contact.organization_id == user.organization_id)
    if type:
        stmt = stmt.where(Contact.type == type)
    if not include_inactive:
        stmt = stmt.where(Contact.is_active.is_(True))
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Contact.display_name).like(q),
                func.lower(Contact.company_name).like(q),
                func.lower(Contact.email).like(q),
                func.lower(Contact.phone).like(q),
                func.lower(Contact.gstin).like(q),
            )
        )
    stmt = stmt.order_by(Contact.display_name)
    rows, total = paginate(db, stmt, pagination)
    customers = _outstanding_map(db, user.organization_id, "customer") if type in (None, "customer") else {}
    vendors = _outstanding_map(db, user.organization_id, "vendor") if type in (None, "vendor") else {}
    items = [to_out(c, (customers if c.type == "customer" else vendors).get(c.id)) for c in rows]
    return Page(items=items, total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/{contact_id}", response_model=ContactOut)
def get_contact(contact_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contact = get_or_404(db, Contact, contact_id, user.organization_id, "Contact")
    outstanding = _outstanding_map(db, user.organization_id, contact.type).get(contact.id)
    return to_out(contact, outstanding)


@router.get("/{contact_id}/summary", response_model=ContactSummary)
def contact_summary(contact_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contact = get_or_404(db, Contact, contact_id, user.organization_id, "Contact")
    today = date.today()
    if contact.type == "customer":
        docs = db.execute(select(Invoice).where(Invoice.customer_id == contact.id, Invoice.status != "void")).scalars().all()
        open_statuses = OPEN_INVOICE
    else:
        docs = db.execute(select(Bill).where(Bill.vendor_id == contact.id, Bill.status != "void")).scalars().all()
        open_statuses = OPEN_BILL
    total = sum((d.total for d in docs if d.status != "draft"), Decimal("0"))
    paid = sum((d.amount_paid for d in docs), Decimal("0"))
    outstanding = sum((d.balance_due for d in docs if d.status in open_statuses), Decimal("0"))
    overdue = sum((d.balance_due for d in docs if d.status in open_statuses and d.due_date < today), Decimal("0"))
    return ContactSummary(
        contact=to_out(contact, outstanding),
        total_invoiced=money(total),
        total_paid=money(paid),
        outstanding=money(outstanding),
        overdue=money(overdue),
        document_count=len(docs),
    )


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def create_contact(payload: ContactCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    contact = Contact(organization_id=user.organization_id, **payload.model_dump())
    db.add(contact)
    db.flush()
    audit.record(db, user, "create", "contact", contact.id, f"Created {contact.type} {contact.display_name}")
    db.commit()
    return to_out(contact)


@router.put("/{contact_id}", response_model=ContactOut)
def update_contact(contact_id: str, payload: ContactUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    contact = get_or_404(db, Contact, contact_id, user.organization_id, "Contact")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)
    audit.record(db, user, "update", "contact", contact.id, f"Updated {contact.type} {contact.display_name}")
    db.commit()
    outstanding = _outstanding_map(db, user.organization_id, contact.type).get(contact.id)
    return to_out(contact, outstanding)


@router.delete("/{contact_id}", response_model=Message)
def delete_contact(contact_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    contact = get_or_404(db, Contact, contact_id, user.organization_id, "Contact")
    has_docs = db.execute(select(Invoice.id).where(Invoice.customer_id == contact.id).limit(1)).first() or db.execute(
        select(Bill.id).where(Bill.vendor_id == contact.id).limit(1)
    ).first()
    if has_docs:
        contact.is_active = False
        audit.record(db, user, "update", "contact", contact.id, f"Deactivated {contact.display_name} (has transactions)")
        db.commit()
        return Message(message="Contact has transactions and has been marked inactive instead of deleted")
    db.delete(contact)
    audit.record(db, user, "delete", "contact", contact.id, f"Deleted {contact.display_name}")
    db.commit()
    return Message(message="Contact deleted")
