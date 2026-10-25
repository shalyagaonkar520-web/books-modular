"""Things worth a second look, found in the books: anomaly alerts, customer
credit risk, and the daily digest.

All deterministic - no AI needed. Every alert links to the document it is about.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from statistics import median
from typing import Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.models import BankAccount, Bill, Contact, CustomerPayment, Expense, Invoice, Item, VendorPayment
from backend.services import bank
from backend.services.money import money

OPEN_INVOICE = ("sent", "partially_paid")
OPEN_BILL = ("open", "partially_paid")
LIVE_BILL = ("open", "partially_paid", "paid")
# A document is unusual when it is this many times the contact's usual amount.
UNUSUAL_FACTOR = Decimal("3")
LOOKBACK_DAYS = 365


@dataclass
class Alert:
    kind: str
    severity: str  # high | medium | low
    title: str
    detail: str
    doc_type: Optional[str] = None
    doc_id: Optional[str] = None
    amount: Optional[Decimal] = None


def _inr(value) -> str:
    return f"{money(value):,.2f}"


def anomalies(db: Session, org_id: str, today: Optional[date] = None) -> List[Alert]:
    today = today or date.today()
    since = today - timedelta(days=LOOKBACK_DAYS)
    alerts: List[Alert] = []
    bills = list(
        db.execute(
            select(Bill)
            .where(Bill.organization_id == org_id, Bill.status.in_(LIVE_BILL), Bill.date >= since)
            .options(selectinload(Bill.vendor))
            .order_by(Bill.date, Bill.created_at)
        ).scalars()
    )

    # Duplicate bills: same vendor bill number, or same vendor and amount within a week.
    seen_numbers: Dict[tuple, Bill] = {}
    by_vendor_amount: Dict[tuple, List[Bill]] = defaultdict(list)
    for b in bills:
        number = (b.vendor_bill_number or "").strip().lower()
        if number:
            key = (b.vendor_id, number)
            if key in seen_numbers:
                first = seen_numbers[key]
                alerts.append(
                    Alert(
                        "duplicate_bill",
                        "high",
                        f"Possible duplicate bill {b.bill_number}",
                        f"{b.vendor.display_name}'s bill number {b.vendor_bill_number} was already entered as {first.bill_number}.",
                        "bill",
                        b.id,
                        b.total,
                    )
                )
                continue
            seen_numbers[key] = b
        for other in by_vendor_amount[(b.vendor_id, b.total)]:
            if abs((b.date - other.date).days) <= 7:
                alerts.append(
                    Alert(
                        "duplicate_bill",
                        "medium",
                        f"Same amount billed twice: {b.bill_number}",
                        f"{b.vendor.display_name} billed {_inr(b.total)} on {other.date.isoformat()} ({other.bill_number}) "
                        f"and again on {b.date.isoformat()}.",
                        "bill",
                        b.id,
                        b.total,
                    )
                )
                break
        by_vendor_amount[(b.vendor_id, b.total)].append(b)

    # Unusual amounts: a bill far above what the vendor usually charges.
    history: Dict[str, List[Decimal]] = defaultdict(list)
    for b in bills:
        past = history[b.vendor_id]
        if len(past) >= 3:
            usual = Decimal(str(median(past)))
            if usual > 0 and b.total > usual * UNUSUAL_FACTOR:
                alerts.append(
                    Alert(
                        "unusual_amount",
                        "medium",
                        f"Unusually large bill {b.bill_number}",
                        f"{_inr(b.total)} from {b.vendor.display_name}; their bills are usually around {_inr(usual)}.",
                        "bill",
                        b.id,
                        b.total,
                    )
                )
        past.append(b.total)
    expenses = list(
        db.execute(
            select(Expense)
            .where(Expense.organization_id == org_id, Expense.date >= since)
            .options(selectinload(Expense.account))
            .order_by(Expense.date, Expense.created_at)
        ).scalars()
    )
    by_account: Dict[str, List[Decimal]] = defaultdict(list)
    for e in expenses:
        past = by_account[e.account_id]
        if len(past) >= 5:
            usual = Decimal(str(median(past)))
            if usual > 0 and e.total > usual * UNUSUAL_FACTOR:
                alerts.append(
                    Alert(
                        "unusual_amount",
                        "low",
                        f"Unusually large expense {e.expense_number}",
                        f"{_inr(e.total)} on {e.account.name}; usually around {_inr(usual)}.",
                        "expense",
                        e.id,
                        e.total,
                    )
                )
        past.append(e.total)

    # GST: tax charged by a vendor with no GSTIN cannot be claimed as input credit.
    flagged_vendors = set()
    for b in bills:
        if b.tax_total > 0 and not (b.vendor.gstin or "").strip() and not b.reverse_charge and b.vendor_id not in flagged_vendors:
            flagged_vendors.add(b.vendor_id)
            alerts.append(
                Alert(
                    "missing_gstin",
                    "medium",
                    f"No GSTIN for {b.vendor.display_name}",
                    f"Bill {b.bill_number} charges GST of {_inr(b.tax_total)}, but the vendor has no GSTIN: the input credit may be refused.",
                    "contact",
                    b.vendor_id,
                    b.tax_total,
                )
            )
    registered_without = db.execute(
        select(Contact).where(
            Contact.organization_id == org_id,
            Contact.type == "customer",
            Contact.is_active.is_(True),
            Contact.gst_treatment == "registered_business",
            func.coalesce(Contact.gstin, "") == "",
        )
    ).scalars()
    for c in registered_without:
        alerts.append(
            Alert(
                "missing_gstin",
                "low",
                f"No GSTIN for {c.display_name}",
                "Marked as a registered business but no GSTIN: B2B invoices to them will not report correctly in GSTR-1.",
                "contact",
                c.id,
            )
        )

    # Cash: a bank or cash account below zero.
    for acct_id, balance in bank.balances_for_org(db, org_id).items():
        if balance >= 0:
            continue
        acct = db.get(BankAccount, acct_id)
        if acct is not None and acct.type != "credit_card":
            alerts.append(
                Alert("negative_cash", "high", f"{acct.name} is overdrawn", f"Balance {_inr(balance)}.", "bank_account", acct_id, balance)
            )

    # Drafts forgotten for over a month.
    stale = db.execute(
        select(func.count())
        .select_from(Invoice)
        .where(Invoice.organization_id == org_id, Invoice.status == "draft", Invoice.created_at < today - timedelta(days=30))
    ).scalar_one()
    if stale:
        alerts.append(
            Alert(
                "stale_drafts", "low", f"{stale} draft invoice(s) older than 30 days", "Send them or delete them so revenue is not missed."
            )
        )
    order = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: (order[a.severity], a.kind))
    return alerts


# --------------------------------------------------------------------------- #
# Customer credit risk
# --------------------------------------------------------------------------- #
@dataclass
class CreditRisk:
    customer_id: str
    customer_name: str
    score: int
    grade: str
    outstanding: Decimal
    overdue: Decimal
    max_days_overdue: int
    average_days_late: Optional[Decimal]
    invoices_paid: int
    on_time_percent: Optional[Decimal]
    advice: str
    reasons: List[str] = field(default_factory=list)


def _grade(score: int) -> tuple[str, str]:
    if score >= 80:
        return "A", "Reliable payer: normal terms are fine."
    if score >= 60:
        return "B", "Usually pays, sometimes late: send reminders before the due date."
    if score >= 40:
        return "C", "Often late: shorten payment terms or ask for part payment in advance."
    return "D", "High risk: take advance payment before supplying more."


def credit_risk(db: Session, org_id: str, today: Optional[date] = None) -> List[CreditRisk]:
    """Score each customer 0-100 from how they have paid: lateness on paid invoices,
    what is overdue now and for how long."""
    today = today or date.today()
    invoices = list(
        db.execute(
            select(Invoice)
            .where(Invoice.organization_id == org_id, Invoice.status.in_(("sent", "partially_paid", "paid")))
            .options(selectinload(Invoice.customer))
        ).scalars()
    )
    last_paid: Dict[str, date] = {}
    for invoice_id, paid_on in db.execute(
        select(CustomerPayment.invoice_id, func.max(CustomerPayment.date))
        .where(CustomerPayment.organization_id == org_id, CustomerPayment.invoice_id.is_not(None))
        .group_by(CustomerPayment.invoice_id)
    ):
        last_paid[invoice_id] = paid_on
    per: Dict[str, List[Invoice]] = defaultdict(list)
    for inv in invoices:
        per[inv.customer_id].append(inv)
    out: List[CreditRisk] = []
    for customer_id, rows in per.items():
        customer = rows[0].customer
        late_days: List[int] = []
        on_time = 0
        outstanding = overdue = Decimal("0")
        max_overdue = 0
        for inv in rows:
            if inv.status == "paid":
                paid_on = last_paid.get(inv.id)
                if paid_on:
                    late = max(0, (paid_on - inv.due_date).days)
                    late_days.append(late)
                    on_time += late == 0
            else:
                outstanding += inv.balance_due
                if inv.due_date < today:
                    overdue += inv.balance_due
                    max_overdue = max(max_overdue, (today - inv.due_date).days)
        avg_late = Decimal(sum(late_days)) / len(late_days) if late_days else None
        score = Decimal("100")
        reasons: List[str] = []
        if avg_late is not None and avg_late > 0:
            score -= min(Decimal("40"), avg_late)
            reasons.append(f"Pays {avg_late:.0f} days late on average")
        if outstanding > 0 and overdue > 0:
            ratio = overdue / outstanding
            score -= ratio * 30
            reasons.append(f"{_inr(overdue)} of {_inr(outstanding)} is overdue")
        if max_overdue:
            score -= min(Decimal("25"), Decimal(max_overdue) / 3)
            reasons.append(f"Oldest unpaid invoice is {max_overdue} days past due")
        if not late_days and not reasons:
            reasons.append("No payment history yet" if outstanding else "No issues")
        final = max(0, min(100, int(score)))
        grade, advice = _grade(final)
        out.append(
            CreditRisk(
                customer_id=customer_id,
                customer_name=customer.display_name,
                score=final,
                grade=grade,
                outstanding=money(outstanding),
                overdue=money(overdue),
                max_days_overdue=max_overdue,
                average_days_late=money(avg_late) if avg_late is not None else None,
                invoices_paid=len(late_days),
                on_time_percent=money(Decimal(on_time) * 100 / len(late_days)) if late_days else None,
                advice=advice,
                reasons=reasons,
            )
        )
    out.sort(key=lambda r: (r.score, -r.outstanding))
    return out


# --------------------------------------------------------------------------- #
# Daily digest
# --------------------------------------------------------------------------- #
def digest(db: Session, org_id: str, day: Optional[date] = None) -> List[str]:
    """What happened yesterday and what needs attention, as plain lines."""
    day = day or (date.today() - timedelta(days=1))
    week_ahead = day + timedelta(days=8)

    def total(model, column, *where) -> Decimal:
        return money(db.execute(select(func.coalesce(func.sum(column), 0)).where(model.organization_id == org_id, *where)).scalar_one())

    sales = total(Invoice, Invoice.total, Invoice.date == day, Invoice.status.notin_(("draft", "void")))
    received = total(CustomerPayment, CustomerPayment.amount, CustomerPayment.date == day)
    paid = total(VendorPayment, VendorPayment.amount, VendorPayment.date == day)
    spent = total(Expense, Expense.total, Expense.date == day)
    cash = money(sum(bank.balances_for_org(db, org_id).values(), Decimal("0")))
    overdue = total(Invoice, Invoice.total - Invoice.amount_paid, Invoice.status.in_(OPEN_INVOICE), Invoice.due_date <= day)
    bills_due = total(Bill, Bill.total - Bill.amount_paid, Bill.status.in_(OPEN_BILL), Bill.due_date <= week_ahead)
    low_stock = db.execute(
        select(func.count())
        .select_from(Item)
        .where(
            Item.organization_id == org_id,
            Item.is_active.is_(True),
            Item.track_inventory.is_(True),
            Item.stock_on_hand <= Item.reorder_level,
            Item.reorder_level > 0,
        )
    ).scalar_one()
    alerts = [a for a in anomalies(db, org_id, day + timedelta(days=1)) if a.severity == "high"]
    lines = [
        f"Sales invoiced: INR {_inr(sales)}",
        f"Money received: INR {_inr(received)}",
        f"Paid to vendors: INR {_inr(paid)}",
        f"Expenses: INR {_inr(spent)}",
        f"Cash and bank now: INR {_inr(cash)}",
        f"Overdue from customers: INR {_inr(overdue)}",
        f"Bills due in the next 7 days: INR {_inr(bills_due)}",
    ]
    if low_stock:
        lines.append(f"Items at or below reorder level: {low_stock}")
    if alerts:
        lines.append(f"Urgent alerts: {len(alerts)} ({'; '.join(a.title for a in alerts[:3])})")
    return lines
