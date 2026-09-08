"""Financial and operational reports derived from the ledger and documents."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user
from backend.models import Account, Bill, Expense, Invoice, Item, User
from backend.schemas.reports import (
    AgingBucket,
    AgingReport,
    AgingRow,
    BalanceSheet,
    ContactTotalsReport,
    ContactTotalsRow,
    ExpenseByCategoryReport,
    ExpenseByCategoryRow,
    InventoryRow,
    InventorySummaryReport,
    ProfitAndLoss,
    ReportLine,
    ReportSection,
    TaxSummary,
)
from backend.services import ledger
from backend.services.money import money
from backend.services.periods import fiscal_year_bounds

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def _default_range(user: User, start: Optional[date], end: Optional[date]):
    fy_start, fy_end = fiscal_year_bounds(date.today(), user.organization.fiscal_year_start_month)
    return start or fy_start, end or min(fy_end, date.today())


def _section(title: str, accounts: List[Account], balances: dict, predicate) -> ReportSection:
    lines: List[ReportLine] = []
    total = Decimal("0")
    for acct in accounts:
        if not predicate(acct):
            continue
        d, c = balances.get(acct.id, (Decimal("0"), Decimal("0")))
        amount = ledger.natural_balance(acct.type, d, c)
        if amount == 0:
            continue
        lines.append(ReportLine(account_id=acct.id, code=acct.code, name=acct.name, amount=amount))
        total += amount
    return ReportSection(title=title, lines=lines, total=money(total))


@router.get("/profit-and-loss", response_model=ProfitAndLoss)
def profit_and_loss(start_date: Optional[date] = None, end_date: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    start, end = _default_range(user, start_date, end_date)
    accounts = db.execute(select(Account).where(Account.organization_id == user.organization_id).order_by(Account.code)).scalars().all()
    balances = ledger.account_balances(db, user.organization_id, start=start, end=end)
    income = _section("Operating Income", accounts, balances, lambda a: a.type == "income" and a.subtype != "other_income")
    cogs = _section("Cost of Goods Sold", accounts, balances, lambda a: a.type == "expense" and a.subtype in ("cogs", "contra_expense"))
    opex = _section("Operating Expenses", accounts, balances, lambda a: a.type == "expense" and a.subtype not in ("cogs", "contra_expense"))
    other = _section("Other Income", accounts, balances, lambda a: a.type == "income" and a.subtype == "other_income")
    gross = money(income.total - cogs.total)
    operating = money(gross - opex.total)
    return ProfitAndLoss(
        start_date=start, end_date=end, income=income, cost_of_goods_sold=cogs, gross_profit=gross, operating_expenses=opex,
        operating_profit=operating, other_income=other, net_profit=money(operating + other.total),
    )


@router.get("/balance-sheet", response_model=BalanceSheet)
def balance_sheet(as_of: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    as_of = as_of or date.today()
    accounts = db.execute(select(Account).where(Account.organization_id == user.organization_id).order_by(Account.code)).scalars().all()
    balances = ledger.account_balances(db, user.organization_id, end=as_of)
    assets = _section("Assets", accounts, balances, lambda a: a.type == "asset")
    liabilities = _section("Liabilities", accounts, balances, lambda a: a.type == "liability")
    equity = _section("Equity", accounts, balances, lambda a: a.type == "equity")
    earnings = Decimal("0")
    for acct in accounts:
        if acct.type in ("income", "expense"):
            d, c = balances.get(acct.id, (Decimal("0"), Decimal("0")))
            earnings += (c - d) if acct.type == "income" else -(d - c)
    earnings = money(earnings)
    total_le = money(liabilities.total + equity.total + earnings)
    return BalanceSheet(
        as_of=as_of, assets=assets, liabilities=liabilities, equity=equity, current_period_earnings=earnings,
        total_liabilities_and_equity=total_le, is_balanced=abs(assets.total - total_le) < Decimal("0.01"),
    )


def _aging(docs, as_of: date, contact_attr: str) -> AgingReport:
    rows: Dict[str, AgingRow] = {}
    buckets = {"Current": [Decimal("0"), 0], "1-30 days": [Decimal("0"), 0], "31-60 days": [Decimal("0"), 0], "61-90 days": [Decimal("0"), 0], "> 90 days": [Decimal("0"), 0]}
    for doc in docs:
        balance = money(doc.balance_due)
        if balance <= 0:
            continue
        contact = getattr(doc, contact_attr)
        row = rows.setdefault(contact.id, AgingRow(contact_id=contact.id, contact_name=contact.display_name, current=Decimal("0"), days_1_30=Decimal("0"), days_31_60=Decimal("0"), days_61_90=Decimal("0"), days_over_90=Decimal("0"), total=Decimal("0")))
        overdue_days = (as_of - doc.due_date).days
        if overdue_days <= 0:
            key = "Current"
            row.current += balance
        elif overdue_days <= 30:
            key = "1-30 days"
            row.days_1_30 += balance
        elif overdue_days <= 60:
            key = "31-60 days"
            row.days_31_60 += balance
        elif overdue_days <= 90:
            key = "61-90 days"
            row.days_61_90 += balance
        else:
            key = "> 90 days"
            row.days_over_90 += balance
        row.total += balance
        buckets[key][0] += balance
        buckets[key][1] += 1
    ordered = sorted(rows.values(), key=lambda r: r.total, reverse=True)
    return AgingReport(
        as_of=as_of, rows=ordered, buckets=[AgingBucket(label=k, amount=money(v[0]), count=v[1]) for k, v in buckets.items()],
        total=money(sum((r.total for r in ordered), Decimal("0"))),
    )


@router.get("/receivables-aging", response_model=AgingReport)
def receivables_aging(as_of: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    as_of = as_of or date.today()
    docs = db.execute(
        select(Invoice).where(Invoice.organization_id == user.organization_id, Invoice.status.in_(("sent", "partially_paid")), Invoice.date <= as_of).options(selectinload(Invoice.customer))
    ).scalars().all()
    return _aging(docs, as_of, "customer")


@router.get("/payables-aging", response_model=AgingReport)
def payables_aging(as_of: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    as_of = as_of or date.today()
    docs = db.execute(
        select(Bill).where(Bill.organization_id == user.organization_id, Bill.status.in_(("open", "partially_paid")), Bill.date <= as_of).options(selectinload(Bill.vendor))
    ).scalars().all()
    return _aging(docs, as_of, "vendor")


def _contact_totals(docs, contact_attr: str, start: date, end: date) -> ContactTotalsReport:
    rows: Dict[str, ContactTotalsRow] = {}
    for doc in docs:
        contact = getattr(doc, contact_attr)
        row = rows.setdefault(contact.id, ContactTotalsRow(contact_id=contact.id, contact_name=contact.display_name, document_count=0, amount=Decimal("0"), amount_paid=Decimal("0"), balance=Decimal("0")))
        row.document_count += 1
        row.amount += doc.total
        row.amount_paid += doc.amount_paid
        row.balance += doc.balance_due
    ordered = sorted(rows.values(), key=lambda r: r.amount, reverse=True)
    return ContactTotalsReport(start_date=start, end_date=end, rows=ordered, total=money(sum((r.amount for r in ordered), Decimal("0"))))


@router.get("/sales-by-customer", response_model=ContactTotalsReport)
def sales_by_customer(start_date: Optional[date] = None, end_date: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    start, end = _default_range(user, start_date, end_date)
    docs = db.execute(
        select(Invoice).where(Invoice.organization_id == user.organization_id, Invoice.status.notin_(("draft", "void")), Invoice.date >= start, Invoice.date <= end).options(selectinload(Invoice.customer))
    ).scalars().all()
    return _contact_totals(docs, "customer", start, end)


@router.get("/purchases-by-vendor", response_model=ContactTotalsReport)
def purchases_by_vendor(start_date: Optional[date] = None, end_date: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    start, end = _default_range(user, start_date, end_date)
    docs = db.execute(
        select(Bill).where(Bill.organization_id == user.organization_id, Bill.status.notin_(("draft", "void")), Bill.date >= start, Bill.date <= end).options(selectinload(Bill.vendor))
    ).scalars().all()
    return _contact_totals(docs, "vendor", start, end)


@router.get("/expenses-by-category", response_model=ExpenseByCategoryReport)
def expenses_by_category(start_date: Optional[date] = None, end_date: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    start, end = _default_range(user, start_date, end_date)
    expenses = db.execute(
        select(Expense).where(Expense.organization_id == user.organization_id, Expense.date >= start, Expense.date <= end).options(selectinload(Expense.account))
    ).scalars().all()
    rows: Dict[str, ExpenseByCategoryRow] = {}
    for e in expenses:
        row = rows.setdefault(e.account_id, ExpenseByCategoryRow(account_id=e.account_id, account_name=e.account.name, count=0, amount=Decimal("0")))
        row.count += 1
        row.amount += e.amount
    ordered = sorted(rows.values(), key=lambda r: r.amount, reverse=True)
    return ExpenseByCategoryReport(start_date=start, end_date=end, rows=ordered, total=money(sum((r.amount for r in ordered), Decimal("0"))))


@router.get("/inventory-summary", response_model=InventorySummaryReport)
def inventory_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.execute(select(Item).where(Item.organization_id == user.organization_id, Item.is_active.is_(True)).order_by(Item.name)).scalars().all()
    rows: List[InventoryRow] = []
    total_value = Decimal("0")
    low = 0
    for item in items:
        if not item.track_inventory:
            continue
        value = money(item.stock_on_hand * item.cost_price)
        is_low = item.stock_on_hand <= item.reorder_level
        low += 1 if is_low else 0
        total_value += value
        rows.append(InventoryRow(item_id=item.id, name=item.name, sku=item.sku, unit=item.unit, stock_on_hand=item.stock_on_hand,
                                 reorder_level=item.reorder_level, cost_price=item.cost_price, stock_value=value, is_low_stock=is_low))
    return InventorySummaryReport(rows=rows, total_items=len(items), tracked_items=len(rows), low_stock_items=low, total_stock_value=money(total_value))


@router.get("/tax-summary", response_model=TaxSummary)
def tax_summary(start_date: Optional[date] = None, end_date: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    start, end = _default_range(user, start_date, end_date)
    invoices = db.execute(select(Invoice).where(Invoice.organization_id == user.organization_id, Invoice.status.notin_(("draft", "void")), Invoice.date >= start, Invoice.date <= end)).scalars().all()
    bills = db.execute(select(Bill).where(Bill.organization_id == user.organization_id, Bill.status.notin_(("draft", "void")), Bill.date >= start, Bill.date <= end)).scalars().all()
    expenses = db.execute(select(Expense).where(Expense.organization_id == user.organization_id, Expense.date >= start, Expense.date <= end)).scalars().all()
    output = money(sum((i.tax_total for i in invoices), Decimal("0")))
    input_tax = money(sum((b.tax_total for b in bills), Decimal("0")) + sum((e.tax_amount for e in expenses), Decimal("0")))
    return TaxSummary(
        start_date=start, end_date=end, output_gst=output, input_gst=input_tax, net_payable=money(output - input_tax),
        taxable_sales=money(sum((i.subtotal - i.discount_amount for i in invoices), Decimal("0"))),
        taxable_purchases=money(sum((b.subtotal - b.discount_amount for b in bills), Decimal("0")) + sum((e.amount for e in expenses), Decimal("0"))),
    )
