"""Sales orders: confirmed customer orders, invoiced when delivered."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import module_write_error, require_write
from backend.models import User
from backend.routers.doc_routes import DocHooks, load, register_document_routes
from backend.routers.invoices import create_invoice_record
from backend.schemas.documents_flow import ConversionResult, ConvertRequest, DocumentOut, SalesOrderCreate, StatusChange
from backend.schemas.sales import InvoiceCreate
from backend.services import audit, doc_flow
from backend.services.doc_flow import SALES_ORDER

router = APIRouter(prefix="/api/sales-orders", tags=["Sales"])

_TRANSITIONS = {"confirmed": ("draft",), "draft": ("confirmed",), "void": ("draft", "confirmed")}


def _edit_error(so) -> str | None:
    if so.status == "invoiced":
        return "This sales order has been invoiced; void or delete the invoice first"
    if so.status == "void":
        return "A void sales order cannot be edited"
    return None


def _delete_error(so) -> str | None:
    return "This sales order has been invoiced; void or delete the invoice first" if so.invoice_id else None


register_document_routes(router, SALES_ORDER, SalesOrderCreate, DocHooks(edit_error=_edit_error, delete_error=_delete_error))


@router.post("/{doc_id}/status", response_model=DocumentOut)
def change_status(doc_id: str, payload: StatusChange, user: User = Depends(require_write), db: Session = Depends(get_db)):
    so = load(db, SALES_ORDER, doc_id, user.organization_id)
    allowed_from = _TRANSITIONS.get(payload.status)
    if allowed_from is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown sales order status '{payload.status}'")
    if so.status not in allowed_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {so.status} sales order cannot be marked {payload.status}")
    so.status = payload.status
    audit.record(db, user, "update", "sales_order", so.id, f"Sales order {so.sales_order_number} marked {so.status}")
    db.commit()
    return doc_flow.to_out(db, load(db, SALES_ORDER, so.id, user.organization_id), SALES_ORDER)


@router.post("/{doc_id}/convert-to-invoice", response_model=ConversionResult)
def convert_to_invoice(doc_id: str, payload: ConvertRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    error = module_write_error(user, ("invoices",))
    if error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, error)
    so = load(db, SALES_ORDER, doc_id, user.organization_id)
    if so.status not in ("draft", "confirmed"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {so.status} sales order cannot be invoiced")
    inv = create_invoice_record(
        db,
        user,
        InvoiceCreate(
            customer_id=so.customer_id,
            date=date.today(),
            reference=so.reference or so.sales_order_number,
            order_number=so.sales_order_number,
            subject=so.subject,
            salesperson=so.salesperson,
            discount_amount=so.discount_amount,
            notes=so.notes,
            terms=so.terms,
            lines=doc_flow.copy_lines(so),
            status="sent" if payload.issue else "draft",
        ),
    )
    so.invoice_id = inv.id
    so.status = "invoiced"
    audit.record(db, user, "update", "sales_order", so.id, f"Sales order {so.sales_order_number} invoiced as {inv.invoice_number}")
    db.commit()
    return ConversionResult(kind="invoice", id=inv.id, number=inv.invoice_number)
