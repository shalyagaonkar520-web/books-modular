"""Accounting entries for Razorpay money movements.

Both routes into the ledger -- the checkout callback (``/verify-payment``) and
the transaction sync -- go through this module, so a payment is booked the same
way whichever way Rooman Books learned about it. Nothing here is a parallel
accounting system: every entry is posted with the existing
:mod:`backend.services.ledger`, :mod:`backend.services.bank` and the
organisation's own chart of accounts.

Customer payment of INR 25,000::

    Dr  Razorpay / bank deposit account   25,000
        Cr  Accounts Receivable                    25,000

Gateway fee of INR 500 plus 18% GST::

    Dr  Bank Fees and Charges                500
    Dr  Input GST                             90
        Cr  Razorpay / bank deposit account          590
"""
from __future__ import annotations

from datetime import date as date_type
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import (
    BankAccount,
    Contact,
    CustomerPayment,
    Expense,
    FinancialTransactionRecord,
    Invoice,
    new_id,
)
from backend.services import bank, ledger
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money
from backend.services.numbering import next_number


def refresh_invoice_status(invoice: Invoice) -> None:
    """Recompute an invoice's status from what has been paid against it."""
    if invoice.status == "void":
        return
    paid = money(invoice.amount_paid)
    if paid <= 0:
        invoice.status = "overdue" if invoice.due_date < date_type.today() else "sent"
    elif paid >= invoice.total:
        invoice.status = "paid"
    else:
        invoice.status = "partially_paid"


def record_financial_txn(
    db: Session,
    org_id: str,
    txn_type: str,
    ref_type: str,
    ref_id: Optional[str],
    debit: Decimal,
    credit: Decimal,
    amount: Decimal,
    account: str,
    txn_date: date_type,
    description: str,
    status_val: str = "posted",
    user_id: Optional[str] = None,
) -> FinancialTransactionRecord:
    rec = FinancialTransactionRecord(
        id=new_id(),
        organization_id=org_id,
        transaction_id=f"TXN-{new_id()[:8].upper()}",
        transaction_type=txn_type,
        reference_type=ref_type,
        reference_id=ref_id,
        debit=money(debit),
        credit=money(credit),
        amount=money(amount),
        account=account,
        date=txn_date,
        description=description,
        status=status_val,
        created_by=user_id,
    )
    db.add(rec)
    db.flush()
    return rec


def default_bank_account(db: Session, org_id: str) -> Optional[BankAccount]:
    """The account Razorpay settlements are deposited into.

    Prefers an account that names Razorpay, then the primary account, then the
    oldest one -- matching how the rest of Rooman Books picks a default.
    """
    accounts = db.execute(
        select(BankAccount)
        .where(BankAccount.organization_id == org_id, BankAccount.is_active.is_(True))
        .order_by(BankAccount.created_at.asc())
    ).scalars().all()
    if not accounts:
        return None
    for account in accounts:
        if "razorpay" in (account.name or "").lower():
            return account
    for account in accounts:
        if account.is_primary:
            return account
    return accounts[0]


def book_customer_payment(
    db: Session,
    org_id: str,
    invoice: Invoice,
    bank_account: BankAccount,
    amount: Decimal,
    razorpay_payment_id: str,
    razorpay_order_id: Optional[str],
    method: str,
    pay_date: date_type,
    user_id: Optional[str],
) -> CustomerPayment:
    """Create the internal customer payment and post Dr bank / Cr receivables."""
    amount = money(amount)
    payment_number = next_number(db, org_id, "customer_payment")
    cust_payment = CustomerPayment(
        id=new_id(),
        organization_id=org_id,
        payment_number=payment_number,
        customer_id=invoice.customer_id,
        invoice_id=invoice.id,
        bank_account_id=bank_account.id,
        date=pay_date,
        amount=amount,
        mode="razorpay",
        reference=f"Razorpay: {razorpay_payment_id}",
        notes=f"Razorpay Order: {razorpay_order_id or 'n/a'} ({(method or 'other').upper()})",
        created_by=user_id,
    )
    db.add(cust_payment)
    db.flush()

    invoice.amount_paid = money(invoice.amount_paid + amount)
    refresh_invoice_status(invoice)

    ar_account = get_account_by_code(db, org_id, "1100")  # Accounts Receivable
    description = f"Razorpay Payment {payment_number} for Invoice {invoice.invoice_number}"
    entry = ledger.post_entry(
        db,
        org_id,
        pay_date,
        [
            (bank_account.ledger_account_id, amount, Decimal("0"), description, invoice.customer_id),
            (ar_account.id, Decimal("0"), amount, description, invoice.customer_id),
        ],
        "customer_payment",
        cust_payment.id,
        reference=razorpay_payment_id,
        created_by=user_id,
    )
    bank.record_movement(
        db,
        bank_account,
        pay_date,
        "deposit",
        amount,
        description,
        "customer_payment",
        cust_payment.id,
        user_id,
        razorpay_payment_id,
        ar_account.id,
        entry.id,
    )
    record_financial_txn(
        db,
        org_id,
        txn_type="customer_payment",
        ref_type="invoice",
        ref_id=invoice.id,
        debit=amount,
        credit=Decimal("0"),
        amount=amount,
        account="Cash / Bank (Razorpay)",
        txn_date=pay_date,
        description=f"Customer Payment {razorpay_payment_id} for Invoice {invoice.invoice_number}",
        user_id=user_id,
    )
    return cust_payment


def book_gateway_fee(
    db: Session,
    org_id: str,
    bank_account: BankAccount,
    fee: Decimal,
    tax_on_fee: Decimal,
    net_settlement: Decimal,
    razorpay_payment_id: str,
    customer_id: Optional[str],
    pay_date: date_type,
    user_id: Optional[str],
) -> Optional[Expense]:
    """Book the Razorpay processing fee as an expense against the gateway account."""
    fee = money(fee)
    tax_on_fee = money(tax_on_fee)
    if fee <= 0:
        return None

    bank_fee_account = get_account_by_code(db, org_id, "6100")  # Bank Fees and Charges
    input_gst_account = get_account_by_code(db, org_id, "1300")  # Input GST
    total_fee = fee + tax_on_fee

    expense_number = next_number(db, org_id, "expense")
    fee_expense = Expense(
        id=new_id(),
        organization_id=org_id,
        expense_number=expense_number,
        date=pay_date,
        account_id=bank_fee_account.id,
        paid_through_account_id=bank_account.id,
        vendor_id=None,
        customer_id=customer_id,
        amount=fee,
        tax_rate=Decimal("18.00") if tax_on_fee > 0 else Decimal("0"),
        tax_amount=tax_on_fee,
        total=total_fee,
        category="Payment Gateway Fees",
        payment_method="razorpay",
        status="paid",
        reference=f"Fee for {razorpay_payment_id}",
        notes=f"Razorpay processing fee (Net settlement: {net_settlement})",
        is_billable=False,
        created_by=user_id,
    )
    db.add(fee_expense)
    db.flush()

    description = f"Razorpay Gateway Fee: {expense_number}"
    lines = [(bank_fee_account.id, fee, Decimal("0"), description, None)]
    if tax_on_fee > 0:
        lines.append((input_gst_account.id, tax_on_fee, Decimal("0"), f"GST on {expense_number}", None))
    lines.append((bank_account.ledger_account_id, Decimal("0"), total_fee, description, None))

    entry = ledger.post_entry(
        db,
        org_id,
        pay_date,
        lines,
        "expense",
        fee_expense.id,
        reference=fee_expense.reference,
        created_by=user_id,
    )
    bank.record_movement(
        db,
        bank_account,
        pay_date,
        "withdrawal",
        total_fee,
        description,
        "expense",
        fee_expense.id,
        user_id,
        fee_expense.reference,
        bank_fee_account.id,
        entry.id,
    )
    record_financial_txn(
        db,
        org_id,
        txn_type="gateway_fee",
        ref_type="expense",
        ref_id=fee_expense.id,
        debit=fee,
        credit=Decimal("0"),
        amount=total_fee,
        account=bank_fee_account.name,
        txn_date=pay_date,
        description=f"Gateway Fee for {razorpay_payment_id}",
        user_id=user_id,
    )
    return fee_expense


def find_contact_for_payment(
    db: Session,
    org_id: str,
    email: Optional[str],
    contact_number: Optional[str],
    name: Optional[str],
) -> Optional[Contact]:
    """Resolve a Razorpay payer to an existing customer contact.

    Email is the only identifier trusted on its own. A phone number or a name
    is only accepted when it identifies exactly one customer, so that two
    contacts sharing a switchboard number never produce a wrong link.
    """
    base = select(Contact).where(Contact.organization_id == org_id, Contact.type == "customer")

    if email:
        hit = db.execute(base.where(Contact.email.ilike(email.strip()))).scalars().first()
        if hit:
            return hit

    if contact_number:
        digits = "".join(ch for ch in contact_number if ch.isdigit())[-10:]
        if len(digits) == 10:
            candidates = [
                c for c in db.execute(base).scalars().all()
                if "".join(ch for ch in (c.phone or "") if ch.isdigit()).endswith(digits)
            ]
            if len(candidates) == 1:
                return candidates[0]

    if name and len(name.strip()) >= 3:
        candidates = db.execute(base.where(Contact.display_name.ilike(name.strip()))).scalars().all()
        if len(candidates) == 1:
            return candidates[0]

    return None


def utcnow() -> datetime:
    from backend.models import utcnow as _utcnow

    return _utcnow()
