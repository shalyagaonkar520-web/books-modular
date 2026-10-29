"""Delivery challans: goods sent before the sale (Rule 55, CGST Rules), invoiced later.

A challan posts nothing to the ledger; the invoice it becomes does.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import module_write_error, require_write
from backend.models import User
from backend.routers.doc_routes import DocHooks, load, register_document_routes
from backend.routers.invoices import create_invoice_record
from backend.schemas.documents_flow import ConversionResult, ConvertRequest, DeliveryChallanCreate, DocumentOut, StatusChange
from backend.schemas.sales import InvoiceCreate
from backend.services import audit, doc_flow
from backend.services.doc_flow import DELIVERY_CHALLAN

router = APIRouter(prefix="/api/delivery-challans", tags=["Sales"])

_TRANSITIONS = {"issued": ("draft",), "draft": ("issued",), "void": ("draft", "issued")}


def _edit_error(dc) -> str | None:
    if dc.status == "invoiced":
        return "This delivery challan has been invoiced; void or delete the invoice first"
    if dc.status == "void":
        return "A void delivery challan cannot be edited"
    return None


def _delete_error(dc) -> str | None:
    return "This delivery challan has been invoiced; void or delete the invoice first" if dc.invoice_id else None


register_document_routes(router, DELIVERY_CHALLAN, DeliveryChallanCreate, DocHooks(edit_error=_edit_error, delete_error=_delete_error))


@router.post("/{doc_id}/status", response_model=DocumentOut)
def change_status(doc_id: str, payload: StatusChange, user: User = Depends(require_write), db: Session = Depends(get_db)):
    dc = load(db, DELIVERY_CHALLAN, doc_id, user.organization_id)
    allowed_from = _TRANSITIONS.get(payload.status)
    if allowed_from is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown delivery challan status '{payload.status}'")
    if dc.status not in allowed_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {dc.status} delivery challan cannot be marked {payload.status}")
    dc.status = payload.status
    audit.record(db, user, "update", "delivery_challan", dc.id, f"Delivery challan {dc.challan_number} marked {dc.status}")
    db.commit()
    return doc_flow.to_out(db, load(db, DELIVERY_CHALLAN, dc.id, user.organization_id), DELIVERY_CHALLAN)


@router.post("/{doc_id}/convert-to-invoice", response_model=ConversionResult)
def convert_to_invoice(doc_id: str, payload: ConvertRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    error = module_write_error(user, ("invoices",))
    if error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, error)
    dc = load(db, DELIVERY_CHALLAN, doc_id, user.organization_id)
    if dc.status not in ("draft", "issued"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {dc.status} delivery challan cannot be invoiced")
    inv = create_invoice_record(
        db,
        user,
        InvoiceCreate(
            customer_id=dc.customer_id,
            date=date.today(),
            reference=dc.reference or dc.challan_number,
            order_number=dc.challan_number,
            subject=dc.subject,
            discount_amount=dc.discount_amount,
            notes=dc.notes,
            terms=dc.terms,
            lines=doc_flow.copy_lines(dc),
            status="sent" if payload.issue else "draft",
        ),
    )
    dc.invoice_id = inv.id
    dc.status = "invoiced"
    audit.record(db, user, "update", "delivery_challan", dc.id, f"Delivery challan {dc.challan_number} invoiced as {inv.invoice_number}")
    db.commit()
    return ConversionResult(kind="invoice", id=inv.id, number=inv.invoice_number)
