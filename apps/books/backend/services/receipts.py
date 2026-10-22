"""Customer receipts: applying a payment to an invoice and posting the receipt.

Shared by payments received, external payments and Rooman Billing's events,
so none of them imports the payments router.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from backend.models import BankAccount, Contact, CustomerPayment, Invoice, User
from backend.schemas.sales import CustomerPaymentCreate
from backend.services import audit, bank, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money

# Tolerance for comparing money columns in SQL. PostgreSQL stores exact
# NUMERIC(14, 2) values, where ">= amount - half a paisa" is identical to
# ">= amount"; SQLite computes total - amount_paid in floating point, where an
# exact full payment can otherwise miss by 1e-12 and be refused.
HALF_PAISA = Decimal("0.005")


PAYABLE_INVOICE_STATUSES = ("sent", "partially_paid")


def receivable_account_id(db: Session, org_id: str, customer: Contact) -> str:
    """The AR account the customer's invoices were posted to (see post_invoice)."""
    return customer.ledger_account_id or get_account_by_code(db, org_id, "1100").id


def apply_invoice_payment(db: Session, invoice: Invoice, amount: Decimal) -> None:
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
            Invoice.status.in_(PAYABLE_INVOICE_STATUSES),
            Invoice.total - Invoice.amount_paid >= amount - HALF_PAISA,
        )
        .values(amount_paid=func.round(Invoice.amount_paid + amount, 2))
        .execution_options(synchronize_session=False)
    )
    db.refresh(invoice)
    if result.rowcount != 1:
        if invoice.status not in PAYABLE_INVOICE_STATUSES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Payments can only be applied to sent invoices (current status: {invoice.status})"
            )
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Payment exceeds the invoice balance of {money(invoice.balance_due)}")
    refresh_invoice_status(invoice)


def remove_invoice_payment(db: Session, invoice: Invoice, amount: Decimal) -> None:
    """Take a deleted payment back off an invoice, atomically."""
    db.execute(
        update(Invoice)
        .where(Invoice.id == invoice.id, Invoice.organization_id == invoice.organization_id)
        .values(amount_paid=func.round(Invoice.amount_paid - amount, 2))
        .execution_options(synchronize_session=False)
    )
    db.refresh(invoice)
    refresh_invoice_status(invoice)


def refresh_invoice_status(inv: Invoice) -> None:
    if inv.status == "void":
        return
    paid = money(inv.amount_paid)
    if paid <= 0:
        inv.status = "sent" if inv.status in ("paid", "partially_paid") else inv.status
    elif paid >= money(inv.total):
        inv.status = "paid"
    else:
        inv.status = "partially_paid"


def record_customer_payment(
    db: Session,
    org_id: str,
    user: User,
    customer: Contact,
    bank_acct: BankAccount,
    invoice: Optional[Invoice],
    amount: Decimal,
    payload: CustomerPaymentCreate,
    notes: Optional[str],
) -> CustomerPayment:
    """One receipt: against ``invoice`` (already applied by the caller), or a customer advance when None."""
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
        notes=notes,
        created_by=user.id,
    )
    db.add(payment)
    db.flush()

    if invoice:
        # Clear the same receivables account the invoice was posted to.
        credit_account = receivable_account_id(db, org_id, customer)
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
    return payment
