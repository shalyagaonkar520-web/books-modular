"""Payments received from customers and payments made to vendors."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import BankAccount, Bill, Contact, CustomerPayment, Invoice, User, VendorPayment
from backend.schemas.common import Message, Page
from backend.schemas.purchases import VendorPaymentCreate, VendorPaymentOut
from backend.schemas.sales import CustomerPaymentCreate, CustomerPaymentOut
from backend.services import audit, bank, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api", tags=["Payments"])


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
    user: User = Depends(get_current_user),
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
    user: User = Depends(get_current_user),
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
