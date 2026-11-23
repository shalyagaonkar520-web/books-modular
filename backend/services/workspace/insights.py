"""A compact picture of the business, built only from the software's own data, for "how is my business /
how can I improve / where am I lacking" questions.

Everything here is plain database queries and arithmetic. It is built per person, so a section appears
only if that person's workspace may see it (sales need Invoices, money owed needs Reports + Financial data,
stock needs Items). The assistant is then asked to answer ONLY from this snapshot; if the question needs
anything outside it, it must say it does not have that information. If the AI is unavailable the same
snapshot is shown with rule-based observations, so there is always an answer from real data.

What goes to the model: totals and the top few product / customer NAMES with their figures. Never emails,
phone numbers, addresses, GSTINs or bank details.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List

from sqlalchemy import func, select

from backend.models import Contact, Invoice, InvoiceLine, Item
from backend.services.workspace import perms
from backend.services.workspace.tools import OPEN_STATUSES, Ctx, inr, num

_COUNTED = ("draft", "void", "cancelled")


def _sales(ctx: Ctx, start: date, end: date) -> Dict[str, Any]:
    count, total, paid = ctx.db.execute(
        select(func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0), func.coalesce(func.sum(Invoice.amount_paid), 0)).where(
            Invoice.organization_id == ctx.org_id, Invoice.status.notin_(_COUNTED), Invoice.date >= start, Invoice.date <= end
        )
    ).one()
    total, paid = Decimal(str(total)), Decimal(str(paid))
    return {"invoices": int(count), "sales": float(total), "collected": float(paid), "outstanding": float(total - paid)}


def top_products(ctx: Ctx, start: date, end: date, limit: int = 5) -> List[Dict[str, Any]]:
    rows = ctx.db.execute(
        select(Item.name, func.coalesce(func.sum(InvoiceLine.quantity), 0), func.coalesce(func.sum(InvoiceLine.amount), 0))
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .join(Item, Item.id == InvoiceLine.item_id)
        .where(Invoice.organization_id == ctx.org_id, Invoice.status.notin_(_COUNTED), Invoice.date >= start, Invoice.date <= end)
        .group_by(Item.name)
        .order_by(func.sum(InvoiceLine.amount).desc())
        .limit(limit)
    ).all()
    return [{"product": n, "units": float(q), "sales": float(a)} for n, q, a in rows]


def top_customers(ctx: Ctx, start: date, end: date, limit: int = 5) -> List[Dict[str, Any]]:
    rows = ctx.db.execute(
        select(Contact.display_name, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0))
        .join(Contact, Contact.id == Invoice.customer_id)
        .where(Invoice.organization_id == ctx.org_id, Invoice.status.notin_(_COUNTED), Invoice.date >= start, Invoice.date <= end)
        .group_by(Contact.display_name)
        .order_by(func.sum(Invoice.total).desc())
        .limit(limit)
    ).all()
    return [{"customer": n, "invoices": int(c), "sales": float(t)} for n, c, t in rows]


def slow_stock(ctx: Ctx, days: int = 60, limit: int = 5) -> List[Dict[str, Any]]:
    """In stock but not sold in the last ``days`` days."""
    since = ctx.today - timedelta(days=days)
    sold = select(InvoiceLine.item_id).join(Invoice, Invoice.id == InvoiceLine.invoice_id).where(
        Invoice.organization_id == ctx.org_id, Invoice.status.notin_(_COUNTED), Invoice.date >= since, InvoiceLine.item_id.is_not(None)
    )
    rows = ctx.db.execute(
        select(Item.name, Item.stock_on_hand)
        .where(Item.organization_id == ctx.org_id, Item.is_active.is_(True), Item.track_inventory.is_(True), Item.stock_on_hand > 0, Item.id.notin_(sold))
        .order_by(Item.stock_on_hand.desc())
        .limit(limit)
    ).all()
    return [{"product": n, "in_stock": float(q), "days_without_a_sale": f"{days}+"} for n, q in rows]


def snapshot(ctx: Ctx) -> Dict[str, Any]:
    """Only the sections this person may see; empty if none."""
    out: Dict[str, Any] = {}
    today = ctx.today
    can_sales = perms.can(ctx.perm, "invoices", perms.VIEW)
    can_stock = perms.can(ctx.perm, "items", perms.VIEW)
    can_money = perms.can_see_financial(ctx.perm) and perms.can(ctx.perm, "reports", perms.VIEW)
    if can_sales:
        first = today.replace(day=1)
        last_end = first - timedelta(days=1)
        out["sales"] = {
            "today": _sales(ctx, today, today),
            "this_week": _sales(ctx, today - timedelta(days=today.weekday()), today),
            "this_month": _sales(ctx, first, today),
            "last_month": _sales(ctx, last_end.replace(day=1), last_end),
            "month_so_far_day": today.day,
        }
        out["top_products_this_month"] = top_products(ctx, first, today)
        out["top_customers_this_month"] = top_customers(ctx, first, today)
    if can_money:
        owed, n_open = ctx.db.execute(
            select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0), func.count(Invoice.id)).where(Invoice.organization_id == ctx.org_id, Invoice.status.in_(OPEN_STATUSES))
        ).one()
        overdue, n_over, oldest = ctx.db.execute(
            select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0), func.count(Invoice.id), func.min(Invoice.due_date)).where(
                Invoice.organization_id == ctx.org_id, Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < today
            )
        ).one()
        from backend.services.workspace.tools import _profit_period, profit_figures

        profit: Dict[str, Any] = {}
        for key, period in (("this_month", "month"), ("this_fiscal_year", "fiscal")):
            s, e, _ = _profit_period(ctx, period)
            r = profit_figures(ctx, s, e)
            profit[key] = {"income": float(r.income.total), "cost_of_goods": float(r.cost_of_goods_sold.total), "operating_expenses": float(r.operating_expenses.total), "net_profit": float(r.net_profit)}
        out["profit"] = profit
        out["money_owed_by_customers"] = {
            "outstanding": float(owed),
            "open_invoices": int(n_open),
            "overdue": float(overdue),
            "overdue_invoices": int(n_over),
            "oldest_overdue_days": (today - oldest).days if oldest else 0,
        }
    if can_stock:
        low = ctx.db.execute(
            select(func.count()).where(Item.organization_id == ctx.org_id, Item.is_active.is_(True), Item.track_inventory.is_(True), Item.stock_on_hand <= Item.reorder_level, Item.stock_on_hand > 0)
        ).scalar_one()
        out_of = ctx.db.execute(select(func.count()).where(Item.organization_id == ctx.org_id, Item.is_active.is_(True), Item.track_inventory.is_(True), Item.stock_on_hand <= 0)).scalar_one()
        out["stock"] = {"low_stock_products": int(low), "out_of_stock_products": int(out_of), "stock_not_selling_60_days": slow_stock(ctx)}
    return out


def _pct(now: float, before: float) -> str:
    if before <= 0:
        return "no sales last month to compare"
    change = (now - before) / before * 100
    return f"{'up' if change >= 0 else 'down'} {abs(change):.0f}% on last month"


def observations(snap: Dict[str, Any]) -> List[str]:
    """Plain, rule-based findings (the same numbers the assistant sees)."""
    notes: List[str] = []
    s = snap.get("sales")
    if s:
        m, lm = s["this_month"], s["last_month"]
        if m["invoices"] == 0 and lm["invoices"] == 0:
            notes.append("No sales are recorded this month or last month yet.")
        else:
            notes.append(f"This month so far: {inr(m['sales'])} from {m['invoices']} invoices, {_pct(m['sales'], lm['sales'])} ({inr(lm['sales'])} for the whole of last month).")
        if m["sales"] and m["outstanding"] / m["sales"] > 0.5:
            notes.append(f"Over half of this month's sales ({inr(m['outstanding'])}) is not collected yet.")
    custs = snap.get("top_customers_this_month") or []
    if custs and s and s["this_month"]["sales"] and custs[0]["sales"] / s["this_month"]["sales"] > 0.5:
        notes.append(f"{custs[0]['customer']} is {custs[0]['sales'] / s['this_month']['sales'] * 100:.0f}% of this month's sales: sales depend on very few customers.")
    pr = snap.get("profit")
    if pr:
        fy = pr["this_fiscal_year"]
        margin = f" ({fy['net_profit'] / fy['income'] * 100:.0f}% of income)" if fy["income"] else ""
        notes.append(f"Net profit this fiscal year: {inr(fy['net_profit'])}{margin}; this month: {inr(pr['this_month']['net_profit'])}.")
        if fy["income"] and fy["operating_expenses"] / fy["income"] > 0.4:
            notes.append(f"Operating expenses are {fy['operating_expenses'] / fy['income'] * 100:.0f}% of income this fiscal year.")
    owed = snap.get("money_owed_by_customers")
    if owed and owed["overdue"] > 0:
        notes.append(f"{inr(owed['overdue'])} across {owed['overdue_invoices']} invoices is overdue (the oldest by {owed['oldest_overdue_days']} days).")
    st = snap.get("stock")
    if st:
        if st["out_of_stock_products"] or st["low_stock_products"]:
            notes.append(f"{st['out_of_stock_products']} products are out of stock and {st['low_stock_products']} are at or below their reorder level.")
        if st["stock_not_selling_60_days"]:
            names = ", ".join(f"{x['product']} ({num(x['in_stock'])})" for x in st["stock_not_selling_60_days"][:3])
            notes.append(f"Stock that has not sold in 60 days: {names}.")
    return notes


def cards(snap: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    s = snap.get("sales")
    if s:
        rows = [[label, str(v["invoices"]), inr(v["sales"]), inr(v["collected"]), inr(v["outstanding"])] for label, v in (("Today", s["today"]), ("This week", s["this_week"]), ("This month", s["this_month"]), ("Last month", s["last_month"]))]
        out.append({"type": "table", "title": "Sales", "columns": ["Period", "Invoices", "Sales", "Collected", "Outstanding"], "rows": rows})
    if snap.get("top_products_this_month"):
        out.append({"type": "table", "title": "Top products this month", "columns": ["Product", "Units", "Sales"], "rows": [[p["product"], num(p["units"]), inr(p["sales"])] for p in snap["top_products_this_month"]]})
    if snap.get("top_customers_this_month"):
        out.append({"type": "table", "title": "Top customers this month", "columns": ["Customer", "Invoices", "Sales"], "rows": [[c["customer"], str(c["invoices"]), inr(c["sales"])] for c in snap["top_customers_this_month"]]})
    owed = snap.get("money_owed_by_customers")
    if owed:
        out.append({"type": "stats", "title": "Money to collect", "items": [{"label": "Outstanding", "value": inr(owed["outstanding"])}, {"label": "Overdue", "value": inr(owed["overdue"])}, {"label": "Open invoices", "value": str(owed["open_invoices"])}]})
    st = snap.get("stock")
    if st and st["stock_not_selling_60_days"]:
        out.append({"type": "table", "title": "Stock not selling (60 days)", "columns": ["Product", "In stock"], "rows": [[x["product"], num(x["in_stock"])] for x in st["stock_not_selling_60_days"]]})
    return out
