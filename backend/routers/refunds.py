"""Refunds, advances and credit applications across customers and vendors."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, module_write_error, require_write
from backend.models import Bill, Contact, ContactRefund, CreditApplication, Invoice, User
from backend.schemas.common import MAX_MONEY, APIModel, Message, Page
from backend.schemas.documents_flow import AdvanceBalance, AdvanceRefundCreate, CreditApplicationOut, RefundOut
from backend.services import credits, doc_flow
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api/refunds", tags=["Refunds"])
advances_router = APIRouter(prefix="/api/advances", tags=["Refunds"])
applications_router = APIRouter(prefix="/api/credit-applications", tags=["Refunds"])

_PARTY_MODULE = {"customer": "paymentsReceived", "vendor": "paymentsMade"}


def _check_party_module(user: User, party_type: str) -> None:
    error = module_write_error(user, (_PARTY_MODULE[party_type],))
    if error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, error)


def _contact(db: Session, org_id: str, party_type: str, contact_id: str) -> Contact:
    contact = get_or_404(db, Contact, contact_id, org_id, party_type.capitalize())
    if contact.type != party_type:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Selected contact is not a {party_type}")
    return contact


@router.get("", response_model=Page[RefundOut])
def list_refunds(
    party_type: Optional[Literal["customer", "vendor"]] = Query(None, alias="partyType"),
    contact_id: Optional[str] = Query(None, alias="contactId"),
    start_date: Optional[date] = Query(None, alias="startDate"),
    end_date: Optional[date] = Query(None, alias="endDate"),
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = (
        select(ContactRefund)
        .where(ContactRefund.organization_id == user.organization_id)
        .options(
            selectinload(ContactRefund.contact),
            selectinload(ContactRefund.bank_account),
            selectinload(ContactRefund.credit_note),
            selectinload(ContactRefund.vendor_credit),
        )
    )
    if party_type:
        stmt = stmt.where(ContactRefund.party_type == party_type)
    if contact_id:
        stmt = stmt.where(ContactRefund.contact_id == contact_id)
    if start_date:
        stmt = stmt.where(ContactRefund.date >= start_date)
    if end_date:
        stmt = stmt.where(ContactRefund.date <= end_date)
    rows, total = paginate(db, stmt.order_by(ContactRefund.date.desc(), ContactRefund.refund_number.desc()), pagination)
    return Page(items=[doc_flow.refund_out(r) for r in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.delete("/{refund_id}", response_model=Message)
def delete_refund(refund_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    refund = get_or_404(db, ContactRefund, refund_id, user.organization_id, "Refund")
    _check_party_module(user, refund.party_type)
    number = refund.refund_number
    credits.delete_refund(db, refund, user)
    db.commit()
    return Message(message=f"Refund {number} deleted and reversed")


@advances_router.get("/balance", response_model=AdvanceBalance)
def advance_balance(
    party_type: Literal["customer", "vendor"] = Query(alias="partyType"),
    contact_id: str = Query(alias="contactId"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = _contact(db, user.organization_id, party_type, contact_id)
    return AdvanceBalance(
        contact_id=contact.id, party_type=party_type, balance=credits.advance_balance(db, user.organization_id, party_type, contact.id)
    )


@advances_router.post("/refund", response_model=RefundOut, status_code=status.HTTP_201_CREATED)
def refund_advance(payload: AdvanceRefundCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Return a customer's unused advance, or record a vendor returning one."""
    _check_party_module(user, payload.party_type)
    contact = _contact(db, user.organization_id, payload.party_type, payload.contact_id)
    record = credits.record_refund(db, user, payload.party_type, contact, payload)
    db.commit()
    db.refresh(record)
    return doc_flow.refund_out(record)


class ApplyAdvanceRequest(APIModel):
    party_type: Literal["customer", "vendor"]
    contact_id: str
    document_id: str  # the invoice (customer) or bill (vendor)
    amount: Decimal = Field(gt=0, le=MAX_MONEY)
    date: Optional[date] = None


@advances_router.post("/apply", response_model=CreditApplicationOut, status_code=status.HTTP_201_CREATED)
def apply_advance(payload: ApplyAdvanceRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Settle an invoice from the customer's advance, or a bill from an advance paid to the vendor."""
    _check_party_module(user, payload.party_type)
    org_id = user.organization_id
    contact = _contact(db, org_id, payload.party_type, payload.contact_id)
    model, label = (Invoice, "Invoice") if payload.party_type == "customer" else (Bill, "Bill")
    document = get_or_404(db, model, payload.document_id, org_id, label)
    app = credits.apply_advance(db, org_id, payload.party_type, contact, document, payload.amount, payload.date, user)
    db.commit()
    db.refresh(app)
    return doc_flow.application_out(app)


@applications_router.get("", response_model=List[CreditApplicationOut])
def list_applications(
    invoice_id: Optional[str] = Query(None, alias="invoiceId"),
    bill_id: Optional[str] = Query(None, alias="billId"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Credits and advances used against an invoice or a bill."""
    if not invoice_id and not bill_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pass invoiceId or billId")
    stmt = select(CreditApplication).where(CreditApplication.organization_id == user.organization_id)
    stmt = stmt.where(CreditApplication.invoice_id == invoice_id) if invoice_id else stmt.where(CreditApplication.bill_id == bill_id)
    return [doc_flow.application_out(a) for a in db.execute(stmt.order_by(CreditApplication.created_at)).scalars()]


@applications_router.delete("/{application_id}", response_model=Message)
def delete_application(application_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    app = db.get(CreditApplication, application_id)
    if app is None or app.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Credit application not found")
    _check_party_module(user, "customer" if app.invoice_id else "vendor")
    credits.remove_application(db, app, user)
    db.commit()
    return Message(message="Credit removed from the document")
