"""Payments received from customers and payments made to vendors."""
from __future__ import annotations

import json
import secrets
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import require_full_app_access, require_write
from backend.models import (
    BankAccount,
    Bill,
    Contact,
    CustomerPayment,
    ExternalPayment,
    Invoice,
    Organization,
    User,
    VendorPayment,
)
from backend.schemas.common import APIModel, Message, Page
from backend.schemas.purchases import VendorPaymentCreate, VendorPaymentOut
from backend.schemas.sales import CustomerPaymentCreate, CustomerPaymentOut
from backend.services import audit, bank, export_service, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.email_service import (
    send_customer_payment_email,
    send_payment_confirmation_request_email,
    send_vendor_payment_email,
    sender_identity,
)
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api", tags=["Payments"])


class SendPaymentEmailRequest(BaseModel):
    to_email: str
    custom_notes: Optional[str] = None
    attach_pdf: bool = True




def _refresh_invoice_status(inv: Invoice) -> None:
    if inv.status == "void":
        return
    paid = money(inv.amount_paid)
    if paid <= 0:
        inv.status = "sent" if inv.status in ("paid", "partially_paid") else inv.status
    elif paid >= money(inv.total):
        inv.status = "paid"
    else:
        inv.status = "partially_paid"


def _refresh_bill_status(bill: Bill) -> None:
    if bill.status == "void":
        return
    paid = money(bill.amount_paid)
    if paid <= 0:
        bill.status = "open" if bill.status in ("paid", "partially_paid") else bill.status
    elif paid >= money(bill.total):
        bill.status = "paid"
    else:
        bill.status = "partially_paid"


# --------------------------------------------------------------------------- #
# Customer payments
# --------------------------------------------------------------------------- #
def cp_out(p: CustomerPayment) -> CustomerPaymentOut:
    return CustomerPaymentOut(
        id=p.id,
        payment_number=p.payment_number,
        customer_id=p.customer_id,
        customer_name=p.customer.display_name,
        invoice_id=p.invoice_id,
        invoice_number=p.invoice.invoice_number if p.invoice else None,
        bank_account_id=p.bank_account_id,
        bank_account_name=p.bank_account.name,
        date=p.date,
        amount=p.amount,
        mode=p.mode,
        reference=p.reference,
        notes=p.notes,
        created_at=p.created_at,
    )


@router.get("/customer-payments", response_model=Page[CustomerPaymentOut])
def list_customer_payments(
    customer_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(require_full_app_access),
    db: Session = Depends(get_db),
):
    stmt = select(CustomerPayment).where(CustomerPayment.organization_id == user.organization_id).options(
        selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account)
    )
    if customer_id:
        stmt = stmt.where(CustomerPayment.customer_id == customer_id)
    if invoice_id:
        stmt = stmt.where(CustomerPayment.invoice_id == invoice_id)
    if start_date:
        stmt = stmt.where(CustomerPayment.date >= start_date)
    if end_date:
        stmt = stmt.where(CustomerPayment.date <= end_date)
    stmt = stmt.order_by(CustomerPayment.date.desc(), CustomerPayment.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[cp_out(p) for p in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/customer-payments/export/pdf")
def export_customer_payments_pdf(
    customer_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(require_full_app_access),
    db: Session = Depends(get_db),
):
    """Export Customer Payments Received registry to PDF."""
    stmt = select(CustomerPayment).where(CustomerPayment.organization_id == user.organization_id).options(
        selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account)
    )
    if customer_id:
        stmt = stmt.where(CustomerPayment.customer_id == customer_id)
    if start_date:
        stmt = stmt.where(CustomerPayment.date >= start_date)
    if end_date:
        stmt = stmt.where(CustomerPayment.date <= end_date)
    stmt = stmt.order_by(CustomerPayment.date.desc(), CustomerPayment.created_at.desc()).limit(500)
    payments = db.execute(stmt).scalars().all()
    org = db.get(Organization, user.organization_id)
    pdf_bytes = export_service.generate_customer_payments_list_pdf(payments, org)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="customer_payments.pdf"'},
    )


@router.get("/customer-payments/export/excel")
def export_customer_payments_excel(
    customer_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(require_full_app_access),
    db: Session = Depends(get_db),
):
    """Export Customer Payments Received registry to Excel."""
    stmt = select(CustomerPayment).where(CustomerPayment.organization_id == user.organization_id).options(
        selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account)
    )
    if customer_id:
        stmt = stmt.where(CustomerPayment.customer_id == customer_id)
    if start_date:
        stmt = stmt.where(CustomerPayment.date >= start_date)
    if end_date:
        stmt = stmt.where(CustomerPayment.date <= end_date)
    stmt = stmt.order_by(CustomerPayment.date.desc(), CustomerPayment.created_at.desc()).limit(500)
    payments = db.execute(stmt).scalars().all()
    org = db.get(Organization, user.organization_id)
    excel_bytes = export_service.generate_customer_payments_list_excel(payments, org)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="customer_payments.xlsx"'},
    )


@router.post("/customer-payments", response_model=CustomerPaymentOut, status_code=status.HTTP_201_CREATED)
def create_customer_payment(payload: CustomerPaymentCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    org_id = user.organization_id
    customer = get_or_404(db, Contact, payload.customer_id, org_id, "Customer")
    if customer.type != "customer":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a customer")
    bank_acct = get_or_404(db, BankAccount, payload.bank_account_id, org_id, "Bank account")
    amount = money(payload.amount)
    invoice = None
    if payload.invoice_id:
        invoice = get_or_404(db, Invoice, payload.invoice_id, org_id, "Invoice")
        if invoice.customer_id != customer.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoice belongs to a different customer")
        if invoice.status not in ("sent", "partially_paid"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payments can only be applied to sent invoices (current status: {invoice.status})")
        if amount > money(invoice.balance_due):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment exceeds the invoice balance of {invoice.balance_due}")
    payment = CustomerPayment(
        organization_id=org_id,
        payment_number=numbering.next_number(db, org_id, "customer_payment"),
        customer_id=customer.id,
        invoice_id=invoice.id if invoice else None,
        bank_account_id=bank_acct.id,
        date=payload.date,
        amount=amount,
        mode=payload.mode,
        reference=payload.reference,
        notes=payload.notes,
        created_by=user.id,
    )
    db.add(payment)
    db.flush()

    ar = get_account_by_code(db, org_id, "1100")
    unearned = get_account_by_code(db, org_id, "2400")
    credit_account = ar.id if invoice else unearned.id  # unapplied payments sit as customer advances
    desc = f"Payment {payment.payment_number} from {customer.display_name}" + (f" for {invoice.invoice_number}" if invoice else "")
    entry = ledger.post_entry(
        db, org_id, payment.date,
        [(bank_acct.ledger_account_id, amount, Decimal("0"), desc, customer.id), (credit_account, Decimal("0"), amount, desc, customer.id)],
        "customer_payment", payment.id, reference=payment.reference or payment.payment_number, created_by=user.id,
    )
    bank.record_movement(db, bank_acct, payment.date, "deposit", amount, desc, "customer_payment", payment.id, user.id, payment.reference, credit_account, entry.id)

    if invoice:
        invoice.amount_paid = money(invoice.amount_paid) + amount
        _refresh_invoice_status(invoice)
    audit.record(db, user, "create", "customer_payment", payment.id, desc)
    db.commit()
    db.refresh(payment)
    return cp_out(payment)


@router.delete("/customer-payments/{payment_id}", response_model=Message)
def delete_customer_payment(payment_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    payment = get_or_404(db, CustomerPayment, payment_id, user.organization_id, "Payment")
    ledger.reverse_entries_for_source(db, user.organization_id, "customer_payment", payment.id, date.today(), user.id, "Payment deleted")
    bank.remove_movements(db, "customer_payment", payment.id)
    if payment.invoice:
        payment.invoice.amount_paid = money(payment.invoice.amount_paid) - money(payment.amount)
        _refresh_invoice_status(payment.invoice)
    number = payment.payment_number
    db.delete(payment)
    audit.record(db, user, "delete", "customer_payment", payment_id, f"Deleted payment {number}")
    db.commit()
    return Message(message=f"Payment {number} deleted and reversed")


@router.get("/customer-payments/{payment_id}/pdf")
def download_customer_payment_pdf(payment_id: str, user: User = Depends(require_full_app_access), db: Session = Depends(get_db)):
    """Download single Customer Payment receipt as PDF."""
    stmt = select(CustomerPayment).where(CustomerPayment.id == payment_id, CustomerPayment.organization_id == user.organization_id).options(
        selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account)
    )
    payment = db.execute(stmt).scalar_one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer payment not found")
    org = db.get(Organization, user.organization_id)
    pdf_bytes = export_service.generate_customer_payment_pdf(payment, org)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Receipt-{payment.payment_number}.pdf"'},
    )


@router.post("/customer-payments/{payment_id}/send-gmail")
def send_customer_payment_receipt_gmail(
    payment_id: str,
    payload: SendPaymentEmailRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Send payment confirmation receipt to customer via Gmail SMTP."""
    stmt = select(CustomerPayment).where(CustomerPayment.id == payment_id, CustomerPayment.organization_id == user.organization_id).options(
        selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account)
    )
    payment = db.execute(stmt).scalar_one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer payment not found")
    org = db.get(Organization, user.organization_id)
    pdf_bytes = export_service.generate_customer_payment_pdf(payment, org) if payload.attach_pdf else None

    result = send_customer_payment_email(
        to_email=payload.to_email,
        customer_name=payment.customer.display_name if payment.customer else "Valued Customer",
        payment_number=payment.payment_number,
        amount=float(payment.amount),
        payment_date=payment.date.strftime("%d %b %Y") if payment.date else "",
        payment_mode=payment.mode,
        reference=payment.reference,
        custom_notes=payload.custom_notes,
        pdf_bytes=pdf_bytes,
        pdf_filename=f"Receipt_{payment.payment_number}.pdf",
    )
    if not result.get("success"):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Gmail SMTP error: {result.get('error')}")
    audit.record(db, user, "email", "customer_payment", payment.id, f"Emailed receipt {payment.payment_number} to {payload.to_email}")
    db.commit()
    return result


# --------------------------------------------------------------------------- #
# Vendor payments
# --------------------------------------------------------------------------- #
def vp_out(p: VendorPayment) -> VendorPaymentOut:
    return VendorPaymentOut(
        id=p.id,
        payment_number=p.payment_number,
        vendor_id=p.vendor_id,
        vendor_name=p.vendor.display_name,
        bill_id=p.bill_id,
        bill_number=p.bill.bill_number if p.bill else None,
        bank_account_id=p.bank_account_id,
        bank_account_name=p.bank_account.name,
        date=p.date,
        amount=p.amount,
        mode=p.mode,
        reference=p.reference,
        notes=p.notes,
        created_at=p.created_at,
    )


@router.get("/vendor-payments", response_model=Page[VendorPaymentOut])
def list_vendor_payments(
    vendor_id: Optional[str] = None,
    bill_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(require_full_app_access),
    db: Session = Depends(get_db),
):
    stmt = select(VendorPayment).where(VendorPayment.organization_id == user.organization_id).options(
        selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account)
    )
    if vendor_id:
        stmt = stmt.where(VendorPayment.vendor_id == vendor_id)
    if bill_id:
        stmt = stmt.where(VendorPayment.bill_id == bill_id)
    if start_date:
        stmt = stmt.where(VendorPayment.date >= start_date)
    if end_date:
        stmt = stmt.where(VendorPayment.date <= end_date)
    stmt = stmt.order_by(VendorPayment.date.desc(), VendorPayment.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[vp_out(p) for p in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/vendor-payments/export/pdf")
def export_vendor_payments_pdf(
    vendor_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(require_full_app_access),
    db: Session = Depends(get_db),
):
    """Export Vendor Payments Made registry to PDF."""
    stmt = select(VendorPayment).where(VendorPayment.organization_id == user.organization_id).options(
        selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account)
    )
    if vendor_id:
        stmt = stmt.where(VendorPayment.vendor_id == vendor_id)
    if start_date:
        stmt = stmt.where(VendorPayment.date >= start_date)
    if end_date:
        stmt = stmt.where(VendorPayment.date <= end_date)
    stmt = stmt.order_by(VendorPayment.date.desc(), VendorPayment.created_at.desc()).limit(500)
    payments = db.execute(stmt).scalars().all()
    org = db.get(Organization, user.organization_id)
    pdf_bytes = export_service.generate_vendor_payments_list_pdf(payments, org)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="vendor_payments.pdf"'},
    )


@router.get("/vendor-payments/export/excel")
def export_vendor_payments_excel(
    vendor_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(require_full_app_access),
    db: Session = Depends(get_db),
):
    """Export Vendor Payments Made registry to Excel."""
    stmt = select(VendorPayment).where(VendorPayment.organization_id == user.organization_id).options(
        selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account)
    )
    if vendor_id:
        stmt = stmt.where(VendorPayment.vendor_id == vendor_id)
    if start_date:
        stmt = stmt.where(VendorPayment.date >= start_date)
    if end_date:
        stmt = stmt.where(VendorPayment.date <= end_date)
    stmt = stmt.order_by(VendorPayment.date.desc(), VendorPayment.created_at.desc()).limit(500)
    payments = db.execute(stmt).scalars().all()
    org = db.get(Organization, user.organization_id)
    excel_bytes = export_service.generate_vendor_payments_list_excel(payments, org)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="vendor_payments.xlsx"'},
    )


@router.post("/vendor-payments", response_model=VendorPaymentOut, status_code=status.HTTP_201_CREATED)
def create_vendor_payment(payload: VendorPaymentCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    org_id = user.organization_id
    vendor = get_or_404(db, Contact, payload.vendor_id, org_id, "Vendor")
    if vendor.type != "vendor":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a vendor")
    bank_acct = get_or_404(db, BankAccount, payload.bank_account_id, org_id, "Bank account")
    amount = money(payload.amount)
    bill = None
    if payload.bill_id:
        bill = get_or_404(db, Bill, payload.bill_id, org_id, "Bill")
        if bill.vendor_id != vendor.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bill belongs to a different vendor")
        if bill.status not in ("open", "partially_paid"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payments can only be applied to open bills (current status: {bill.status})")
        if amount > money(bill.balance_due):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment exceeds the bill balance of {bill.balance_due}")
    payment = VendorPayment(
        organization_id=org_id,
        payment_number=numbering.next_number(db, org_id, "vendor_payment"),
        vendor_id=vendor.id,
        bill_id=bill.id if bill else None,
        bank_account_id=bank_acct.id,
        date=payload.date,
        amount=amount,
        mode=payload.mode,
        reference=payload.reference,
        notes=payload.notes,
        created_by=user.id,
    )
    db.add(payment)
    db.flush()

    ap = get_account_by_code(db, org_id, "2000")
    prepaid = get_account_by_code(db, org_id, "1400")
    debit_account = ap.id if bill else prepaid.id  # advances to vendors
    desc = f"Payment {payment.payment_number} to {vendor.display_name}" + (f" for {bill.bill_number}" if bill else "")
    entry = ledger.post_entry(
        db, org_id, payment.date,
        [(debit_account, amount, Decimal("0"), desc, vendor.id), (bank_acct.ledger_account_id, Decimal("0"), amount, desc, vendor.id)],
        "vendor_payment", payment.id, reference=payment.reference or payment.payment_number, created_by=user.id,
    )
    bank.record_movement(db, bank_acct, payment.date, "withdrawal", amount, desc, "vendor_payment", payment.id, user.id, payment.reference, debit_account, entry.id)

    if bill:
        bill.amount_paid = money(bill.amount_paid) + amount
        _refresh_bill_status(bill)
    audit.record(db, user, "create", "vendor_payment", payment.id, desc)
    db.commit()
    db.refresh(payment)
    return vp_out(payment)


@router.delete("/vendor-payments/{payment_id}", response_model=Message)
def delete_vendor_payment(payment_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    payment = get_or_404(db, VendorPayment, payment_id, user.organization_id, "Payment")
    ledger.reverse_entries_for_source(db, user.organization_id, "vendor_payment", payment.id, date.today(), user.id, "Payment deleted")
    bank.remove_movements(db, "vendor_payment", payment.id)
    if payment.bill:
        payment.bill.amount_paid = money(payment.bill.amount_paid) - money(payment.amount)
        _refresh_bill_status(payment.bill)
    number = payment.payment_number
    db.delete(payment)
    audit.record(db, user, "delete", "vendor_payment", payment_id, f"Deleted payment {number}")
    db.commit()
    return Message(message=f"Payment {number} deleted and reversed")


@router.get("/vendor-payments/{payment_id}/pdf")
def download_vendor_payment_pdf(payment_id: str, user: User = Depends(require_full_app_access), db: Session = Depends(get_db)):
    """Download single Vendor Payment remittance advice as PDF."""
    stmt = select(VendorPayment).where(VendorPayment.id == payment_id, VendorPayment.organization_id == user.organization_id).options(
        selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account)
    )
    payment = db.execute(stmt).scalar_one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor payment not found")
    org = db.get(Organization, user.organization_id)
    pdf_bytes = export_service.generate_vendor_payment_pdf(payment, org)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Remittance-{payment.payment_number}.pdf"'},
    )


@router.post("/vendor-payments/{payment_id}/send-gmail")
def send_vendor_payment_remittance_gmail(
    payment_id: str,
    payload: SendPaymentEmailRequest,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Send payment remittance advice to vendor via Gmail SMTP."""
    stmt = select(VendorPayment).where(VendorPayment.id == payment_id, VendorPayment.organization_id == user.organization_id).options(
        selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account)
    )
    payment = db.execute(stmt).scalar_one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor payment not found")
    org = db.get(Organization, user.organization_id)
    pdf_bytes = export_service.generate_vendor_payment_pdf(payment, org) if payload.attach_pdf else None

    result = send_vendor_payment_email(
        to_email=payload.to_email,
        vendor_name=payment.vendor.display_name if payment.vendor else "Vendor",
        payment_number=payment.payment_number,
        amount=float(payment.amount),
        payment_date=payment.date.strftime("%d %b %Y") if payment.date else "",
        payment_mode=payment.mode,
        reference=payment.reference,
        custom_notes=payload.custom_notes,
        pdf_bytes=pdf_bytes,
        pdf_filename=f"Remittance_{payment.payment_number}.pdf",
    )
    if not result.get("success"):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Gmail SMTP error: {result.get('error')}")
    audit.record(db, user, "email", "vendor_payment", payment.id, f"Emailed remittance {payment.payment_number} to {payload.to_email}")
    db.commit()
    return result


# --------------------------------------------------------------------------- #
# External Payments & Gmail SMTP YES/NO Confirmation Flow
# --------------------------------------------------------------------------- #
class IncomingExternalPayment(APIModel):
    platform: str = "upi"
    external_transaction_id: str
    amount: Decimal
    currency: str = "INR"
    payer_name: Optional[str] = None
    payer_email: Optional[str] = None
    payer_phone: Optional[str] = None
    invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None
    customer_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    organization_id: Optional[str] = None
    notes: Optional[str] = None
    raw_payload: Optional[Dict[str, Any]] = None
    recipient_email: Optional[str] = None
    base_url: Optional[str] = None


class ExternalPaymentOut(APIModel):
    id: str
    platform: str
    external_transaction_id: str
    amount: Decimal
    currency: str
    payer_name: Optional[str] = None
    payer_email: Optional[str] = None
    payer_phone: Optional[str] = None
    invoice_id: Optional[str] = None
    customer_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    status: str
    approval_token: str
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    rejection_reason: Optional[str] = None
    customer_payment_id: Optional[str] = None
    confirmation_email_sent: bool
    confirmation_email_recipient: Optional[str] = None
    created_at: datetime


def ext_out(p: ExternalPayment) -> ExternalPaymentOut:
    return ExternalPaymentOut(
        id=p.id,
        platform=p.platform,
        external_transaction_id=p.external_transaction_id,
        amount=p.amount,
        currency=p.currency,
        payer_name=p.payer_name,
        payer_email=p.payer_email,
        payer_phone=p.payer_phone,
        invoice_id=p.invoice_id,
        customer_id=p.customer_id,
        bank_account_id=p.bank_account_id,
        status=p.status,
        approval_token=p.approval_token,
        approved_at=p.approved_at,
        approved_by=p.approved_by,
        rejection_reason=p.rejection_reason,
        customer_payment_id=p.customer_payment_id,
        confirmation_email_sent=p.confirmation_email_sent,
        confirmation_email_recipient=p.confirmation_email_recipient,
        created_at=p.created_at,
    )


def process_approved_external_payment(
    db: Session,
    ext_pay: ExternalPayment,
    approved_by: str = "Gmail SMTP Confirmation",
) -> CustomerPayment:
    org_id = ext_pay.organization_id

    # 1. Resolve Customer
    customer = None
    if ext_pay.customer_id:
        customer = db.get(Contact, ext_pay.customer_id)
    if not customer and ext_pay.invoice_id:
        inv = db.get(Invoice, ext_pay.invoice_id)
        if inv:
            customer = db.get(Contact, inv.customer_id)
    if not customer and ext_pay.payer_email:
        customer = db.execute(
            select(Contact).where(Contact.organization_id == org_id, Contact.email == ext_pay.payer_email)
        ).scalar_one_or_none()
    if not customer and ext_pay.payer_name:
        customer = db.execute(
            select(Contact).where(Contact.organization_id == org_id, Contact.display_name == ext_pay.payer_name)
        ).scalar_one_or_none()
    if not customer:
        customer = Contact(
            organization_id=org_id,
            display_name=ext_pay.payer_name or f"Customer ({ext_pay.external_transaction_id})",
            email=ext_pay.payer_email,
            phone=ext_pay.payer_phone,
            type="customer",
        )
        db.add(customer)
        db.flush()

    # 2. Resolve Bank Account
    bank_acct = None
    if ext_pay.bank_account_id:
        bank_acct = db.get(BankAccount, ext_pay.bank_account_id)
    if not bank_acct:
        bank_acct = db.execute(
            select(BankAccount).where(BankAccount.organization_id == org_id).order_by(BankAccount.is_active.desc())
        ).scalars().first()
    if not bank_acct:
        from backend.models import Account
        op_account = db.execute(select(Account).where(Account.organization_id == org_id, Account.code == "1000")).scalar_one_or_none()
        if not op_account:
            op_account = Account(organization_id=org_id, code="1000", name="Main Operating Account", type="bank")
            db.add(op_account)
            db.flush()
        bank_acct = BankAccount(
            organization_id=org_id,
            name="Main Bank Account",
            account_number="HDFC-AUTO-01",
            ledger_account_id=op_account.id,
            currency=ext_pay.currency or "INR",
        )
        db.add(bank_acct)
        db.flush()

    amount = money(ext_pay.amount)
    invoice = None
    if ext_pay.invoice_id:
        invoice = db.get(Invoice, ext_pay.invoice_id)
        if invoice and invoice.organization_id != org_id:
            invoice = None

    # 3. Create Internal CustomerPayment
    payment = CustomerPayment(
        organization_id=org_id,
        payment_number=numbering.next_number(db, org_id, "customer_payment"),
        customer_id=customer.id,
        invoice_id=invoice.id if invoice else None,
        bank_account_id=bank_acct.id,
        date=date.today(),
        amount=amount,
        mode=ext_pay.platform or "external",
        reference=ext_pay.external_transaction_id,
        notes=f"External {ext_pay.platform.upper()} payment confirmed via Gmail SMTP. Ref: {ext_pay.external_transaction_id}",
        created_by="system",
    )
    db.add(payment)
    db.flush()

    # 4. Post Ledger & Bank Movement
    ar = get_account_by_code(db, org_id, "1100")
    unearned = get_account_by_code(db, org_id, "2400")
    credit_account = ar.id if invoice else unearned.id
    desc = f"Payment {payment.payment_number} ({ext_pay.platform.upper()}) from {customer.display_name}" + (f" for {invoice.invoice_number}" if invoice else "")
    entry = ledger.post_entry(
        db, org_id, payment.date,
        [(bank_acct.ledger_account_id, amount, Decimal("0"), desc, customer.id), (credit_account, Decimal("0"), amount, desc, customer.id)],
        "customer_payment", payment.id, reference=payment.reference or payment.payment_number, created_by="system",
    )
    bank.record_movement(db, bank_acct, payment.date, "deposit", amount, desc, "customer_payment", payment.id, "system", payment.reference, credit_account, entry.id)

    if invoice:
        invoice.amount_paid = money(invoice.amount_paid) + amount
        _refresh_invoice_status(invoice)

    # 5. Mark ExternalPayment as approved
    ext_pay.status = "approved"
    ext_pay.approved_at = datetime.now(UTC)
    ext_pay.approved_by = approved_by
    ext_pay.customer_payment_id = payment.id
    ext_pay.customer_id = customer.id
    ext_pay.bank_account_id = bank_acct.id
    if invoice:
        ext_pay.invoice_id = invoice.id

    db.commit()
    db.refresh(payment)
    db.refresh(ext_pay)
    return payment


@router.post("/payments/external/incoming", status_code=status.HTTP_201_CREATED)
def receive_external_payment(
    payload: IncomingExternalPayment,
    request: Request,
    db: Session = Depends(get_db),
):
    """Universal intake endpoint for payments from ANY outside platform (UPI, bank transfer, card gateway, wallet, etc.).
    Records payment in pending confirmation state and dispatches confirmation email via Gmail SMTP.
    """
    # 1. Resolve Organization
    org_id = payload.organization_id
    invoice = None
    if not org_id and payload.invoice_id:
        invoice = db.get(Invoice, payload.invoice_id)
        if invoice:
            org_id = invoice.organization_id
    if not org_id and payload.invoice_number:
        invoice = db.execute(select(Invoice).where(Invoice.invoice_number == payload.invoice_number)).scalar_one_or_none()
        if invoice:
            org_id = invoice.organization_id
    if not org_id and payload.customer_id:
        cust = db.get(Contact, payload.customer_id)
        if cust:
            org_id = cust.organization_id
    if not org_id:
        org = db.execute(select(Organization)).scalars().first()
        if org:
            org_id = org.id
        else:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization found in database")

    # Match invoice if provided
    if not invoice and payload.invoice_id:
        invoice = db.get(Invoice, payload.invoice_id)
    if not invoice and payload.invoice_number:
        invoice = db.execute(
            select(Invoice).where(Invoice.organization_id == org_id, Invoice.invoice_number == payload.invoice_number)
        ).scalar_one_or_none()

    approval_token = secrets.token_urlsafe(32)

    ext_payment = ExternalPayment(
        organization_id=org_id,
        platform=payload.platform.lower(),
        external_transaction_id=payload.external_transaction_id,
        amount=money(payload.amount),
        currency=payload.currency or "INR",
        payer_name=payload.payer_name or (invoice.customer.display_name if invoice and invoice.customer else None),
        payer_email=payload.payer_email or (invoice.customer.email if invoice and invoice.customer else None),
        payer_phone=payload.payer_phone,
        invoice_id=invoice.id if invoice else None,
        customer_id=payload.customer_id or (invoice.customer_id if invoice else None),
        bank_account_id=payload.bank_account_id,
        status="pending_confirmation",
        approval_token=approval_token,
        raw_payload=json.dumps(payload.raw_payload) if payload.raw_payload else None,
        notes=payload.notes,
    )
    db.add(ext_payment)
    db.commit()
    db.refresh(ext_payment)

    base_url = payload.base_url
    if not base_url:
        req_base = str(request.base_url).rstrip("/")
        base_url = req_base if req_base else "http://localhost:8000"

    recipient = payload.recipient_email or sender_identity()[1]
    email_result = send_payment_confirmation_request_email(
        to_email=recipient,
        payment_id=ext_payment.id,
        platform=ext_payment.platform,
        amount=float(ext_payment.amount),
        currency=ext_payment.currency,
        external_transaction_id=ext_payment.external_transaction_id,
        approval_token=ext_payment.approval_token,
        payer_name=ext_payment.payer_name,
        payer_email=ext_payment.payer_email,
        invoice_number=invoice.invoice_number if invoice else None,
        base_url=base_url,
    )

    ext_payment.confirmation_email_sent = email_result.get("success", False)
    ext_payment.confirmation_email_recipient = recipient
    db.commit()

    return {
        "success": True,
        "message": "External payment received. Confirmation request dispatched via Gmail SMTP.",
        "external_payment_id": ext_payment.id,
        "platform": ext_payment.platform,
        "external_transaction_id": ext_payment.external_transaction_id,
        "amount": float(ext_payment.amount),
        "status": ext_payment.status,
        "approval_token": ext_payment.approval_token,
        "email_dispatched": ext_payment.confirmation_email_sent,
        "email_recipient": recipient,
        "email_details": email_result,
    }


@router.get("/payments/external/confirm", response_class=HTMLResponse)
def confirm_external_payment_from_email(
    token: str = Query(..., description="Approval token from Gmail confirmation email"),
    decision: str = Query(..., description="yes or no"),
    db: Session = Depends(get_db),
):
    """Processes 1-click YES or NO confirmation directly from the Gmail SMTP email."""
    ext_pay = db.execute(
        select(ExternalPayment).where(ExternalPayment.approval_token == token)
    ).scalar_one_or_none()

    if not ext_pay:
        return HTMLResponse(
            status_code=404,
            content="""<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;">
            <h2 style="color:#ef4444;">Invalid or Expired Link</h2>
            <p>The payment confirmation token was not found or has expired.</p>
            </body></html>"""
        )

    formatted_amount = f"₹{ext_pay.amount:,.2f}" if ext_pay.currency == "INR" else f"{ext_pay.currency} {ext_pay.amount:,.2f}"
    decision_clean = decision.strip().lower()

    if decision_clean == "yes":
        if ext_pay.status == "approved":
            return HTMLResponse(content=f"""<!DOCTYPE html><html><head><title>Already Approved</title><style>body{{font-family:sans-serif;background:#f8fafc;padding:40px;display:flex;justify-content:center;}}.card{{background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:500px;text-align:center;}}</style></head><body><div class="card"><h2 style="color:#16a34a;">Payment Already Approved</h2><p>This {ext_pay.platform.upper()} transaction of <strong>{formatted_amount}</strong> (Ref: {ext_pay.external_transaction_id}) has already been approved and recorded in Rooman Books.</p></div></body></html>""")
        if ext_pay.status == "rejected":
            return HTMLResponse(content="""<!DOCTYPE html><html><head><title>Previously Rejected</title><style>body{font-family:sans-serif;background:#f8fafc;padding:40px;display:flex;justify-content:center;}.card{background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:500px;text-align:center;}</style></head><body><div class="card"><h2 style="color:#dc2626;">Payment Previously Rejected</h2><p>This transaction was already marked as rejected.</p></div></body></html>""")

        cust_payment = process_approved_external_payment(db, ext_pay, approved_by="Gmail SMTP 1-Click Action")

        return HTMLResponse(content=f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payment Approved - Rooman Books</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; margin: 0; padding: 40px 16px; color: #1e293b; display: flex; justify-content: center; align-items: center; min-height: 80vh; }}
    .card {{ background: #ffffff; max-width: 520px; width: 100%; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); overflow: hidden; text-align: center; }}
    .status-header {{ background: #16a34a; color: white; padding: 32px 24px; }}
    .icon {{ font-size: 48px; margin-bottom: 8px; }}
    .status-title {{ font-size: 24px; font-weight: 800; margin: 0; }}
    .status-subtitle {{ font-size: 14px; opacity: 0.9; margin: 6px 0 0 0; }}
    .body-content {{ padding: 32px 24px; text-align: left; }}
    .info-row {{ display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }}
    .info-lbl {{ color: #64748b; font-weight: 500; }}
    .info-val {{ color: #0f172a; font-weight: 700; }}
    .footer-note {{ background: #f8fafc; padding: 16px 24px; font-size: 13px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="status-header">
      <div class="icon">✅</div>
      <h1 class="status-title">Payment Approved & Recorded</h1>
      <p class="status-subtitle">Transaction successfully confirmed into Rooman Books</p>
    </div>
    <div class="body-content">
      <div class="info-row">
        <span class="info-lbl">Amount Confirmed:</span>
        <span class="info-val" style="color: #16a34a; font-size: 16px;">{formatted_amount}</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">Origin Platform:</span>
        <span class="info-val">{ext_pay.platform.upper()}</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">Transaction Ref / UTR:</span>
        <span class="info-val"><code>{ext_pay.external_transaction_id}</code></span>
      </div>
      <div class="info-row">
        <span class="info-lbl">Rooman Voucher #:</span>
        <span class="info-val">{cust_payment.payment_number}</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">General Ledger:</span>
        <span class="info-val" style="color: #2563eb;">Posted (Bank & Accounts Updated)</span>
      </div>
    </div>
    <div class="footer-note">
      Confirmed via Gmail SMTP &bull; Rooman Technologies Accounts Desk
    </div>
  </div>
</body>
</html>
""")

    elif decision_clean == "no":
        if ext_pay.status == "rejected":
            return HTMLResponse(content="""<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2 style="color:#dc2626;">Payment Already Rejected</h2><p>This transaction was already marked as rejected.</p></body></html>""")
        if ext_pay.status == "approved":
            return HTMLResponse(content="""<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2 style="color:#ef4444;">Cannot Reject</h2><p>This payment has already been approved and committed to the financial ledger.</p></body></html>""")

        ext_pay.status = "rejected"
        ext_pay.rejection_reason = "Rejected via Gmail SMTP confirmation link"
        db.commit()

        return HTMLResponse(content=f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payment Rejected - Rooman Books</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; margin: 0; padding: 40px 16px; color: #1e293b; display: flex; justify-content: center; align-items: center; min-height: 80vh; }}
    .card {{ background: #ffffff; max-width: 520px; width: 100%; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); overflow: hidden; text-align: center; }}
    .status-header {{ background: #dc2626; color: white; padding: 32px 24px; }}
    .icon {{ font-size: 48px; margin-bottom: 8px; }}
    .status-title {{ font-size: 24px; font-weight: 800; margin: 0; }}
    .status-subtitle {{ font-size: 14px; opacity: 0.9; margin: 6px 0 0 0; }}
    .body-content {{ padding: 32px 24px; text-align: left; }}
    .info-row {{ display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }}
    .info-lbl {{ color: #64748b; font-weight: 500; }}
    .info-val {{ color: #0f172a; font-weight: 700; }}
    .footer-note {{ background: #f8fafc; padding: 16px 24px; font-size: 13px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="status-header">
      <div class="icon">❌</div>
      <h1 class="status-title">Payment Rejected & Discarded</h1>
      <p class="status-subtitle">Transaction has been marked as rejected</p>
    </div>
    <div class="body-content">
      <div class="info-row">
        <span class="info-lbl">Amount Discarded:</span>
        <span class="info-val">{formatted_amount}</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">Platform:</span>
        <span class="info-val">{ext_pay.platform.upper()}</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">Transaction Ref / UTR:</span>
        <span class="info-val"><code>{ext_pay.external_transaction_id}</code></span>
      </div>
      <div class="info-row">
        <span class="info-lbl">Status:</span>
        <span class="info-val" style="color: #dc2626;">Rejected</span>
      </div>
      <div class="info-row">
        <span class="info-lbl">Books Impact:</span>
        <span class="info-val">No ledger entries posted</span>
      </div>
    </div>
    <div class="footer-note">
      Rejected via Gmail SMTP &bull; Rooman Technologies Accounts Desk
    </div>
  </div>
</body>
</html>
""")

    return HTMLResponse(
        status_code=400,
        content="""<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Invalid Decision</h2><p>Expected decision=yes or decision=no.</p></body></html>"""
    )


@router.get("/payments/external", response_model=Page[ExternalPaymentOut])
def list_external_payments(
    status_filter: Optional[str] = Query(None, alias="status"),
    platform: Optional[str] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(require_full_app_access),
    db: Session = Depends(get_db),
):
    """List all external payments received from outside platforms."""
    stmt = select(ExternalPayment).where(ExternalPayment.organization_id == user.organization_id)
    if status_filter:
        stmt = stmt.where(ExternalPayment.status == status_filter)
    if platform:
        stmt = stmt.where(ExternalPayment.platform == platform.lower())
    stmt = stmt.order_by(ExternalPayment.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[ext_out(p) for p in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/payments/external/{payment_id}/resend-email", response_model=Message)
def resend_external_payment_confirmation_email(
    payment_id: str,
    request: Request,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Resend the Gmail SMTP confirmation request email for a pending payment."""
    ext_pay = get_or_404(db, ExternalPayment, payment_id, user.organization_id, "External Payment")
    if ext_pay.status != "pending_confirmation":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment is already {ext_pay.status}")

    base_url = str(request.base_url).rstrip("/") or "http://localhost:8000"
    recipient = ext_pay.confirmation_email_recipient or sender_identity()[1]

    inv_num = ext_pay.invoice.invoice_number if ext_pay.invoice else None
    result = send_payment_confirmation_request_email(
        to_email=recipient,
        payment_id=ext_pay.id,
        platform=ext_pay.platform,
        amount=float(ext_pay.amount),
        currency=ext_pay.currency,
        external_transaction_id=ext_pay.external_transaction_id,
        approval_token=ext_pay.approval_token,
        payer_name=ext_pay.payer_name,
        payer_email=ext_pay.payer_email,
        invoice_number=inv_num,
        base_url=base_url,
    )
    if not result.get("success"):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to send email: {result.get('error')}")

    ext_pay.confirmation_email_sent = True
    db.commit()
    return Message(message=f"Confirmation email re-dispatched to {recipient}")

