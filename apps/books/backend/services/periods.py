"""Date period helpers (fiscal year, months, quarters)."""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import List, Tuple


def month_bounds(year: int, month: int) -> Tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def fiscal_year_bounds(today: date, start_month: int) -> Tuple[date, date]:
    start_year = today.year if today.month >= start_month else today.year - 1
    start = date(start_year, start_month, 1)
    end = add_months(start, 12) - timedelta(days=1)
    return start, end


def quarter_bounds(today: date, start_month: int) -> Tuple[date, date]:
    fy_start, _ = fiscal_year_bounds(today, start_month)
    months_into_fy = (today.year - fy_start.year) * 12 + today.month - fy_start.month
    q_start = add_months(fy_start, (months_into_fy // 3) * 3)
    q_end = add_months(q_start, 3) - timedelta(days=1)
    return q_start, q_end


def resolve_period(period: str, today: date, fiscal_start_month: int) -> Tuple[date, date, List[Tuple[str, date, date]]]:
    """Return (start, end, buckets) for the dashboard period selector."""
    if period == "this_month":
        start, end = month_bounds(today.year, today.month)
        buckets = _week_buckets(start, end)
    elif period == "last_month":
        prev = add_months(date(today.year, today.month, 1), -1)
        start, end = month_bounds(prev.year, prev.month)
        buckets = _week_buckets(start, end)
    elif period == "this_quarter":
        start, end = quarter_bounds(today, fiscal_start_month)
        buckets = _month_buckets(start, end)
    elif period == "last_fiscal_year":
        this_start, _ = fiscal_year_bounds(today, fiscal_start_month)
        start = add_months(this_start, -12)
        end = this_start - timedelta(days=1)
        buckets = _month_buckets(start, end)
    else:  # this_fiscal_year
        start, end = fiscal_year_bounds(today, fiscal_start_month)
        buckets = _month_buckets(start, end)
    return start, end, buckets


def _month_buckets(start: date, end: date) -> List[Tuple[str, date, date]]:
    buckets = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        m_start, m_end = month_bounds(cursor.year, cursor.month)
        buckets.append((cursor.strftime("%b %y"), max(m_start, start), min(m_end, end)))
        cursor = add_months(cursor, 1)
    return buckets


def _week_buckets(start: date, end: date) -> List[Tuple[str, date, date]]:
    buckets = []
    cursor = start
    index = 1
    while cursor <= end:
        w_end = min(cursor + timedelta(days=6), end)
        buckets.append((f"Week {index}", cursor, w_end))
        cursor = w_end + timedelta(days=1)
        index += 1
    return buckets
