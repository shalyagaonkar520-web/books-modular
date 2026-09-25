"""Payments received from customers and payments made to vendors."""

from __future__ import annotations

import html
import json
import secrets
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, Response
from pydantic import Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from backend.config import get_settings
from backend.db import get_db
from backend.deps import ROLE_ADMIN, require_full_app_access, require_write
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
from backend.schemas.common import MAX_MONEY, APIModel, Message, Page
from backend.schemas.purchases import VendorPaymentCreate, VendorPaymentOut
from backend.schemas.sales import CustomerPaymentCreate, CustomerPaymentOut
from backend.services import audit, bank, export_service, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.email_service import (
    send_customer_payment_email,
    send_payment_confirmation_request_email,
    send_vendor_payment_email,
)
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api", tags=["Payments"])

# Tolerance for comparing money columns in SQL. PostgreSQL stores exact
# NUMERIC(14, 2) values, where ">= amount - half a paisa" is identical to
# ">= amount"; SQLite computes total - amount_paid in floating point, where an
# exact full payment can otherwise miss by 1e-12 and be refused.
_HALF_PAISA = Decimal("0.005")
_PAYABLE_INVOICE_STATUSES = ("sent", "partially_paid")
_PAYABLE_BILL_STATUSES = ("open", "partially_paid")


class SendPaymentEmailRequest(APIModel):
    to_email: str
    custom_notes: Optional[str] = None
    attach_pdf: bool = True


def _receivable_account_id(db: Session, org_id: str, customer: Contact) -> str:
    """The AR account the customer's invoices were posted to (see post_invoice)."""
    return customer.ledger_account_id or get_account_by_code(db, org_id, "1100").id


def _payable_account_id(db: Session, org_id: str, vendor: Contact) -> str:
    """The AP account the vendor's bills were posted to (see post_bill)."""
    return vendor.ledger_account_id or get_account_by_code(db, org_id, "2000").id


def _apply_invoice_payment(db: Session, invoice: Invoice, amount: Decimal) -> None:
    """Add a payment to an invoice atomically, or raise 400 if it no longer fits.

    The balance check and the increment are one UPDATE, so two requests racing
    to pay the same invoice cannot both pass a stale "balance is enough" read:
    the database serialises them on the row (PostgreSQL) or the write lock
    (SQLite) and the loser's WHERE clause no longer matches. Call this before
    posting anything, so a refused payment leaves no ledger entries behind.
    """
    result = db.execute(
        update(Invoice)
        .where(
            Invoice.id == invoice.id,
            Invoice.organization_id == invoice.organization_id,
            Invoice.status.in_(_PAYABLE_INVOICE_STATUSES),
            Invoice.total - Invoice.amount_paid >= amount - _HALF_PAISA,
        )
        .values(amount_paid=func.round(Invoice.amount_paid + amount, 2))
        .execution_options(synchronize_session=False)
    )
    db.refresh(invoice)
    if result.rowcount != 1:
        if invoice.status not in _PAYABLE_INVOICE_STATUSES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Payments can only be applied to sent invoices (current status: {invoice.status})"
            )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment exceeds the invoice balance of {money(invoice.balance_due)}")
    _refresh_invoice_status(invoice)


def _remove_invoice_payment(db: Session, invoice: Invoice, amount: Decimal) -> None:
    """Take a deleted payment back off an invoice, atomically."""
    db.execute(
        update(Invoice)
        .where(Invoice.id == invoice.id, Invoice.organization_id == invoice.organization_id)
        .values(amount_paid=func.round(Invoice.amount_paid - amount, 2))
        .execution_options(synchronize_session=False)
    )
    db.refresh(invoice)
    _refresh_invoice_status(invoice)


def _apply_bill_payment(db: Session, bill: Bill, amount: Decimal) -> None:
    """Bill counterpart of _apply_invoice_payment."""
    result = db.execute(
        update(Bill)
        .where(
            Bill.id == bill.id,
            Bill.organization_id == bill.organization_id,
            Bill.status.in_(_PAYABLE_BILL_STATUSES),
            Bill.total - Bill.amount_paid >= amount - _HALF_PAISA,
        )
        .values(amount_paid=func.round(Bill.amount_paid + amount, 2))
        .execution_options(synchronize_session=False)
    )
    db.refresh(bill)
    if result.rowcount != 1:
        if bill.status not in _PAYABLE_BILL_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payments can only be applied to open bills (current status: {bill.status})")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment exceeds the bill balance of {money(bill.balance_due)}")
    _refresh_bill_status(bill)


def _remove_bill_payment(db: Session, bill: Bill, amount: Decimal) -> None:
    db.execute(
        update(Bill)
        .where(Bill.id == bill.id, Bill.organization_id == bill.organization_id)
        .values(amount_paid=func.round(Bill.amount_paid - amount, 2))
        .execution_options(synchronize_session=False)
    )
    db.refresh(bill)
    _refresh_bill_status(bill)


def _check_cash_withdrawal(db: Session, bank_acct: BankAccount, amount: Decimal) -> None:
    """bank.check_cash_overdraft, holding the account row so concurrent
    withdrawals from the same cash drawer cannot both pass the check.
    (SQLite has no row locks; there the write lock taken by the request's
    first UPDATE already serialises it.)"""
    if bank_acct.type != "cash":
        return
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        db.execute(select(BankAccount.id).where(BankAccount.id == bank_acct.id).with_for_update())
    bank.check_cash_overdraft(db, bank_acct, amount)


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
    stmt = (
        select(CustomerPayment)
        .where(CustomerPayment.organization_id == user.organization_id)
        .options(selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account))
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
    stmt = (
        select(CustomerPayment)
        .where(CustomerPayment.organization_id == user.organization_id)
        .options(selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account))
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
    stmt = (
        select(CustomerPayment)
        .where(CustomerPayment.organization_id == user.organization_id)
        .options(selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account))
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
        if invoice.status not in _PAYABLE_INVOICE_STATUSES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Payments can only be applied to sent invoices (current status: {invoice.status})"
            )
        if amount > money(invoice.balance_due):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment exceeds the invoice balance of {invoice.balance_due}")
        # The checks above are a friendly early answer; this is the one that
        # holds under concurrency. It must run first, before anything is posted.
        _apply_invoice_payment(db, invoice, amount)
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

    if invoice:
        # Clear the same receivables account the invoice was posted to.
        credit_account = _receivable_account_id(db, org_id, customer)
    else:
        credit_account = get_account_by_code(db, org_id, "2400").id  # unapplied payments sit as customer advances
    desc = f"Payment {payment.payment_number} from {customer.display_name}" + (f" for {invoice.invoice_number}" if invoice else "")
    entry = ledger.post_entry(
        db,
        org_id,
        payment.date,
        [(bank_acct.ledger_account_id, amount, Decimal("0"), desc, customer.id), (credit_account, Decimal("0"), amount, desc, customer.id)],
        "customer_payment",
        payment.id,
        reference=payment.reference or payment.payment_number,
        created_by=user.id,
    )
    bank.record_movement(
        db,
        bank_acct,
        payment.date,
        "deposit",
        amount,
        desc,
        "customer_payment",
        payment.id,
        user.id,
        payment.reference,
        credit_account,
        entry.id,
    )

    audit.record(db, user, "create", "customer_payment", payment.id, desc)
    db.commit()
    db.refresh(payment)
    return cp_out(payment)


@router.delete("/customer-payments/{payment_id}", response_model=Message)
def delete_customer_payment(payment_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    payment = get_or_404(db, CustomerPayment, payment_id, user.organization_id, "Payment")
    number = payment.payment_number
    ledger.reverse_entries_for_source(db, user.organization_id, "customer_payment", payment.id, date.today(), user.id, "Payment deleted")
    # Removing a receipt takes its deposit back out of the account; a cash
    # drawer cannot go below zero (same rule as paying out of it). Checked
    # while the deposit is still counted, after the first write above.
    _check_cash_withdrawal(db, payment.bank_account, money(payment.amount))
    bank.remove_movements(db, "customer_payment", payment.id)
    if payment.invoice:
        _remove_invoice_payment(db, payment.invoice, money(payment.amount))
    # A payment recorded from an approved external payment is still referenced
    # by it (foreign key). Unlink it and mark the external payment reversed so
    # its history stays visible and the same UTR can be recorded again.
    for ext in db.execute(
        select(ExternalPayment).where(
            ExternalPayment.organization_id == user.organization_id, ExternalPayment.customer_payment_id == payment.id
        )
    ).scalars():
        ext.customer_payment_id = None
        ext.status = "reversed"
        ext.rejection_reason = f"Recorded payment {number} was deleted by {user.name}"
    db.flush()
    db.delete(payment)
    audit.record(db, user, "delete", "customer_payment", payment_id, f"Deleted payment {number}")
    db.commit()
    return Message(message=f"Payment {number} deleted and reversed")


@router.get("/customer-payments/{payment_id}/pdf")
def download_customer_payment_pdf(payment_id: str, user: User = Depends(require_full_app_access), db: Session = Depends(get_db)):
    """Download single Customer Payment receipt as PDF."""
    stmt = (
        select(CustomerPayment)
        .where(CustomerPayment.id == payment_id, CustomerPayment.organization_id == user.organization_id)
        .options(selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account))
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
    stmt = (
        select(CustomerPayment)
        .where(CustomerPayment.id == payment_id, CustomerPayment.organization_id == user.organization_id)
        .options(selectinload(CustomerPayment.customer), selectinload(CustomerPayment.invoice), selectinload(CustomerPayment.bank_account))
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
        company_name=org.name if org else None,
    )
    if not result.get("success"):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, result.get("error"))
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
    stmt = (
        select(VendorPayment)
        .where(VendorPayment.organization_id == user.organization_id)
        .options(selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account))
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
    stmt = (
        select(VendorPayment)
        .where(VendorPayment.organization_id == user.organization_id)
        .options(selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account))
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
    stmt = (
        select(VendorPayment)
        .where(VendorPayment.organization_id == user.organization_id)
        .options(selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account))
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
        if bill.status not in _PAYABLE_BILL_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payments can only be applied to open bills (current status: {bill.status})")
        if amount > money(bill.balance_due):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment exceeds the bill balance of {bill.balance_due}")
        # Authoritative, race-free check-and-apply; runs before anything is posted.
        _apply_bill_payment(db, bill, amount)
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

    if bill:
        # Clear the same payables account the bill was posted to.
        debit_account = _payable_account_id(db, org_id, vendor)
    else:
        debit_account = get_account_by_code(db, org_id, "1400").id  # advances to vendors
    desc = f"Payment {payment.payment_number} to {vendor.display_name}" + (f" for {bill.bill_number}" if bill else "")
    entry = ledger.post_entry(
        db,
        org_id,
        payment.date,
        [(debit_account, amount, Decimal("0"), desc, vendor.id), (bank_acct.ledger_account_id, Decimal("0"), amount, desc, vendor.id)],
        "vendor_payment",
        payment.id,
        reference=payment.reference or payment.payment_number,
        created_by=user.id,
    )
    # After the first write, so on SQLite this request already holds the lock.
    _check_cash_withdrawal(db, bank_acct, amount)
    bank.record_movement(
        db,
        bank_acct,
        payment.date,
        "withdrawal",
        amount,
        desc,
        "vendor_payment",
        payment.id,
        user.id,
        payment.reference,
        debit_account,
        entry.id,
    )

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
        _remove_bill_payment(db, payment.bill, money(payment.amount))
    number = payment.payment_number
    db.delete(payment)
    audit.record(db, user, "delete", "vendor_payment", payment_id, f"Deleted payment {number}")
    db.commit()
    return Message(message=f"Payment {number} deleted and reversed")


@router.get("/vendor-payments/{payment_id}/pdf")
def download_vendor_payment_pdf(payment_id: str, user: User = Depends(require_full_app_access), db: Session = Depends(get_db)):
    """Download single Vendor Payment remittance advice as PDF."""
    stmt = (
        select(VendorPayment)
        .where(VendorPayment.id == payment_id, VendorPayment.organization_id == user.organization_id)
        .options(selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account))
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
    stmt = (
        select(VendorPayment)
        .where(VendorPayment.id == payment_id, VendorPayment.organization_id == user.organization_id)
        .options(selectinload(VendorPayment.vendor), selectinload(VendorPayment.bill), selectinload(VendorPayment.bank_account))
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
        company_name=org.name if org else None,
    )
    if not result.get("success"):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, result.get("error"))
    audit.record(db, user, "email", "vendor_payment", payment.id, f"Emailed remittance {payment.payment_number} to {payload.to_email}")
    db.commit()
    return result


# --------------------------------------------------------------------------- #
# External Payments & Gmail SMTP YES/NO Confirmation Flow
# --------------------------------------------------------------------------- #
# A confirmation link is good for this long after the payment was received.
CONFIRM_TOKEN_TTL = timedelta(hours=72)


class IncomingExternalPayment(APIModel):
    # The organization comes from the signed-in user, the confirmation email
    # goes to that organization's admins and its links point at the configured
    # app URL - none of these are taken from the request body any more (extra
    # fields such as organizationId, recipientEmail or baseUrl are ignored).
    platform: str = Field(default="upi", min_length=1, max_length=50)
    external_transaction_id: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(gt=0, le=MAX_MONEY)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    payer_name: Optional[str] = Field(default=None, max_length=120)
    payer_email: Optional[str] = Field(default=None, max_length=120)
    payer_phone: Optional[str] = Field(default=None, max_length=40)
    invoice_id: Optional[str] = Field(default=None, max_length=32)
    invoice_number: Optional[str] = Field(default=None, max_length=30)
    customer_id: Optional[str] = Field(default=None, max_length=32)
    bank_account_id: Optional[str] = Field(default=None, max_length=32)
    notes: Optional[str] = Field(default=None, max_length=2000)
    raw_payload: Optional[Dict[str, Any]] = None


class ExternalPaymentOut(APIModel):
    # approval_token is deliberately absent: it is the secret that approves
    # the payment and must only ever travel inside the confirmation email.
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
        approved_at=p.approved_at,
        approved_by=p.approved_by,
        rejection_reason=p.rejection_reason,
        customer_payment_id=p.customer_payment_id,
        confirmation_email_sent=p.confirmation_email_sent,
        confirmation_email_recipient=p.confirmation_email_recipient,
        created_at=p.created_at,
    )


def _token_expired(ext_pay: ExternalPayment) -> bool:
    created = ext_pay.created_at
    if created is None:
        return True
    if created.tzinfo is None:  # SQLite hands back naive UTC datetimes
        created = created.replace(tzinfo=UTC)
    return datetime.now(UTC) - created > CONFIRM_TOKEN_TTL


def _confirmation_recipients(db: Session, org_id: str) -> List[str]:
    """Who approves external payments: the organization's own active admins,
    falling back to the organization's contact email."""
    emails = (
        db.execute(
            select(User.email)
            .where(
                User.organization_id == org_id,
                User.role == ROLE_ADMIN,
                User.is_active.is_(True),
                User.password_hash.is_not(None),  # skip invites nobody has accepted yet
            )
            .order_by(User.created_at)
        )
        .scalars()
        .all()
    )
    recipients = list(dict.fromkeys(e for e in emails if e))
    if not recipients:
        org = db.get(Organization, org_id)
        if org and org.email:
            recipients = [org.email]
    return recipients


def _confirmation_base_url() -> str:
    # The web app proxies /api to this backend, so the configured app origin
    # serves the confirm links - never a host taken from the request.
    return get_settings().frontend_url.rstrip("/")


def _send_confirmation_requests(db: Session, ext_pay: ExternalPayment) -> Dict[str, Any]:
    recipients = _confirmation_recipients(db, ext_pay.organization_id)
    if not recipients:
        return {"success": False, "recipients": [], "error": "This organization has no admin email address to send the confirmation to"}
    org = db.get(Organization, ext_pay.organization_id)
    sent: List[str] = []
    error: Optional[str] = None
    for recipient in recipients:
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
            invoice_number=ext_pay.invoice.invoice_number if ext_pay.invoice else None,
            base_url=_confirmation_base_url(),
            company_name=org.name if org else None,
        )
        if result.get("success"):
            sent.append(recipient)
        else:
            error = result.get("error")
    return {"success": bool(sent), "recipients": sent or recipients, "error": None if sent else error}


def _check_duplicate_external(db: Session, org_id: str, platform: str, txn_id: str, exclude_id: Optional[str], statuses) -> None:
    stmt = select(ExternalPayment.id).where(
        ExternalPayment.organization_id == org_id,
        ExternalPayment.platform == platform,
        ExternalPayment.external_transaction_id == txn_id,
        ExternalPayment.status.in_(statuses),
    )
    if exclude_id:
        stmt = stmt.where(ExternalPayment.id != exclude_id)
    if db.execute(stmt).first():
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A {platform.upper()} payment with transaction reference {txn_id} has already been recorded"
        )


def process_approved_external_payment(
    db: Session,
    ext_pay: ExternalPayment,
    approved_by: str = "Gmail SMTP Confirmation",
) -> CustomerPayment:
    """Record an external payment in the books.

    Applies the same rules as create_customer_payment and raises HTTPException
    (leaving the caller to roll back) when the payment cannot be recorded.
    """
    org_id = ext_pay.organization_id

    # 0. Claim the payment. Only one request can move it out of
    # pending_confirmation, so two clicks on YES cannot both post it. This is
    # also the transaction's first write, which serialises the checks below.
    claimed = db.execute(
        update(ExternalPayment)
        .where(ExternalPayment.id == ext_pay.id, ExternalPayment.status == "pending_confirmation")
        .values(status="approved")
        .execution_options(synchronize_session=False)
    ).rowcount
    if claimed != 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "This payment has already been processed")

    amount = money(ext_pay.amount)
    if amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment amount must be greater than zero")
    _check_duplicate_external(db, org_id, ext_pay.platform, ext_pay.external_transaction_id, ext_pay.id, ("approved",))

    # 1. Resolve the invoice (always within this organization)
    invoice = None
    if ext_pay.invoice_id:
        invoice = db.get(Invoice, ext_pay.invoice_id)
        if invoice is None or invoice.organization_id != org_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The invoice this payment was matched to no longer exists")

    # 2. Resolve Customer
    customer = None
    if ext_pay.customer_id:
        customer = db.get(Contact, ext_pay.customer_id)
        if customer is None or customer.organization_id != org_id or customer.type != "customer":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The customer this payment was matched to no longer exists")
    if not customer and invoice:
        customer = invoice.customer
    if invoice and customer and invoice.customer_id != customer.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoice belongs to a different customer")
    if not customer and ext_pay.payer_email:
        customer = (
            db.execute(
                select(Contact).where(Contact.organization_id == org_id, Contact.type == "customer", Contact.email == ext_pay.payer_email)
            )
            .scalars()
            .first()
        )
    if not customer and ext_pay.payer_name:
        customer = (
            db.execute(
                select(Contact).where(
                    Contact.organization_id == org_id, Contact.type == "customer", Contact.display_name == ext_pay.payer_name
                )
            )
            .scalars()
            .first()
        )
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

    # 3. Apply to the invoice atomically before anything is posted (status
    # must be sent/partially_paid and the amount must fit the balance).
    if invoice:
        _apply_invoice_payment(db, invoice, amount)

    # 4. Resolve Bank Account
    bank_acct = None
    if ext_pay.bank_account_id:
        bank_acct = db.get(BankAccount, ext_pay.bank_account_id)
        if bank_acct is not None and bank_acct.organization_id != org_id:
            bank_acct = None
    if not bank_acct:
        bank_acct = (
            db.execute(
                select(BankAccount)
                .where(BankAccount.organization_id == org_id)
                .order_by(BankAccount.is_active.desc(), BankAccount.is_primary.desc())
            )
            .scalars()
            .first()
        )
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

    # 5. Create Internal CustomerPayment
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

    # 6. Post Ledger & Bank Movement
    if invoice:
        credit_account = _receivable_account_id(db, org_id, customer)
    else:
        credit_account = get_account_by_code(db, org_id, "2400").id
    desc = f"Payment {payment.payment_number} ({ext_pay.platform.upper()}) from {customer.display_name}" + (
        f" for {invoice.invoice_number}" if invoice else ""
    )
    entry = ledger.post_entry(
        db,
        org_id,
        payment.date,
        [(bank_acct.ledger_account_id, amount, Decimal("0"), desc, customer.id), (credit_account, Decimal("0"), amount, desc, customer.id)],
        "customer_payment",
        payment.id,
        reference=payment.reference or payment.payment_number,
        created_by="system",
    )
    bank.record_movement(
        db,
        bank_acct,
        payment.date,
        "deposit",
        amount,
        desc,
        "customer_payment",
        payment.id,
        "system",
        payment.reference,
        credit_account,
        entry.id,
    )

    # 7. Mark ExternalPayment as approved
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
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Universal intake endpoint for payments from ANY outside platform (UPI, bank transfer, card gateway, wallet, etc.).
    Records payment in pending confirmation state and emails the organization's admins a YES/NO confirmation.
    """
    org_id = user.organization_id
    platform = payload.platform.strip().lower()
    amount = money(payload.amount)

    invoice = None
    if payload.invoice_id:
        invoice = get_or_404(db, Invoice, payload.invoice_id, org_id, "Invoice")
    elif payload.invoice_number:
        invoice = db.execute(
            select(Invoice).where(Invoice.organization_id == org_id, Invoice.invoice_number == payload.invoice_number)
        ).scalar_one_or_none()
        if invoice is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    customer = None
    if payload.customer_id:
        customer = get_or_404(db, Contact, payload.customer_id, org_id, "Customer")
        if customer.type != "customer":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a customer")
    if payload.bank_account_id:
        get_or_404(db, BankAccount, payload.bank_account_id, org_id, "Bank account")
    if invoice:
        if customer and invoice.customer_id != customer.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoice belongs to a different customer")
        if invoice.status not in _PAYABLE_INVOICE_STATUSES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Payments can only be applied to sent invoices (current status: {invoice.status})"
            )
        if amount > money(invoice.balance_due):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment exceeds the invoice balance of {invoice.balance_due}")
    # The same UTR cannot be pending or recorded twice for one platform.
    _check_duplicate_external(db, org_id, platform, payload.external_transaction_id, None, ("pending_confirmation", "approved"))

    ext_payment = ExternalPayment(
        organization_id=org_id,
        platform=platform,
        external_transaction_id=payload.external_transaction_id,
        amount=amount,
        currency=(payload.currency or "INR").upper(),
        payer_name=payload.payer_name or (invoice.customer.display_name if invoice and invoice.customer else None),
        payer_email=payload.payer_email or (invoice.customer.email if invoice and invoice.customer else None),
        payer_phone=payload.payer_phone,
        invoice_id=invoice.id if invoice else None,
        customer_id=customer.id if customer else (invoice.customer_id if invoice else None),
        bank_account_id=payload.bank_account_id,
        status="pending_confirmation",
        approval_token=secrets.token_urlsafe(32),
        raw_payload=json.dumps(payload.raw_payload) if payload.raw_payload else None,
        notes=payload.notes,
    )
    db.add(ext_payment)
    db.commit()
    db.refresh(ext_payment)

    email_result = _send_confirmation_requests(db, ext_payment)
    recipient_label = ", ".join(email_result["recipients"])[:120] or None
    ext_payment.confirmation_email_sent = email_result["success"]
    ext_payment.confirmation_email_recipient = recipient_label
    audit.record(
        db, user, "create", "external_payment", ext_payment.id, f"External {platform.upper()} payment {ext_payment.external_transaction_id}"
    )
    db.commit()

    return {
        "success": True,
        "message": "External payment received. Confirmation request dispatched via Gmail SMTP.",
        "external_payment_id": ext_payment.id,
        "platform": ext_payment.platform,
        "external_transaction_id": ext_payment.external_transaction_id,
        "amount": float(ext_payment.amount),
        "status": ext_payment.status,
        "email_dispatched": ext_payment.confirmation_email_sent,
        "email_recipient": recipient_label,
        "email_error": email_result["error"],
    }


_PAGE_STYLE = (
    "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;"
    "padding:40px;display:flex;justify-content:center;}"
    ".card{background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:500px;text-align:center;}"
)


def _simple_page(title: str, heading: str, message: str, color: str, status_code: int = 200) -> HTMLResponse:
    """Small result page. `message` must already be HTML-safe."""
    return HTMLResponse(
        status_code=status_code,
        content=(
            f'<!DOCTYPE html><html><head><meta charset="utf-8"><title>{html.escape(title)}</title><style>{_PAGE_STYLE}</style></head>'
            f'<body><div class="card"><h2 style="color:{color};">{html.escape(heading)}</h2><p>{message}</p></div></body></html>'
        ),
    )


def _result_page(title: str, heading: str, subtitle: str, icon: str, color: str, rows: List[tuple], footer: str) -> HTMLResponse:
    """The full approved/rejected card. Every value is escaped here."""
    row_html = "".join(
        f"""
      <div class="info-row">
        <span class="info-lbl">{html.escape(label)}</span>
        <span class="info-val"{f' style="{style}"' if style else ""}>{html.escape(str(value))}</span>
      </div>"""
        for label, value, style in rows
    )
    return HTMLResponse(
        content=f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{html.escape(title)}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; margin: 0; padding: 40px 16px; color: #1e293b; display: flex; justify-content: center; align-items: center; min-height: 80vh; }}
    .card {{ background: #ffffff; max-width: 520px; width: 100%; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); overflow: hidden; text-align: center; }}
    .status-header {{ background: {color}; color: white; padding: 32px 24px; }}
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
      <div class="icon">{icon}</div>
      <h1 class="status-title">{html.escape(heading)}</h1>
      <p class="status-subtitle">{html.escape(subtitle)}</p>
    </div>
    <div class="body-content">{row_html}
    </div>
    <div class="footer-note">
      {html.escape(footer)}
    </div>
  </div>
</body>
</html>
"""
    )


@router.get("/payments/external/confirm", response_class=HTMLResponse)
def confirm_external_payment_from_email(
    token: str = Query(..., max_length=128, description="Approval token from Gmail confirmation email"),
    decision: str = Query(..., max_length=10, description="yes or no"),
    db: Session = Depends(get_db),
):
    """Processes 1-click YES or NO confirmation directly from the Gmail SMTP email.

    Unauthenticated by design: the unguessable token, sent only to the
    organization's admins, is the credential. A token decides a payment once
    (the status change is atomic) and stops working CONFIRM_TOKEN_TTL after the
    payment was received.
    """
    ext_pay = db.execute(select(ExternalPayment).where(ExternalPayment.approval_token == token)).scalar_one_or_none()

    if not ext_pay:
        return _simple_page(
            "Invalid Link", "Invalid or Expired Link", "The payment confirmation token was not found or has expired.", "#ef4444", 404
        )

    org = db.get(Organization, ext_pay.organization_id)
    desk = f"{org.name if org else get_settings().smtp_sender_name} Accounts Desk"
    formatted_amount = f"₹{ext_pay.amount:,.2f}" if ext_pay.currency == "INR" else f"{ext_pay.currency} {ext_pay.amount:,.2f}"
    platform = (ext_pay.platform or "").upper()
    txn = ext_pay.external_transaction_id
    decision_clean = decision.strip().lower()

    if decision_clean not in ("yes", "no"):
        return _simple_page("Invalid Decision", "Invalid Decision", "Expected decision=yes or decision=no.", "#0f172a", 400)

    if ext_pay.status == "approved":
        if decision_clean == "yes":
            return _simple_page(
                "Already Approved",
                "Payment Already Approved",
                f"This {html.escape(platform)} transaction of <strong>{html.escape(formatted_amount)}</strong> "
                f"(Ref: {html.escape(txn)}) has already been approved and recorded in Rooman Books.",
                "#16a34a",
            )
        return _simple_page(
            "Cannot Reject", "Cannot Reject", "This payment has already been approved and committed to the financial ledger.", "#ef4444"
        )
    if ext_pay.status == "rejected":
        if decision_clean == "yes":
            return _simple_page(
                "Previously Rejected", "Payment Previously Rejected", "This transaction was already marked as rejected.", "#dc2626"
            )
        return _simple_page("Already Rejected", "Payment Already Rejected", "This transaction was already marked as rejected.", "#dc2626")
    if ext_pay.status != "pending_confirmation":
        return _simple_page(
            "Link No Longer Valid", "Link No Longer Valid", "This payment is no longer awaiting confirmation.", "#64748b", 410
        )
    if _token_expired(ext_pay):
        hours = int(CONFIRM_TOKEN_TTL.total_seconds() // 3600)
        return _simple_page(
            "Link Expired",
            "Confirmation Link Expired",
            f"Confirmation links are valid for {hours} hours. Record this payment from Rooman Books instead.",
            "#ef4444",
            410,
        )

    if decision_clean == "yes":
        try:
            cust_payment = process_approved_external_payment(db, ext_pay, approved_by="Gmail SMTP 1-Click Action")
        except HTTPException as exc:
            db.rollback()
            if exc.status_code == status.HTTP_409_CONFLICT and "already been processed" in str(exc.detail):
                db.refresh(ext_pay)
                return _simple_page(
                    "Already Processed", "Payment Already Processed", f"This payment is already {html.escape(ext_pay.status)}.", "#64748b"
                )
            return _simple_page("Cannot Approve", "Payment Could Not Be Recorded", html.escape(str(exc.detail)), "#dc2626", exc.status_code)

        return _result_page(
            "Payment Approved - Rooman Books",
            "Payment Approved & Recorded",
            "Transaction successfully confirmed into Rooman Books",
            "✅",
            "#16a34a",
            [
                ("Amount Confirmed:", formatted_amount, "color: #16a34a; font-size: 16px;"),
                ("Origin Platform:", platform, ""),
                ("Transaction Ref / UTR:", txn, ""),
                ("Rooman Voucher #:", cust_payment.payment_number, ""),
                ("General Ledger:", "Posted (Bank & Accounts Updated)", "color: #2563eb;"),
            ],
            f"Confirmed via Gmail SMTP • {desk}",
        )

    # decision == "no": atomic, so it cannot race an approval.
    rejected = db.execute(
        update(ExternalPayment)
        .where(ExternalPayment.id == ext_pay.id, ExternalPayment.status == "pending_confirmation")
        .values(status="rejected", rejection_reason="Rejected via Gmail SMTP confirmation link")
        .execution_options(synchronize_session=False)
    ).rowcount
    db.commit()
    db.refresh(ext_pay)
    if rejected != 1:
        return _simple_page(
            "Already Processed", "Payment Already Processed", f"This payment is already {html.escape(ext_pay.status)}.", "#64748b"
        )

    return _result_page(
        "Payment Rejected - Rooman Books",
        "Payment Rejected & Discarded",
        "Transaction has been marked as rejected",
        "❌",
        "#dc2626",
        [
            ("Amount Discarded:", formatted_amount, ""),
            ("Platform:", platform, ""),
            ("Transaction Ref / UTR:", txn, ""),
            ("Status:", "Rejected", "color: #dc2626;"),
            ("Books Impact:", "No ledger entries posted", ""),
        ],
        f"Rejected via Gmail SMTP • {desk}",
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
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Resend the Gmail SMTP confirmation request email for a pending payment.

    A fresh token is issued, so links in earlier emails stop working."""
    ext_pay = get_or_404(db, ExternalPayment, payment_id, user.organization_id, "External Payment")
    if ext_pay.status != "pending_confirmation":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment is already {ext_pay.status}")
    if _token_expired(ext_pay):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "The confirmation window for this payment has passed; record it as a customer payment instead"
        )

    # Commit before talking to the mail server so no lock is held meanwhile.
    ext_pay.approval_token = secrets.token_urlsafe(32)
    db.commit()
    result = _send_confirmation_requests(db, ext_pay)
    if not result["success"]:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, result["error"] or "Failed to send the confirmation email")

    recipients = ", ".join(result["recipients"])
    ext_pay.confirmation_email_sent = True
    ext_pay.confirmation_email_recipient = recipients[:120]
    db.commit()
    return Message(message=f"Confirmation email re-dispatched to {recipients}")
