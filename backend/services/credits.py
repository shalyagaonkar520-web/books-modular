"""Credit notes, vendor credits, advances and refunds: posting and settlement.

A credit note mirrors an invoice (income and output GST back, receivables
down); a vendor credit mirrors a bill. Their open balance then either
settles invoices / bills (a CreditApplication: no journal, as both sides sit
in the same receivables or payables account) or is paid out as a refund.

Unapplied customer payments sit in 2400 (customer advances) and unapplied
vendor payments in 1400 (advances to vendors), tagged with the contact on the
journal line. They too can be applied to invoices / bills or refunded.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from backend.models import (
    Account,
    BankAccount,
    Bill,
    Contact,
    ContactRefund,
    CreditApplication,
    CreditNote,
    Invoice,
    JournalEntry,
    JournalLine,
    User,
    VendorCredit,
)
from backend.routers.bills import _receive_at_average_cost, _stock_on_hand, _unreceive_at_average_cost
from backend.routers.payments import (
    _apply_bill_payment,
    _apply_invoice_payment,
    _check_cash_withdrawal,
    _remove_bill_payment,
    _remove_invoice_payment,
)
from backend.services import audit, bank, fx, inventory, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.documents import group_by_account
from backend.services.money import money, qty
from backend.services.tenancy import get_or_404

_HALF_PAISA = Decimal("0.005")
CUSTOMER_ADVANCES = "2400"
VENDOR_ADVANCES = "1400"


# --------------------------------------------------------------------------- #
# Posting
# --------------------------------------------------------------------------- #
def post_credit_note(db: Session, cn: CreditNote, user: User) -> None:
    """Journal: Dr income accounts, Dr Output GST; Cr AR total, Cr Discount. Returned goods go back to stock at cost."""
    org_id = cn.organization_id
    ar = cn.customer.ledger_account or get_account_by_code(db, org_id, "1100")
    output_gst = get_account_by_code(db, org_id, "2100")
    default_sales = get_account_by_code(db, org_id, "4000")
    discount_acct = get_account_by_code(db, org_id, "4300")
    number = cn.credit_note_number

    income_pairs = []
    for line in cn.lines:
        account_id = line.account_id or (line.item.sales_account_id if line.item and line.item.sales_account_id else default_sales.id)
        income_pairs.append((account_id, line.amount))
    lines = [
        (account_id, amount, Decimal("0"), f"Credit note {number}", cn.customer_id)
        for account_id, amount in group_by_account(income_pairs).items()
    ]
    if cn.tax_total > 0:
        lines.append((output_gst.id, cn.tax_total, Decimal("0"), f"GST on {number}", cn.customer_id))
    if cn.discount_amount > 0:
        lines.append((discount_acct.id, Decimal("0"), cn.discount_amount, f"Discount on {number}", cn.customer_id))
    lines.append((ar.id, Decimal("0"), cn.total, f"Credit note {number}", cn.customer_id))
    ledger.post_entry(db, org_id, cn.date, lines, "credit_note", cn.id, reference=number, created_by=user.id)

    inventory_acct = get_account_by_code(db, org_id, "1200")
    cogs_default = get_account_by_code(db, org_id, "5000")
    stock_lines = []
    for line in cn.lines:
        item = line.item
        if item and item.track_inventory:
            inventory.adjust_stock(
                db, item, line.quantity, cn.date, "credit_note_stock", cn.id, f"Returned on {number}", user.id, rate=Decimal("0")
            )
            cost = money(line.quantity * money(item.cost_price))
            if cost > 0:
                stock_lines.append((inventory_acct.id, cost, Decimal("0"), f"Stock back {item.name} ({number})", None))
                stock_lines.append(
                    (item.purchase_account_id or cogs_default.id, Decimal("0"), cost, f"COGS reversed {item.name} ({number})", None)
                )
    if stock_lines:
        ledger.post_entry(db, org_id, cn.date, stock_lines, "credit_note_cogs", cn.id, reference=number, created_by=user.id)


def unpost_credit_note(db: Session, cn: CreditNote, user: User, reason: str) -> None:
    today = date.today()
    ledger.reverse_entries_for_source(db, cn.organization_id, "credit_note", cn.id, today, user.id, reason)
    ledger.reverse_entries_for_source(db, cn.organization_id, "credit_note_cogs", cn.id, today, user.id, reason)
    for line in cn.lines:
        if line.item and line.item.track_inventory:
            inventory.adjust_stock(
                db,
                line.item,
                -line.quantity,
                today,
                "credit_note_stock",
                cn.id,
                f"{reason} {cn.credit_note_number}",
                user.id,
                rate=Decimal("0"),
                allow_negative=True,
            )


def post_vendor_credit(db: Session, vc: VendorCredit, user: User) -> None:
    """Journal: Dr AP total, Dr Purchase Discounts; Cr expense / inventory accounts, Cr Input GST. Returned goods leave stock."""
    org_id = vc.organization_id
    ap = vc.vendor.ledger_account or get_account_by_code(db, org_id, "2000")
    input_gst = get_account_by_code(db, org_id, "1300")
    inventory_acct = get_account_by_code(db, org_id, "1200")
    default_expense = get_account_by_code(db, org_id, "5000")
    discount_acct = get_account_by_code(db, org_id, "5900")
    number = vc.vendor_credit_number

    credit_pairs = []
    for line in vc.lines:
        item = line.item
        if item and item.track_inventory:
            credit_pairs.append((inventory_acct.id, line.amount))
            on_hand = _stock_on_hand(db, item)
            _unreceive_at_average_cost(item, on_hand, qty(line.quantity), money(line.rate))
            inventory.adjust_stock(
                db, item, -line.quantity, vc.date, "vendor_credit_stock", vc.id, f"Returned on {number}", user.id, rate=Decimal("0")
            )
        else:
            account_id = line.account_id or (item.purchase_account_id if item and item.purchase_account_id else default_expense.id)
            credit_pairs.append((account_id, line.amount))
    lines = [(ap.id, vc.total, Decimal("0"), f"Vendor credit {number}", vc.vendor_id)]
    if vc.discount_amount > 0:
        lines.append((discount_acct.id, vc.discount_amount, Decimal("0"), f"Discount on {number}", vc.vendor_id))
    for account_id, amount in group_by_account(credit_pairs).items():
        lines.append((account_id, Decimal("0"), amount, f"Vendor credit {number}", vc.vendor_id))
    if vc.tax_total > 0:
        lines.append((input_gst.id, Decimal("0"), vc.tax_total, f"GST on {number}", vc.vendor_id))
    ledger.post_entry(db, org_id, vc.date, lines, "vendor_credit", vc.id, reference=number, created_by=user.id)


def unpost_vendor_credit(db: Session, vc: VendorCredit, user: User, reason: str) -> None:
    today = date.today()
    ledger.reverse_entries_for_source(db, vc.organization_id, "vendor_credit", vc.id, today, user.id, reason)
    for line in vc.lines:
        item = line.item
        if item and item.track_inventory:
            on_hand = _stock_on_hand(db, item)
            inventory.adjust_stock(
                db,
                item,
                line.quantity,
                today,
                "vendor_credit_stock",
                vc.id,
                f"{reason} {vc.vendor_credit_number}",
                user.id,
                rate=Decimal("0"),
            )
            _receive_at_average_cost(item, on_hand, qty(line.quantity), money(line.rate))


# --------------------------------------------------------------------------- #
# Balances
# --------------------------------------------------------------------------- #
def _take(db: Session, doc, column: str, amount: Decimal) -> None:
    """Use ``amount`` of a credit's open balance, atomically (as payments do for invoices)."""
    model = type(doc)
    col = getattr(model, column)
    result = db.execute(
        update(model)
        .where(
            model.id == doc.id,
            model.status == "open",
            model.total - model.amount_applied - model.amount_refunded >= amount - _HALF_PAISA,
        )
        .values({column: func.round(col + amount, 2)})
        .execution_options(synchronize_session=False)
    )
    db.refresh(doc)
    if result.rowcount != 1:
        if doc.status != "open":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Only open credits can be used (current status: {doc.status})")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Amount exceeds the credits remaining of {money(doc.balance)}")
    refresh_status(doc)


def _give_back(db: Session, doc, column: str, amount: Decimal) -> None:
    model = type(doc)
    col = getattr(model, column)
    db.execute(
        update(model).where(model.id == doc.id).values({column: func.round(col - amount, 2)}).execution_options(synchronize_session=False)
    )
    db.refresh(doc)
    refresh_status(doc)


def refresh_status(doc) -> None:
    if doc.status in ("open", "closed"):
        doc.status = "closed" if money(doc.balance) <= 0 else "open"


def advance_balance(db: Session, org_id: str, party_type: str, contact_id: str) -> Decimal:
    """Unapplied advance held for a customer (credit on 2400) or paid to a vendor (debit on 1400)."""
    code = CUSTOMER_ADVANCES if party_type == "customer" else VENDOR_ADVANCES
    account = get_account_by_code(db, org_id, code)
    debit, credit = db.execute(
        select(func.coalesce(func.sum(JournalLine.debit), 0), func.coalesce(func.sum(JournalLine.credit), 0))
        .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
        .where(JournalEntry.organization_id == org_id, JournalLine.account_id == account.id, JournalLine.contact_id == contact_id)
    ).one()
    debit, credit = Decimal(str(debit)), Decimal(str(credit))
    return money(credit - debit if party_type == "customer" else debit - credit)


# --------------------------------------------------------------------------- #
# Applying credits and advances
# --------------------------------------------------------------------------- #
def _application_date(db: Session, org_id: str, when: Optional[date], *not_before: date) -> date:
    when = when or date.today()
    for floor in not_before:
        if when < floor:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"The date cannot be before {floor.strftime('%d %b %Y')}")
    # Nothing is posted, but a document balance in a closed period still changes.
    ledger.ensure_open(db, org_id, when)
    return when


def apply_credit_note(
    db: Session, cn: CreditNote, invoice: Invoice, amount: Decimal, when: Optional[date], user: User
) -> CreditApplication:
    if invoice.customer_id != cn.customer_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invoice {invoice.invoice_number} belongs to a different customer")
    when = _application_date(db, cn.organization_id, when, cn.date, invoice.date)
    amount = money(amount)
    _take(db, cn, "amount_applied", amount)
    _apply_invoice_payment(db, invoice, amount)
    app = CreditApplication(
        organization_id=cn.organization_id, credit_note_id=cn.id, invoice_id=invoice.id, date=when, amount=amount, created_by=user.id
    )
    db.add(app)
    db.flush()
    audit.record(db, user, "update", "credit_note", cn.id, f"Applied {amount} of {cn.credit_note_number} to {invoice.invoice_number}")
    return app


def apply_vendor_credit(db: Session, vc: VendorCredit, bill: Bill, amount: Decimal, when: Optional[date], user: User) -> CreditApplication:
    fx.guard_base_only(db, vc.organization_id, bill.currency, "Applying vendor credits")
    if bill.vendor_id != vc.vendor_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Bill {bill.bill_number} belongs to a different vendor")
    when = _application_date(db, vc.organization_id, when, vc.date, bill.date)
    amount = money(amount)
    _take(db, vc, "amount_applied", amount)
    _apply_bill_payment(db, bill, amount)
    app = CreditApplication(
        organization_id=vc.organization_id, vendor_credit_id=vc.id, bill_id=bill.id, date=when, amount=amount, created_by=user.id
    )
    db.add(app)
    db.flush()
    audit.record(db, user, "update", "vendor_credit", vc.id, f"Applied {amount} of {vc.vendor_credit_number} to {bill.bill_number}")
    return app


def apply_advance(db: Session, org_id: str, party_type: str, contact: Contact, document, amount: Decimal, when: Optional[date], user: User):
    """Settle an invoice from the customer's advance (Dr 2400, Cr AR), or a bill from a vendor advance (Dr AP, Cr 1400)."""
    fx.guard_base_only(db, org_id, document.currency, "Applying advances")
    amount = money(amount)
    when = _application_date(db, org_id, when, document.date)
    available = advance_balance(db, org_id, party_type, contact.id)
    if amount > available:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Amount exceeds the unused advance of {available}")
    if party_type == "customer":
        if document.customer_id != contact.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invoice {document.invoice_number} belongs to a different customer")
        _apply_invoice_payment(db, document, amount)
        receivable = contact.ledger_account_id or get_account_by_code(db, org_id, "1100").id
        desc = f"Advance applied to {document.invoice_number}"
        lines = [
            (get_account_by_code(db, org_id, CUSTOMER_ADVANCES).id, amount, Decimal("0"), desc, contact.id),
            (receivable, Decimal("0"), amount, desc, contact.id),
        ]
        app = CreditApplication(organization_id=org_id, invoice_id=document.id, date=when, amount=amount, created_by=user.id)
    else:
        if document.vendor_id != contact.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Bill {document.bill_number} belongs to a different vendor")
        _apply_bill_payment(db, document, amount)
        payable = contact.ledger_account_id or get_account_by_code(db, org_id, "2000").id
        desc = f"Advance applied to {document.bill_number}"
        lines = [
            (payable, amount, Decimal("0"), desc, contact.id),
            (get_account_by_code(db, org_id, VENDOR_ADVANCES).id, Decimal("0"), amount, desc, contact.id),
        ]
        app = CreditApplication(organization_id=org_id, bill_id=document.id, date=when, amount=amount, created_by=user.id)
    db.add(app)
    db.flush()
    ledger.post_entry(db, org_id, when, lines, "advance_application", app.id, reference=desc, created_by=user.id)
    audit.record(db, user, "update", party_type, contact.id, f"{desc} ({amount})")
    return app


def remove_application(db: Session, app: CreditApplication, user: User) -> None:
    ledger.ensure_open(db, app.organization_id, app.date, "change")
    amount = money(app.amount)
    if app.invoice_id:
        _remove_invoice_payment(db, app.invoice, amount)
    else:
        _remove_bill_payment(db, app.bill, amount)
    if app.credit_note_id:
        _give_back(db, app.credit_note, "amount_applied", amount)
    elif app.vendor_credit_id:
        _give_back(db, app.vendor_credit, "amount_applied", amount)
    else:
        ledger.reverse_entries_for_source(
            db, app.organization_id, "advance_application", app.id, date.today(), user.id, "Advance unapplied"
        )
    audit.record(db, user, "delete", "credit_application", app.id, f"Removed credit of {amount}")
    db.delete(app)


# --------------------------------------------------------------------------- #
# Refunds
# --------------------------------------------------------------------------- #
def record_refund(
    db: Session,
    user: User,
    party_type: str,
    contact: Contact,
    payload,
    credit_note: Optional[CreditNote] = None,
    vendor_credit: Optional[VendorCredit] = None,
) -> ContactRefund:
    """Pay a customer back (Dr AR or advances, Cr bank) or take a vendor's refund (Dr bank, Cr AP or advances)."""
    org_id = user.organization_id
    bank_acct = get_or_404(db, BankAccount, payload.bank_account_id, org_id, "Bank account")
    bank.require_active(bank_acct)
    amount = money(payload.amount)
    source = credit_note or vendor_credit
    if source is not None:
        if payload.date < source.date:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A refund cannot be dated before the credit it refunds")
        _take(db, source, "amount_refunded", amount)
    else:
        available = advance_balance(db, org_id, party_type, contact.id)
        if amount > available:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Amount exceeds the unused advance of {available}")

    refund = ContactRefund(
        organization_id=org_id,
        refund_number=numbering.next_number(db, org_id, "refund"),
        party_type=party_type,
        contact_id=contact.id,
        credit_note_id=credit_note.id if credit_note else None,
        vendor_credit_id=vendor_credit.id if vendor_credit else None,
        bank_account_id=bank_acct.id,
        date=payload.date,
        amount=amount,
        mode=payload.mode,
        reference=payload.reference,
        notes=payload.notes,
        created_by=user.id,
    )
    db.add(refund)
    db.flush()

    what = credit_note.credit_note_number if credit_note else vendor_credit.vendor_credit_number if vendor_credit else "advance"
    if party_type == "customer":
        if credit_note:
            counter: Account | str = contact.ledger_account_id or get_account_by_code(db, org_id, "1100").id
        else:
            counter = get_account_by_code(db, org_id, CUSTOMER_ADVANCES).id
        desc = f"Refund {refund.refund_number} to {contact.display_name} ({what})"
        lines = [(counter, amount, Decimal("0"), desc, contact.id), (bank_acct.ledger_account_id, Decimal("0"), amount, desc, contact.id)]
        movement = "withdrawal"
    else:
        if vendor_credit:
            counter = contact.ledger_account_id or get_account_by_code(db, org_id, "2000").id
        else:
            counter = get_account_by_code(db, org_id, VENDOR_ADVANCES).id
        desc = f"Refund {refund.refund_number} from {contact.display_name} ({what})"
        lines = [(bank_acct.ledger_account_id, amount, Decimal("0"), desc, contact.id), (counter, Decimal("0"), amount, desc, contact.id)]
        movement = "deposit"
    entry = ledger.post_entry(
        db, org_id, refund.date, lines, "refund", refund.id, reference=refund.reference or refund.refund_number, created_by=user.id
    )
    if movement == "withdrawal":
        # After the first write, so on SQLite this request already holds the lock.
        _check_cash_withdrawal(db, bank_acct, amount)
    bank.record_movement(
        db, bank_acct, refund.date, movement, amount, desc, "refund", refund.id, user.id, refund.reference, counter, entry.id
    )
    audit.record(db, user, "create", "refund", refund.id, desc)
    return refund


def delete_refund(db: Session, refund: ContactRefund, user: User) -> None:
    ledger.reverse_entries_for_source(db, refund.organization_id, "refund", refund.id, date.today(), user.id, "Refund deleted")
    if refund.party_type == "vendor":
        # Taking a received refund back out of a cash drawer must not overdraw it.
        _check_cash_withdrawal(db, refund.bank_account, money(refund.amount))
    bank.remove_movements(db, "refund", refund.id)
    if refund.credit_note:
        _give_back(db, refund.credit_note, "amount_refunded", money(refund.amount))
    if refund.vendor_credit:
        _give_back(db, refund.vendor_credit, "amount_refunded", money(refund.amount))
    audit.record(db, user, "delete", "refund", refund.id, f"Deleted refund {refund.refund_number}")
    db.delete(refund)
