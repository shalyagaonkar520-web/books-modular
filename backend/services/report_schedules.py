"""Scheduled report emails: a summary of a report sent to a list of people on a schedule."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Organization, ReportSchedule, User
from backend.services.money import money
from backend.services.periods import add_months, month_bounds

logger = logging.getLogger("roomanbooks.report_schedules")

REPORTS = {
    "profit_and_loss": "Profit and loss",
    "balance_sheet": "Balance sheet",
    "receivables": "Receivables summary",
    "payables": "Payables summary",
    "cash_flow": "Cash flow",
    "gstr3b": "GST summary (GSTR-3B)",
    "digest": "Daily digest",
}


def period_for(frequency: str, today: date) -> Tuple[date, date]:
    """The period just finished: yesterday, last week (Mon-Sun) or last calendar month."""
    if frequency == "daily":
        yesterday = today - timedelta(days=1)
        return yesterday, yesterday
    if frequency == "weekly":
        end = today - timedelta(days=today.weekday() + 1)
        return end - timedelta(days=6), end
    first_this_month = today.replace(day=1)
    previous = add_months(first_this_month, -1)
    return month_bounds(previous.year, previous.month)


def next_after(frequency: str, current: date) -> date:
    if frequency == "daily":
        return current + timedelta(days=1)
    if frequency == "weekly":
        return current + timedelta(days=7)
    return add_months(current.replace(day=1), 1)


def _inr(value) -> str:
    return f"INR {money(value):,.2f}"


def summary(db: Session, user: User, report: str, start: date, end: date) -> List[str]:
    """Plain-text lines summarising the report for the period."""
    from backend.routers import reports
    from backend.services import gst_returns

    if report == "digest":
        from backend.services import ai, insights

        lines = insights.digest(db, user.organization_id, end)
        headline = ai.digest_headline(lines)
        return ([headline, ""] if headline else []) + lines
    if report == "profit_and_loss":
        pl = reports.profit_and_loss(
            start_date=start, end_date=end, start_date_snake=None, end_date_snake=None, branch_id=None, user=user, db=db
        )
        return [
            f"Income: {_inr(pl.income.total)}",
            f"Cost of goods sold: {_inr(pl.cost_of_goods_sold.total)}",
            f"Gross profit: {_inr(pl.gross_profit)}",
            f"Operating expenses: {_inr(pl.operating_expenses.total)}",
            f"Net profit: {_inr(pl.net_profit)}",
        ]
    if report == "balance_sheet":
        bs = reports.balance_sheet(as_of=end, user=user, db=db)
        return [
            f"Assets: {_inr(bs.assets.total)}",
            f"Liabilities: {_inr(bs.liabilities.total)}",
            f"Equity incl. current earnings: {_inr(bs.equity.total + bs.current_period_earnings)}",
        ]
    if report in ("receivables", "payables"):
        aging = (reports.receivables_aging if report == "receivables" else reports.payables_aging)(as_of=end, user=user, db=db)
        lines = [f"Total outstanding: {_inr(aging.total)}"]
        lines += [f"{bucket.label}: {_inr(bucket.amount)}" for bucket in aging.buckets]
        top = sorted(aging.rows, key=lambda r: r.total, reverse=True)[:5]
        if top:
            lines.append("Largest balances: " + ", ".join(f"{r.contact_name} {_inr(r.total)}" for r in top))
        return lines
    if report == "cash_flow":
        cf = reports.cash_flow(start_date=start, end_date=end, user=user, db=db)
        return [
            f"Cash at start: {_inr(cf.opening_cash)}",
            f"From operations: {_inr(cf.operating.total)}",
            f"From investing: {_inr(cf.investing.total)}",
            f"From financing: {_inr(cf.financing.total)}",
            f"Cash at end: {_inr(cf.closing_cash)}",
        ]
    if report == "gstr3b":
        r = gst_returns.gstr3b(db, user.organization_id, start, end)
        out = r["outward"]["taxable"]
        cash = r["payment"]["cashPayable"]
        return [
            f"Outward taxable value: {_inr(out['taxable'])}",
            f"Output tax (IGST/CGST/SGST): {_inr(out['igst'])} / {_inr(out['cgst'])} / {_inr(out['sgst'])}",
            f"Net ITC: {_inr(sum(r['itc']['net'].values()))}",
            f"Tax payable in cash: {_inr(sum(cash.values()))}",
        ]
    raise ValueError(f"Unknown report {report}")


def _acting_user(db: Session, schedule: ReportSchedule) -> Optional[User]:
    user = db.get(User, schedule.created_by) if schedule.created_by else None
    if user and user.is_active and user.organization_id == schedule.organization_id and user.role in ("admin", "viewer"):
        return user
    return (
        db.execute(select(User).where(User.organization_id == schedule.organization_id, User.role == "admin", User.is_active.is_(True)))
        .scalars()
        .first()
    )


def send(db: Session, schedule: ReportSchedule, today: Optional[date] = None) -> List[str]:
    """Email the report to every recipient; returns the addresses that failed."""
    from backend.services.email_service import send_custom_message_email

    today = today or date.today()
    org = db.get(Organization, schedule.organization_id)
    user = _acting_user(db, schedule)
    if user is None:
        raise ValueError("No active admin to run the report as")
    start, end = period_for(schedule.frequency, today)
    lines = summary(db, user, schedule.report, start, end)
    title = REPORTS[schedule.report]
    message = f"{title} for {start.strftime('%d %b %Y')} to {end.strftime('%d %b %Y')}\n\n" + "\n".join(lines)
    message += "\n\nOpen Rooman Books for the full report."
    failed = []
    for to in [r.strip() for r in (schedule.recipients or "").split(",") if r.strip()]:
        result = send_custom_message_email(to_email=to, subject=f"{org.name}: {title}", message=message, company_name=org.name)
        if not result.get("success"):
            failed.append(to)
    schedule.last_sent_at = today
    return failed


def send_due(db: Session, today: Optional[date] = None) -> int:
    today = today or date.today()
    due = (
        db.execute(
            select(ReportSchedule).where(
                ReportSchedule.is_active.is_(True), ReportSchedule.next_run_date.is_not(None), ReportSchedule.next_run_date <= today
            )
        )
        .scalars()
        .all()
    )
    sent = 0
    for schedule in due:
        try:
            send(db, schedule, today)
            sent += 1
        except Exception:  # noqa: BLE001 - one bad schedule must not stop the others
            logger.exception("Scheduled report %s failed", schedule.id)
        schedule.next_run_date = next_after(schedule.frequency, today)
        db.commit()
    return sent
