"""Vendor credits: purchase returns and allowances, applied to bills or refunded."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import require_write
from backend.models import Bill, User, VendorCredit
from backend.routers.doc_routes import DocHooks, load, register_document_routes
from backend.schemas.documents_flow import ApplyCreditRequest, DocumentOut, RefundCreate, RefundOut, StatusChange, VendorCreditCreate
from backend.services import audit, credits, doc_flow
from backend.services.doc_flow import VENDOR_CREDIT
from backend.services.tenancy import get_or_404

router = APIRouter(prefix="/api/vendor-credits", tags=["Purchases"])


def _used_error(vc: VendorCredit) -> str | None:
    if vc.amount_applied > 0 or vc.amount_refunded > 0:
        return "This vendor credit has been applied or refunded; remove those first"
    return None


def _edit_error(vc: VendorCredit) -> str | None:
    if vc.status == "void":
        return "A void vendor credit cannot be edited"
    return _used_error(vc)


def _validate(db: Session, vc: VendorCredit, payload: VendorCreditCreate, org_id: str) -> None:
    vc.bill_id = None
    if not payload.bill_id:
        return
    bill = get_or_404(db, Bill, payload.bill_id, org_id, "Bill")
    if bill.vendor_id != vc.vendor_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The bill belongs to a different vendor")
    if bill.status in ("draft", "void"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A vendor credit cannot be raised against a {bill.status} bill")
    if vc.total > bill.total:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"The vendor credit total cannot exceed bill {bill.bill_number}'s total of {bill.total}"
        )
    vc.bill_id = bill.id


register_document_routes(
    router,
    VENDOR_CREDIT,
    VendorCreditCreate,
    DocHooks(
        posted_statuses=("open", "closed"),
        post=credits.post_vendor_credit,
        unpost=credits.unpost_vendor_credit,
        edit_error=_edit_error,
        delete_error=_used_error,
        validate=_validate,
    ),
)


@router.post("/{doc_id}/status", response_model=DocumentOut)
def change_status(doc_id: str, payload: StatusChange, user: User = Depends(require_write), db: Session = Depends(get_db)):
    vc = load(db, VENDOR_CREDIT, doc_id, user.organization_id)
    target = payload.status
    if target == "open":
        if vc.status != "draft":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only draft vendor credits can be opened")
        vc.status = "open"
        credits.post_vendor_credit(db, vc, user)
    elif target in ("void", "draft"):
        if target == "void" and vc.status == "void":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vendor credit is already void")
        if target == "draft" and vc.status != "open":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only open vendor credits can be reverted to draft")
        error = _used_error(vc)
        if error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, error)
        if vc.status in ("open", "closed"):
            credits.unpost_vendor_credit(db, vc, user, "Vendor credit voided" if target == "void" else "Vendor credit reverted to draft")
        vc.status = target
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown vendor credit status '{target}'")
    audit.record(db, user, "update", "vendor_credit", vc.id, f"Vendor credit {vc.vendor_credit_number} marked {vc.status}")
    db.commit()
    return doc_flow.to_out(db, load(db, VENDOR_CREDIT, vc.id, user.organization_id), VENDOR_CREDIT)


@router.post("/{doc_id}/apply", response_model=DocumentOut)
def apply_to_bills(doc_id: str, payload: ApplyCreditRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Use the vendor credit's remaining balance to settle one or more of the vendor's bills."""
    org_id = user.organization_id
    vc = load(db, VENDOR_CREDIT, doc_id, org_id)
    for line in payload.applications:
        bill = get_or_404(db, Bill, line.document_id, org_id, "Bill")
        credits.apply_vendor_credit(db, vc, bill, line.amount, payload.date, user)
    db.commit()
    return doc_flow.to_out(db, load(db, VENDOR_CREDIT, vc.id, org_id), VENDOR_CREDIT)


@router.post("/{doc_id}/refunds", response_model=RefundOut, status_code=status.HTTP_201_CREATED)
def refund(doc_id: str, payload: RefundCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Record money the vendor paid back against this credit."""
    vc = load(db, VENDOR_CREDIT, doc_id, user.organization_id)
    record = credits.record_refund(db, user, "vendor", vc.vendor, payload, vendor_credit=vc)
    db.commit()
    db.refresh(record)
    return doc_flow.refund_out(record)
