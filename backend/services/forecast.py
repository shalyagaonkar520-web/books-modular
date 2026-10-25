"""Cash-flow forecast, week by week, and what-if scenarios on top of it.

Deterministic: only what is already booked or scheduled. Open invoices come in
and open bills go out on their due dates (overdue ones in the first week),
recurring invoices and bills run on their next dates, and day-to-day expenses
continue at the average of the last 90 days. A scenario then shifts or scales
those flows (customers paying late, part of receivables never collected, a new
monthly cost, a one-off purchase) so the owner can see the lowest point before
committing to it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models import Bill, Expense, Invoice, RecurringProfile
from backend.services import bank, recurring
from backend.services.money import money

ASSUMPTIONS = [
    "Customers pay open invoices on their due dates; overdue invoices are counted in the first week.",
    "Open bills are paid on their due dates.",
    "Active recurring invoices and bills run on schedule.",
    "Day-to-day expenses continue at the average of the last 90 days.",
]


@dataclass
class OneOff:
    date: date
    amount: Decimal
    type: str  # inflow | outflow
    label: str = ""


@dataclass
class Scenario:
    # Customers pay this many days after the due date.
    collection_delay_days: int = 0
    # Share (percent) of open and recurring receivables actually collected.
    collection_rate: Decimal = Decimal("100")
    # Bills paid this many days after their due date.
    payment_delay_days: int = 0
    extra_monthly_income: Decimal = Decimal("0")
    extra_monthly_expense: Decimal = Decimal("0")
    # Percent change in day-to-day spending (e.g. -10 = cut 10%).
    spend_change_percent: Decimal = Decimal("0")
    one_offs: List[OneOff] = field(default_factory=list)

    def is_baseline(self) -> bool:
        return self == Scenario()


@dataclass
class Week:
    week_start: date
    inflow: Decimal
    outflow: Decimal
    net: Decimal
    closing: Decimal


@dataclass
class Forecast:
    opening_cash: Decimal
    weeks: List[Week]
    lowest_balance: Decimal
    lowest_week: Optional[date]
    average_daily_spend: Decimal
    assumptions: List[str]
    first_negative_week: Optional[date] = None


def build(db: Session, org_id: str, weeks: int = 13, scenario: Optional[Scenario] = None, today: Optional[date] = None) -> Forecast:
    sc = scenario or Scenario()
    today = today or date.today()
    starts = [today + timedelta(days=7 * i) for i in range(weeks)]
    horizon = starts[-1] + timedelta(days=7)
    inflow = [Decimal("0")] * weeks
    outflow = [Decimal("0")] * weeks
    collect = sc.collection_rate / Decimal("100")

    def bucket(day: date) -> Optional[int]:
        if day >= horizon:
            return None
        return max(0, (day - today).days // 7)

    def add(series: List[Decimal], day: date, amount: Decimal) -> None:
        i = bucket(day)
        if i is not None:
            series[i] += amount

    delay_in = timedelta(days=sc.collection_delay_days)
    delay_out = timedelta(days=sc.payment_delay_days)
    for inv in db.execute(
        select(Invoice).where(Invoice.organization_id == org_id, Invoice.status.in_(("sent", "partially_paid")))
    ).scalars():
        add(inflow, inv.due_date + delay_in, inv.balance_due * collect)
    for bill in db.execute(select(Bill).where(Bill.organization_id == org_id, Bill.status.in_(("open", "partially_paid")))).scalars():
        add(outflow, bill.due_date + delay_out, bill.balance_due)
    for profile in db.execute(
        select(RecurringProfile).where(
            RecurringProfile.organization_id == org_id, RecurringProfile.status == "active", RecurringProfile.kind.in_(("invoice", "bill"))
        )
    ).scalars():
        run = profile.next_run_date
        while run and run < horizon and (profile.end_date is None or run <= profile.end_date):
            if profile.kind == "invoice":
                add(inflow, run + delay_in, profile.total * collect)
            else:
                add(outflow, run + delay_out, profile.total)
            run = recurring.next_after(profile.start_date, profile.frequency, profile.interval_count, run)
    spent = db.execute(
        select(func.coalesce(func.sum(Expense.total), 0)).where(
            Expense.organization_id == org_id, Expense.date > today - timedelta(days=90), Expense.date <= today
        )
    ).scalar_one()
    daily = money(Decimal(str(spent)) / 90)
    weekly_spend = money(daily * 7 * (1 + sc.spend_change_percent / Decimal("100")))
    # Monthly amounts spread evenly: 12 months over 52 weeks.
    weekly_extra_in = money(sc.extra_monthly_income * 12 / 52)
    weekly_extra_out = money(sc.extra_monthly_expense * 12 / 52)
    for one in sc.one_offs:
        add(inflow if one.type == "inflow" else outflow, max(one.date, today), money(one.amount))

    opening = money(sum(bank.balances_for_org(db, org_id).values(), Decimal("0")))
    out: List[Week] = []
    balance = opening
    lowest, lowest_week, first_negative = opening, None, None
    for i, start in enumerate(starts):
        week_in = money(inflow[i] + weekly_extra_in)
        week_out = money(outflow[i] + weekly_spend + weekly_extra_out)
        net = money(week_in - week_out)
        balance = money(balance + net)
        out.append(Week(week_start=start, inflow=week_in, outflow=week_out, net=net, closing=balance))
        if balance < lowest:
            lowest, lowest_week = balance, start
        if balance < 0 and first_negative is None:
            first_negative = start
    assumptions = list(ASSUMPTIONS)
    if not sc.is_baseline():
        assumptions.append("What-if: " + describe(sc))
    return Forecast(
        opening_cash=opening,
        weeks=out,
        lowest_balance=lowest,
        lowest_week=lowest_week,
        average_daily_spend=daily,
        assumptions=assumptions,
        first_negative_week=first_negative,
    )


def describe(sc: Scenario) -> str:
    parts = []
    if sc.collection_delay_days:
        parts.append(f"customers pay {sc.collection_delay_days} days late")
    if sc.collection_rate != 100:
        parts.append(f"{money(sc.collection_rate)}% of receivables collected")
    if sc.payment_delay_days:
        parts.append(f"bills paid {sc.payment_delay_days} days late")
    if sc.extra_monthly_income:
        parts.append(f"extra income {money(sc.extra_monthly_income)} a month")
    if sc.extra_monthly_expense:
        parts.append(f"extra cost {money(sc.extra_monthly_expense)} a month")
    if sc.spend_change_percent:
        parts.append(f"day-to-day spend {money(sc.spend_change_percent):+}%")
    for one in sc.one_offs:
        parts.append(f"one-off {one.type} of {money(one.amount)} on {one.date.isoformat()}" + (f" ({one.label})" if one.label else ""))
    return "; ".join(parts) or "no change"
