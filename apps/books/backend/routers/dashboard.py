"""Dashboard aggregates and notifications computed from real transactions."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user
from backend.models import (
    Account,
    BankAccount,
    BankTransaction,
    Bill,
    CustomerPayment,
    Expense,
    Invoice,
    Item,
    JournalEntry,
    JournalLine,
    Project,
    TimeEntry,
    User,
    VendorPayment,
)
from backend.schemas.dashboard import (
    BankBalance,
    CashFlowSummary,
    DashboardSummary,
    IncomeExpenseSummary,
    InventorySummary,
    NotificationItem,
    Notifications,
    PayablesSummary,
    PeriodBreakdown,
    ReceivablesSummary,
    RecentActivity,
    TopCustomer,
)
from backend.services import bank
from backend.services.money import money
from backend.services.periods import resolve_period

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])
PERIODS = ("this_fiscal_year", "last_fiscal_year", "this_quarter", "this_month", "last_month")


def _receivables(db: Session, org_id: str, today: date) -> ReceivablesSummary:
    open_inv = db.execute(select(Invoice).where(Invoice.organization_id == org_id, Invoice.status.in_(("sent", "partially_paid")))).scalars().all()
    overdue = sum((i.balance_due for i in open_inv if i.due_date < today), Decimal("0"))
    total = sum((i.balance_due for i in open_inv), Decimal("0"))
    return ReceivablesSummary(total_unpaid_invoices=len(open_inv), current_amount=money(total - overdue), overdue_amount=money(overdue), total_receivables=money(total))


def _payables(db: Session, org_id: str, today: date) -> PayablesSummary:
    open_bills = db.execute(select(Bill).where(Bill.organization_id == org_id, Bill.status.in_(("open", "partially_paid")))).scalars().all()
    overdue = sum((b.balance_due for b in open_bills if b.due_date < today), Decimal("0"))
    total = sum((b.balance_due for b in open_bills), Decimal("0"))
    return PayablesSummary(total_unpaid_bills=len(open_bills), current_amount=money(total - overdue), overdue_amount=money(overdue), total_payables=money(total))


def _cash_flow(db: Session, org_id: str, period: str, today: date, fiscal_start: int) -> CashFlowSummary:
    start, end, buckets = resolve_period(period, today, fiscal_start)
    accounts = db.execute(select(BankAccount).where(BankAccount.organization_id == org_id, BankAccount.is_active.is_(True))).scalars().all()
    opening = Decimal("0")
    for acct in accounts:
        if acct.opening_balance_date < start:
            opening += bank.current_balance(db, acct, as_of=start - timedelta(days=1))
    txs = db.execute(
        select(BankTransaction).where(BankTransaction.organization_id == org_id, BankTransaction.date >= start, BankTransaction.date <= end, BankTransaction.source_type != "transfer")
    ).scalars().all()
    # opening balances that fall inside the period count as inflow
    for acct in accounts:
        if start <= acct.opening_balance_date <= end and acct.opening_balance:
            txs.append(BankTransaction(date=acct.opening_balance_date, type="deposit" if acct.opening_balance > 0 else "withdrawal", amount=abs(acct.opening_balance), source_type="opening"))
    incoming = sum((t.amount for t in txs if t.type == "deposit"), Decimal("0"))
    outgoing = sum((t.amount for t in txs if t.type == "withdrawal"), Decimal("0"))
    breakdown: List[PeriodBreakdown] = []
    for label, b_start, b_end in buckets:
        b_in = sum((t.amount for t in txs if t.type == "deposit" and b_start <= t.date <= b_end), Decimal("0"))
        b_out = sum((t.amount for t in txs if t.type == "withdrawal" and b_start <= t.date <= b_end), Decimal("0"))
        breakdown.append(PeriodBreakdown(label=label, start=b_start, end=b_end, incoming=money(b_in), outgoing=money(b_out)))
    return CashFlowSummary(
        period=period, start_date=start, end_date=end, opening_balance=money(opening), incoming_amount=money(incoming), outgoing_amount=money(outgoing),
        net_cash_flow=money(incoming - outgoing), closing_balance=money(opening + incoming - outgoing), breakdown=breakdown,
    )


def _income_expense(db: Session, org_id: str, period: str, today: date, fiscal_start: int) -> IncomeExpenseSummary:
    start, end, buckets = resolve_period(period, today, fiscal_start)
    rows = db.execute(
        select(JournalEntry.date, Account.type, JournalLine.debit, JournalLine.credit)
        .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
        .join(Account, Account.id == JournalLine.account_id)
        .where(JournalEntry.organization_id == org_id, JournalEntry.date >= start, JournalEntry.date <= end, Account.type.in_(("income", "expense")))
    ).all()
    breakdown: List[PeriodBreakdown] = []
    total_income = total_expense = Decimal("0")
    for label, b_start, b_end in buckets:
        inc = exp = Decimal("0")
        for d, acc_type, debit, credit in rows:
            if b_start <= d <= b_end:
                if acc_type == "income":
                    inc += credit - debit
                else:
                    exp += debit - credit
        total_income += inc
        total_expense += exp
        breakdown.append(PeriodBreakdown(label=label, start=b_start, end=b_end, incoming=money(inc), outgoing=money(exp)))
    return IncomeExpenseSummary(start_date=start, end_date=end, total_income=money(total_income), total_expense=money(total_expense), net=money(total_income - total_expense), breakdown=breakdown)


def _inventory(db: Session, org_id: str) -> InventorySummary:
    items = db.execute(select(Item).where(Item.organization_id == org_id, Item.is_active.is_(True))).scalars().all()
    tracked = [i for i in items if i.track_inventory]
    return InventorySummary(
        total_items_count=len(items), goods_count=sum(1 for i in items if i.type == "goods"), service_count=sum(1 for i in items if i.type == "service"),
        tracked_count=len(tracked), total_inventory_valuation=money(sum((i.stock_on_hand * i.cost_price for i in tracked), Decimal("0"))),
        low_stock_items_count=sum(1 for i in tracked if i.stock_on_hand <= i.reorder_level),
    )


@router.get("/summary", response_model=DashboardSummary)
def summary(period: str = Query("this_fiscal_year", pattern="^(this_fiscal_year|last_fiscal_year|this_quarter|this_month|last_month)$"), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org_id = user.organization_id
    today = date.today()
    fiscal_start = user.organization.fiscal_year_start_month
    start, end, _ = resolve_period(period, today, fiscal_start)

    balances = bank.balances_for_org(db, org_id)
    accounts = {a.id: a for a in db.execute(select(BankAccount).where(BankAccount.organization_id == org_id, BankAccount.is_active.is_(True))).scalars()}
    bank_balances = [BankBalance(bank_account_id=aid, name=accounts[aid].name, type=accounts[aid].type, balance=bal) for aid, bal in balances.items()]
    total_cash = money(sum((b.balance if b.type != "credit_card" else -b.balance for b in bank_balances), Decimal("0")))

    invoices = db.execute(
        select(Invoice).where(Invoice.organization_id == org_id, Invoice.status.notin_(("draft", "void")), Invoice.date >= start, Invoice.date <= end).options(selectinload(Invoice.customer))
    ).scalars().all()
    per_customer: Dict[str, TopCustomer] = {}
    for inv in invoices:
        row = per_customer.setdefault(inv.customer_id, TopCustomer(contact_id=inv.customer_id, contact_name=inv.customer.display_name, amount=Decimal("0")))
        row.amount += inv.total
    top_customers = sorted(per_customer.values(), key=lambda r: r.amount, reverse=True)[:5]

    recent: List[RecentActivity] = []
    for inv in db.execute(select(Invoice).where(Invoice.organization_id == org_id).options(selectinload(Invoice.customer)).order_by(Invoice.created_at.desc()).limit(5)).scalars():
        recent.append(RecentActivity(id=inv.id, type="invoice", number=inv.invoice_number, contact_name=inv.customer.display_name, date=inv.date, amount=inv.total, status=inv.status))
    for b in db.execute(select(Bill).where(Bill.organization_id == org_id).options(selectinload(Bill.vendor)).order_by(Bill.created_at.desc()).limit(5)).scalars():
        recent.append(RecentActivity(id=b.id, type="bill", number=b.bill_number, contact_name=b.vendor.display_name, date=b.date, amount=b.total, status=b.status))
    for p in db.execute(select(CustomerPayment).where(CustomerPayment.organization_id == org_id).options(selectinload(CustomerPayment.customer)).order_by(CustomerPayment.created_at.desc()).limit(5)).scalars():
        recent.append(RecentActivity(id=p.id, type="customer_payment", number=p.payment_number, contact_name=p.customer.display_name, date=p.date, amount=p.amount))
    for p in db.execute(select(VendorPayment).where(VendorPayment.organization_id == org_id).options(selectinload(VendorPayment.vendor)).order_by(VendorPayment.created_at.desc()).limit(5)).scalars():
        recent.append(RecentActivity(id=p.id, type="vendor_payment", number=p.payment_number, contact_name=p.vendor.display_name, date=p.date, amount=p.amount))
    for e in db.execute(select(Expense).where(Expense.organization_id == org_id).options(selectinload(Expense.account)).order_by(Expense.created_at.desc()).limit(5)).scalars():
        recent.append(RecentActivity(id=e.id, type="expense", number=e.expense_number, contact_name=e.account.name, date=e.date, amount=e.total))
    recent.sort(key=lambda r: r.date, reverse=True)

    unbilled = db.execute(
        select(TimeEntry, Project).join(Project, Project.id == TimeEntry.project_id)
        .where(TimeEntry.organization_id == org_id, TimeEntry.is_billable.is_(True), TimeEntry.invoice_id.is_(None))
    ).all()
    unbilled_hours = sum((t.hours for t, _ in unbilled), Decimal("0"))
    unbilled_amount = sum((t.hours * p.hourly_rate for t, p in unbilled if p.billing_method == "hourly"), Decimal("0"))

    return DashboardSummary(
        receivables=_receivables(db, org_id, today), payables=_payables(db, org_id, today),
        cash_flow=_cash_flow(db, org_id, period, today, fiscal_start), income_expense=_income_expense(db, org_id, period, today, fiscal_start),
        inventory=_inventory(db, org_id), bank_balances=bank_balances, total_cash=total_cash, top_customers=top_customers,
        recent_activity=recent[:10], unbilled_hours=unbilled_hours, unbilled_amount=money(unbilled_amount),
    )


@router.get("/notifications", response_model=Notifications)
def notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org_id = user.organization_id
    today = date.today()
    items: List[NotificationItem] = []
    overdue_inv = db.execute(
        select(Invoice).where(Invoice.organization_id == org_id, Invoice.status.in_(("sent", "partially_paid")), Invoice.due_date < today).options(selectinload(Invoice.customer)).order_by(Invoice.due_date).limit(10)
    ).scalars().all()
    for inv in overdue_inv:
        days = (today - inv.due_date).days
        items.append(NotificationItem(id=f"inv-{inv.id}", kind="overdue_invoice", title=f"Invoice {inv.invoice_number} is overdue", body=f"{inv.customer.display_name} owes {inv.balance_due:,.2f}, {days} day(s) past due.", entity_type="invoice", entity_id=inv.id, severity="danger"))
    overdue_bills = db.execute(
        select(Bill).where(Bill.organization_id == org_id, Bill.status.in_(("open", "partially_paid")), Bill.due_date < today).options(selectinload(Bill.vendor)).order_by(Bill.due_date).limit(10)
    ).scalars().all()
    for b in overdue_bills:
        days = (today - b.due_date).days
        items.append(NotificationItem(id=f"bill-{b.id}", kind="overdue_bill", title=f"Bill {b.bill_number} is overdue", body=f"{b.balance_due:,.2f} due to {b.vendor.display_name}, {days} day(s) past due.", entity_type="bill", entity_id=b.id, severity="warning"))
    low_stock = db.execute(
        select(Item).where(Item.organization_id == org_id, Item.is_active.is_(True), Item.track_inventory.is_(True), Item.stock_on_hand <= Item.reorder_level).order_by(Item.stock_on_hand).limit(10)
    ).scalars().all()
    for item in low_stock:
        items.append(NotificationItem(id=f"item-{item.id}", kind="low_stock", title=f"Low stock: {item.name}", body=f"{item.stock_on_hand} {item.unit} on hand (reorder at {item.reorder_level}).", entity_type="item", entity_id=item.id, severity="warning"))
    unreconciled = db.execute(select(BankTransaction.id).where(BankTransaction.organization_id == org_id, BankTransaction.is_reconciled.is_(False))).scalars().all()
    if len(unreconciled) >= 10:
        items.append(NotificationItem(id="recon", kind="unreconciled", title=f"{len(unreconciled)} bank transactions awaiting reconciliation", body="Review them in Banking to keep your books accurate.", entity_type="banking", severity="info"))
    return Notifications(items=items, count=len(items))
