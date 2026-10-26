"""Quotes (estimates): priced offers that become sales orders or invoices."""

from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import module_write_error, require_write
from backend.models import SalesOrder, User
from backend.routers.doc_routes import DocHooks, load, register_document_routes
from backend.routers.invoices import create_invoice_record
from backend.schemas.documents_flow import ConversionResult, ConvertRequest, DocumentOut, EstimateCreate, SalesOrderCreate, StatusChange
from backend.schemas.sales import InvoiceCreate
from backend.services import audit, doc_flow, numbering
from backend.services.doc_flow import ESTIMATE, SALES_ORDER

router = APIRouter(prefix="/api/estimates", tags=["Sales"])

# Accepted / declined is the customer's answer; draft and sent are ours.
_TRANSITIONS = {
    "sent": ("draft",),
    "accepted": ("draft", "sent", "declined"),
    "declined": ("draft", "sent", "accepted"),
    "draft": ("sent",),
}


def _converted_error(est) -> str | None:
    if est.invoice_id:
        return "This quote has been invoiced; void or delete the invoice first"
    if est.sales_order_id:
        return "This quote has been turned into a sales order; delete the sales order first"
    return None


def _edit_error(est) -> str | None:
    return _converted_error(est) or (None if est.status in ("draft", "sent") else f"A {est.status} quote cannot be edited")


register_document_routes(router, ESTIMATE, EstimateCreate, DocHooks(edit_error=_edit_error, delete_error=_converted_error))


@router.post("/{doc_id}/status", response_model=DocumentOut)
def change_status(doc_id: str, payload: StatusChange, user: User = Depends(require_write), db: Session = Depends(get_db)):
    est = load(db, ESTIMATE, doc_id, user.organization_id)
    allowed_from = _TRANSITIONS.get(payload.status)
    if allowed_from is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown quote status '{payload.status}'")
    if _converted_error(est) or est.status not in allowed_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {est.status} quote cannot be marked {payload.status}")
    est.status = payload.status
    if payload.status == "sent":
        est.sent_at = datetime.now(UTC)
    audit.record(db, user, "update", "estimate", est.id, f"Quote {est.estimate_number} marked {est.status}")
    db.commit()
    return doc_flow.to_out(db, load(db, ESTIMATE, est.id, user.organization_id), ESTIMATE)


def _check_convertible(est) -> None:
    error = _converted_error(est)
    if error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
    if est.status == "declined":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A declined quote cannot be converted; mark it accepted first")


@router.post("/{doc_id}/convert-to-invoice", response_model=ConversionResult)
def convert_to_invoice(doc_id: str, payload: ConvertRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    error = module_write_error(user, ("invoices",))
    if error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, error)
    est = load(db, ESTIMATE, doc_id, user.organization_id)
    _check_convertible(est)
    inv = create_invoice_record(
        db,
        user,
        InvoiceCreate(
            customer_id=est.customer_id,
            date=date.today(),
            reference=est.reference or est.estimate_number,
            subject=est.subject,
            salesperson=est.salesperson,
            discount_amount=est.discount_amount,
            notes=est.notes,
            terms=est.terms,
            lines=doc_flow.copy_lines(est),
            status="sent" if payload.issue else "draft",
        ),
    )
    est.invoice_id = inv.id
    est.status = "invoiced"
    audit.record(db, user, "update", "estimate", est.id, f"Quote {est.estimate_number} converted to invoice {inv.invoice_number}")
    db.commit()
    return ConversionResult(kind="invoice", id=inv.id, number=inv.invoice_number)


@router.post("/{doc_id}/convert-to-sales-order", response_model=ConversionResult)
def convert_to_sales_order(doc_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    est = load(db, ESTIMATE, doc_id, user.organization_id)
    _check_convertible(est)
    org_id = user.organization_id
    so = SalesOrder(
        organization_id=org_id,
        sales_order_number=numbering.next_number(db, org_id, "sales_order"),
        status="confirmed",
        created_by=user.id,
    )
    doc_flow.price(
        db,
        org_id,
        so,
        SalesOrderCreate(
            customer_id=est.customer_id,
            date=date.today(),
            reference=est.reference or est.estimate_number,
            subject=est.subject,
            salesperson=est.salesperson,
            discount_amount=est.discount_amount,
            notes=est.notes,
            terms=est.terms,
            lines=doc_flow.copy_lines(est),
        ),
        SALES_ORDER,
    )
    db.add(so)
    db.flush()
    est.sales_order_id = so.id
    est.status = "accepted"
    audit.record(db, user, "update", "estimate", est.id, f"Quote {est.estimate_number} converted to sales order {so.sales_order_number}")
    db.commit()
    return ConversionResult(kind="sales_order", id=so.id, number=so.sales_order_number)
