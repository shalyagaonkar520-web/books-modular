"""Purchase orders: what was ordered from a vendor, billed when it arrives."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import module_write_error, require_write
from backend.models import User
from backend.routers.bills import create_bill_record
from backend.routers.doc_routes import DocHooks, load, register_document_routes
from backend.schemas.documents_flow import ConversionResult, ConvertRequest, DocumentOut, PurchaseOrderCreate, StatusChange
from backend.schemas.purchases import BillCreate
from backend.services import audit, doc_flow
from backend.services.doc_flow import PURCHASE_ORDER

router = APIRouter(prefix="/api/purchase-orders", tags=["Purchases"])

_TRANSITIONS = {"issued": ("draft",), "draft": ("issued",), "cancelled": ("draft", "issued")}


def _edit_error(po) -> str | None:
    if po.status == "billed":
        return "This purchase order has been billed; void or delete the bill first"
    if po.status == "cancelled":
        return "A cancelled purchase order cannot be edited"
    return None


def _delete_error(po) -> str | None:
    return "This purchase order has been billed; void or delete the bill first" if po.bill_id else None


register_document_routes(router, PURCHASE_ORDER, PurchaseOrderCreate, DocHooks(edit_error=_edit_error, delete_error=_delete_error))


@router.post("/{doc_id}/status", response_model=DocumentOut)
def change_status(doc_id: str, payload: StatusChange, user: User = Depends(require_write), db: Session = Depends(get_db)):
    po = load(db, PURCHASE_ORDER, doc_id, user.organization_id)
    allowed_from = _TRANSITIONS.get(payload.status)
    if allowed_from is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown purchase order status '{payload.status}'")
    if po.status not in allowed_from:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {po.status} purchase order cannot be marked {payload.status}")
    po.status = payload.status
    audit.record(db, user, "update", "purchase_order", po.id, f"Purchase order {po.purchase_order_number} marked {po.status}")
    db.commit()
    return doc_flow.to_out(db, load(db, PURCHASE_ORDER, po.id, user.organization_id), PURCHASE_ORDER)


@router.post("/{doc_id}/convert-to-bill", response_model=ConversionResult)
def convert_to_bill(doc_id: str, payload: ConvertRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    error = module_write_error(user, ("bills",))
    if error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, error)
    po = load(db, PURCHASE_ORDER, doc_id, user.organization_id)
    if po.status not in ("draft", "issued"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {po.status} purchase order cannot be billed")
    bill = create_bill_record(
        db,
        user,
        BillCreate(
            vendor_id=po.vendor_id,
            order_number=po.purchase_order_number,
            subject=po.subject,
            date=date.today(),
            discount_amount=po.discount_amount,
            notes=po.notes,
            lines=doc_flow.copy_lines(po),
            status="open" if payload.issue else "draft",
        ),
    )
    po.bill_id = bill.id
    po.status = "billed"
    audit.record(db, user, "update", "purchase_order", po.id, f"Purchase order {po.purchase_order_number} billed as {bill.bill_number}")
    db.commit()
    return ConversionResult(kind="bill", id=bill.id, number=bill.bill_number)
