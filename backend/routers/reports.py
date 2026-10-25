"""Financial and operational reports derived from the ledger and documents."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_financial_read
from backend.models import (
    Account,
    Bill,
    CreditApplication,
    CreditNote,
    CustomerPayment,
    Expense,
    Invoice,
    Item,
    User,
    VendorCredit,
    VendorPayment,
)
from backend.schemas.documents_flow import CashFlowLine, CashFlowSection, CashFlowStatement
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
from backend.services import bank, ledger
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money
from backend.services.periods import fiscal_year_bounds

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def _default_range(user: User, start: Optional[date], end: Optional[date]):
    if start and end and start > end:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The start date cannot be after the end date")
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
def profit_and_loss(
    start_date: Optional[date] = Query(default=None, alias="startDate"),
    end_date: Optional[date] = Query(default=None, alias="endDate"),
    # Also accept the snake_case form so existing callers aren't broken
    start_date_snake: Optional[date] = Query(default=None, alias="start_date"),
    end_date_snake: Optional[date] = Query(default=None, alias="end_date"),
    # One branch only; omitted = the whole organization.
    branch_id: Optional[str] = Query(default=None, alias="branchId"),
    # Ledger account balances: Admin and Viewer only, like Accounting.
    user: User = Depends(require_financial_read),
    db: Session = Depends(get_db),
):
    effective_start = start_date or start_date_snake
    effective_end = end_date or end_date_snake
    start, end = _default_range(user, effective_start, effective_end)
    accounts = db.execute(select(Account).where(Account.organization_id == user.organization_id).order_by(Account.code)).scalars().all()
    balances = ledger.account_balances(db, user.organization_id, start=start, end=end, branch_id=branch_id)
    income = _section("Operating Income", accounts, balances, lambda a: a.type == "income" and a.subtype != "other_income")
    cogs = _section("Cost of Goods Sold", accounts, balances, lambda a: a.type == "expense" and a.subtype in ("cogs", "contra_expense"))
    opex = _section("Operating Expenses", accounts, balances, lambda a: a.type == "expense" and a.subtype not in ("cogs", "contra_expense"))
    other = _section("Other Income", accounts, balances, lambda a: a.type == "income" and a.subtype == "other_income")
    gross = money(income.total - cogs.total)
    operating = money(gross - opex.total)
    return ProfitAndLoss(
        start_date=start,
        end_date=end,
        income=income,
        cost_of_goods_sold=cogs,
        gross_profit=gross,
        operating_expenses=opex,
        operating_profit=operating,
        other_income=other,
        net_profit=money(operating + other.total),
    )


@router.get("/balance-sheet", response_model=BalanceSheet)
def balance_sheet(as_of: Optional[date] = None, user: User = Depends(require_financial_read), db: Session = Depends(get_db)):
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
        as_of=as_of,
        assets=assets,
        liabilities=liabilities,
        equity=equity,
        current_period_earnings=earnings,
        total_liabilities_and_equity=total_le,
        is_balanced=abs(assets.total - total_le) < Decimal("0.01"),
    )


def _settled_by(db: Session, model, ids: list, as_of: date) -> Dict[str, Decimal]:
    """Payments and credit / advance applications on each invoice or bill dated on or before as_of."""
    if not ids:
        return {}
    is_invoice = model is Invoice
    payment = CustomerPayment if is_invoice else VendorPayment
    doc_col = payment.invoice_id if is_invoice else payment.bill_id
    app_col = CreditApplication.invoice_id if is_invoice else CreditApplication.bill_id
    settled: Dict[str, Decimal] = {}
    for doc_id, applied, amount in db.execute(
        select(doc_col, payment.applied_amount, payment.amount).where(doc_col.in_(ids), payment.date <= as_of)
    ):
        settled[doc_id] = settled.get(doc_id, Decimal("0")) + (applied if applied is not None else amount)
    for doc_id, amount in db.execute(select(app_col, CreditApplication.amount).where(app_col.in_(ids), CreditApplication.date <= as_of)):
        settled[doc_id] = settled.get(doc_id, Decimal("0")) + amount
    return settled


def _aging_docs(db: Session, model, contact_rel, org_id: str, as_of: date, open_statuses: tuple):
    """Documents and their balance on as_of. Today: the stored balance. Earlier: the total less
    what was paid or credited by then, so invoices settled later still show as owed."""
    stmt = select(model).where(model.organization_id == org_id, model.date <= as_of).options(selectinload(contact_rel))
    if as_of >= date.today():
        docs = db.execute(stmt.where(model.status.in_(open_statuses))).scalars().all()
        return [(doc, money(doc.balance_due)) for doc in docs]
    docs = db.execute(stmt.where(model.status.notin_(("draft", "void")))).scalars().all()
    settled = _settled_by(db, model, [d.id for d in docs], as_of)
    return [(doc, money(doc.total - settled.get(doc.id, Decimal("0")))) for doc in docs]


def _aging(docs, as_of: date, contact_attr: str) -> AgingReport:
    rows: Dict[str, AgingRow] = {}
    buckets = {
        "Current": [Decimal("0"), 0],
        "1-30 days": [Decimal("0"), 0],
        "31-60 days": [Decimal("0"), 0],
        "61-90 days": [Decimal("0"), 0],
        "> 90 days": [Decimal("0"), 0],
    }
    for doc, balance in docs:
        if balance <= 0:
            continue
        contact = getattr(doc, contact_attr)
        row = rows.setdefault(
            contact.id,
            AgingRow(
                contact_id=contact.id,
                contact_name=contact.display_name,
                current=Decimal("0"),
                days_1_30=Decimal("0"),
                days_31_60=Decimal("0"),
                days_61_90=Decimal("0"),
                days_over_90=Decimal("0"),
                total=Decimal("0"),
            ),
        )
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
        as_of=as_of,
        rows=ordered,
        buckets=[AgingBucket(label=k, amount=money(v[0]), count=v[1]) for k, v in buckets.items()],
        total=money(sum((r.total for r in ordered), Decimal("0"))),
    )


@router.get("/receivables-aging", response_model=AgingReport)
def receivables_aging(as_of: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    as_of = as_of or date.today()
    docs = _aging_docs(db, Invoice, Invoice.customer, user.organization_id, as_of, ("sent", "partially_paid"))
    return _aging(docs, as_of, "customer")


@router.get("/payables-aging", response_model=AgingReport)
def payables_aging(as_of: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    as_of = as_of or date.today()
    docs = _aging_docs(db, Bill, Bill.vendor, user.organization_id, as_of, ("open", "partially_paid"))
    return _aging(docs, as_of, "vendor")


def _contact_totals(docs, contact_attr: str, start: date, end: date) -> ContactTotalsReport:
    rows: Dict[str, ContactTotalsRow] = {}
    for doc in docs:
        contact = getattr(doc, contact_attr)
        row = rows.setdefault(
            contact.id,
            ContactTotalsRow(
                contact_id=contact.id,
                contact_name=contact.display_name,
                document_count=0,
                amount=Decimal("0"),
                amount_paid=Decimal("0"),
                balance=Decimal("0"),
            ),
        )
        row.document_count += 1
        row.amount += doc.total
        row.amount_paid += doc.amount_paid
        row.balance += doc.balance_due
    ordered = sorted(rows.values(), key=lambda r: r.amount, reverse=True)
    return ContactTotalsReport(start_date=start, end_date=end, rows=ordered, total=money(sum((r.amount for r in ordered), Decimal("0"))))


@router.get("/sales-by-customer", response_model=ContactTotalsReport)
def sales_by_customer(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    start, end = _default_range(user, start_date, end_date)
    docs = (
        db.execute(
            select(Invoice)
            .where(
                Invoice.organization_id == user.organization_id,
                Invoice.status.notin_(("draft", "void")),
                Invoice.date >= start,
                Invoice.date <= end,
            )
            .options(selectinload(Invoice.customer))
        )
        .scalars()
        .all()
    )
    return _contact_totals(docs, "customer", start, end)


@router.get("/purchases-by-vendor", response_model=ContactTotalsReport)
def purchases_by_vendor(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    start, end = _default_range(user, start_date, end_date)
    docs = (
        db.execute(
            select(Bill)
            .where(
                Bill.organization_id == user.organization_id, Bill.status.notin_(("draft", "void")), Bill.date >= start, Bill.date <= end
            )
            .options(selectinload(Bill.vendor))
        )
        .scalars()
        .all()
    )
    return _contact_totals(docs, "vendor", start, end)


@router.get("/expenses-by-category", response_model=ExpenseByCategoryReport)
def expenses_by_category(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    start, end = _default_range(user, start_date, end_date)
    expenses = (
        db.execute(
            select(Expense)
            .where(Expense.organization_id == user.organization_id, Expense.date >= start, Expense.date <= end)
            .options(selectinload(Expense.account))
        )
        .scalars()
        .all()
    )
    rows: Dict[str, ExpenseByCategoryRow] = {}
    for e in expenses:
        row = rows.setdefault(
            e.account_id, ExpenseByCategoryRow(account_id=e.account_id, account_name=e.account.name, count=0, amount=Decimal("0"))
        )
        row.count += 1
        row.amount += e.amount
    ordered = sorted(rows.values(), key=lambda r: r.amount, reverse=True)
    return ExpenseByCategoryReport(
        start_date=start, end_date=end, rows=ordered, total=money(sum((r.amount for r in ordered), Decimal("0")))
    )


@router.get("/inventory-summary", response_model=InventorySummaryReport)
def inventory_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = (
        db.execute(select(Item).where(Item.organization_id == user.organization_id, Item.is_active.is_(True)).order_by(Item.name))
        .scalars()
        .all()
    )
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
        rows.append(
            InventoryRow(
                item_id=item.id,
                name=item.name,
                sku=item.sku,
                unit=item.unit,
                stock_on_hand=item.stock_on_hand,
                reorder_level=item.reorder_level,
                cost_price=item.cost_price,
                stock_value=value,
                is_low_stock=is_low,
            )
        )
    return InventorySummaryReport(
        rows=rows, total_items=len(items), tracked_items=len(rows), low_stock_items=low, total_stock_value=money(total_value)
    )


@router.get("/tax-summary", response_model=TaxSummary)
def tax_summary(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    start, end = _default_range(user, start_date, end_date)
    invoices = (
        db.execute(
            select(Invoice).where(
                Invoice.organization_id == user.organization_id,
                Invoice.status.notin_(("draft", "void")),
                Invoice.date >= start,
                Invoice.date <= end,
            )
        )
        .scalars()
        .all()
    )
    bills = (
        db.execute(
            select(Bill).where(
                Bill.organization_id == user.organization_id, Bill.status.notin_(("draft", "void")), Bill.date >= start, Bill.date <= end
            )
        )
        .scalars()
        .all()
    )
    expenses = (
        db.execute(select(Expense).where(Expense.organization_id == user.organization_id, Expense.date >= start, Expense.date <= end))
        .scalars()
        .all()
    )
    # From the GST accounts, so credit notes and vendor credits net off and GST payable under
    # reverse charge counts as owed, exactly as the books and GSTR-3B have them.
    gst = {code: get_account_by_code(db, user.organization_id, code).id for code in ("2100", "2110", "1300")}
    period = ledger.account_balances(db, user.organization_id, start=start, end=end, account_ids=list(gst.values()))

    def net(code: str, credit_side: bool) -> Decimal:
        debit, credit = period.get(gst[code], (Decimal("0"), Decimal("0")))
        return money(credit - debit if credit_side else debit - credit)

    output = money(net("2100", True) + net("2110", True))
    input_tax = net("1300", False)
    return TaxSummary(
        start_date=start,
        end_date=end,
        output_gst=output,
        input_gst=input_tax,
        net_payable=money(output - input_tax),
        taxable_sales=money(
            sum((i.subtotal - i.discount_amount for i in invoices), Decimal("0")) - _credits_value(db, CreditNote, user, start, end)
        ),
        taxable_purchases=money(
            sum((b.subtotal - b.discount_amount for b in bills), Decimal("0"))
            + sum((e.amount for e in expenses), Decimal("0"))
            - _credits_value(db, VendorCredit, user, start, end)
        ),
    )


def _credits_value(db: Session, model, user: User, start: date, end: date) -> Decimal:
    """Taxable value of credit notes / vendor credits issued in the period."""
    docs = db.execute(
        select(model).where(
            model.organization_id == user.organization_id, model.status.notin_(("draft", "void")), model.date >= start, model.date <= end
        )
    ).scalars()
    return money(sum((d.subtotal - d.discount_amount for d in docs), Decimal("0")))


# Cash and cash equivalents: bank and cash registers, plus undeposited funds.
_CASH_SUBTYPES = {"cash", "bank"}
_UNDEPOSITED_FUNDS = "1900"
_INVESTING_SUBTYPES = {"fixed_asset", "non_current_asset", "investment"}
_FINANCING_LIABILITY_SUBTYPES = {"credit_card", "long_term_liability", "non_current_liability", "loan"}


@router.get("/cash-flow", response_model=CashFlowStatement)
def cash_flow(
    start_date: Optional[date] = Query(default=None, alias="startDate"),
    end_date: Optional[date] = Query(default=None, alias="endDate"),
    user: User = Depends(require_financial_read),
    db: Session = Depends(get_db),
):
    """Cash-flow statement (indirect method), computed from the ledger.

    Net income is adjusted by the period's movement on every other non-cash
    account. Because every journal entry balances, operating + investing +
    financing always equals the change in cash.
    """
    start, end = _default_range(user, start_date, end_date)
    org_id = user.organization_id
    accounts = db.execute(select(Account).where(Account.organization_id == org_id).order_by(Account.code)).scalars().all()
    cash_ids = {a.id for a in accounts if a.subtype in _CASH_SUBTYPES or a.code == _UNDEPOSITED_FUNDS} | bank.bank_ledger_account_ids(
        db, org_id
    )
    period = ledger.account_balances(db, org_id, start=start, end=end)
    to_start = ledger.account_balances(db, org_id, end=start - timedelta(days=1), account_ids=cash_ids)
    to_end = ledger.account_balances(db, org_id, end=end, account_ids=cash_ids)

    def cash_total(balances: dict) -> Decimal:
        return money(sum((d - c for d, c in balances.values()), Decimal("0")))

    net_income = Decimal("0")
    sections: Dict[str, List[CashFlowLine]] = {"operating": [], "investing": [], "financing": []}
    for acct in accounts:
        if acct.id in cash_ids:
            continue
        d, c = period.get(acct.id, (Decimal("0"), Decimal("0")))
        effect = money(c - d)  # what the movement did to cash
        if acct.type in ("income", "expense"):
            net_income += effect
            continue
        if effect == 0:
            continue
        if acct.type == "asset" and acct.subtype in _INVESTING_SUBTYPES:
            bucket = "investing"
        elif acct.type == "equity" or (acct.type == "liability" and acct.subtype in _FINANCING_LIABILITY_SUBTYPES):
            bucket = "financing"
        else:
            bucket = "operating"
        sections[bucket].append(CashFlowLine(label=acct.name, account_id=acct.id, code=acct.code, amount=effect))

    net_income = money(net_income)
    operating_lines = [CashFlowLine(label="Net income", amount=net_income), *sections["operating"]]

    def section(title: str, lines: List[CashFlowLine]) -> CashFlowSection:
        return CashFlowSection(title=title, lines=lines, total=money(sum((line.amount for line in lines), Decimal("0"))))

    operating = section("Operating activities", operating_lines)
    investing = section("Investing activities", sections["investing"])
    financing = section("Financing activities", sections["financing"])
    return CashFlowStatement(
        start_date=start,
        end_date=end,
        net_income=net_income,
        operating=operating,
        investing=investing,
        financing=financing,
        net_change=money(operating.total + investing.total + financing.total),
        opening_cash=cash_total(to_start),
        closing_cash=cash_total(to_end),
    )
