"""The controlled set of tools the AI (or the deterministic router) may run.

Rules that hold for every tool:
- it is reached only through ``execute``, which checks the employee's workspace permission for
  the tool's feature and action BEFORE anything runs, strips financial figures from people who
  may not see them, and audits every write;
- it works on the employee's own organization (every query filters by ``organization_id``);
- it never takes raw SQL; arguments are plain values validated here;
- writes first return a preview and run only after the employee confirms (``confirmed=True``);
- nothing is invented: missing prices, tax rates, stock quantities or SKUs are asked for, never guessed.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.models import (
    Bill,
    Contact,
    InventoryAdjustment,
    Invoice,
    Item,
    PurchaseOrder,
    User,
)
from backend.services import audit, subscription
from backend.services import permissions as base_permissions
from backend.services.workspace import perms
from backend.workspace_models import AiEmployee, AiWorkspace

OPEN_STATUSES = ("sent", "partially_paid")
MAX_ROWS = 15


@dataclass
class Ctx:
    db: Session
    user: User
    employee: AiEmployee
    workspace: AiWorkspace
    perm: Dict[str, Any]
    today: date = field(default_factory=date.today)
    # What earlier steps of one plan produced ("invoice": id), so "email it" knows which one.
    memory: Dict[str, Any] = field(default_factory=dict)

    @property
    def org_id(self) -> str:
        return self.user.organization_id


class ToolError(Exception):
    """A request the employee must fix or clarify; the message is shown as the assistant's reply."""


@dataclass
class Tool:
    name: str
    feature: str
    action: str
    description: str
    schema: Dict[str, Any]
    handler: Optional[Callable[[Ctx, Dict[str, Any]], Dict[str, Any]]] = None  # reads
    prepare: Optional[Callable[[Ctx, Dict[str, Any]], Dict[str, Any]]] = None  # writes: validate -> {"args", "preview"}
    run: Optional[Callable[[Ctx, Dict[str, Any]], Dict[str, Any]]] = None  # writes: perform
    financial: bool = False  # needs the workspace's Financial data switch
    write: bool = False


def inr(value: Any) -> str:
    try:
        return f"₹{Decimal(str(value or 0)):,.2f}"
    except InvalidOperation:
        return "₹0.00"


def num(value: Any) -> str:
    d = Decimal(str(value or 0))
    return f"{d.normalize():f}" if d == d.to_integral() else f"{d:.3f}".rstrip("0").rstrip(".")


def _dec(value: Any, label: str, *, minimum: Optional[Decimal] = None) -> Decimal:
    try:
        d = Decimal(str(value).replace(",", "").replace("₹", "").strip())
    except (InvalidOperation, AttributeError):
        raise ToolError(f"{label} must be a number.") from None
    if minimum is not None and d < minimum:
        raise ToolError(f"{label} cannot be less than {minimum}.")
    return d


def _like(term: str) -> str:
    safe = term.strip().lower().replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    return f"%{safe}%"


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def period_range(period: str, today: date) -> tuple[date, date, str]:
    period = (period or "today").lower()
    if period == "yesterday":
        d = today - timedelta(days=1)
        return d, d, "yesterday"
    if period == "week":
        return today - timedelta(days=today.weekday()), today, "this week"
    if period == "month":
        return today.replace(day=1), today, "this month"
    if period == "last_month":
        end = today.replace(day=1) - timedelta(days=1)
        return end.replace(day=1), end, "last month"
    if period == "year":
        return today.replace(month=1, day=1), today, "this year"
    return today, today, "today"


# --------------------------------------------------------------------------- #
# Lookups shared by tools
# --------------------------------------------------------------------------- #
def find_items(db: Session, org_id: str, ref: str, limit: int = 6) -> List[Item]:
    """An item by id, SKU, barcode or (part of) its name. Exact matches win."""
    ref = (ref or "").strip()
    if not ref:
        return []
    exact = db.execute(
        select(Item).where(
            Item.organization_id == org_id,
            or_(Item.id == ref, func.upper(Item.sku) == ref.upper(), Item.barcode == ref, func.lower(Item.name) == ref.lower()),
        )
    ).scalars().all()
    if exact:
        return list(exact)[:limit]
    return list(
        db.execute(
            select(Item)
            .where(Item.organization_id == org_id, Item.is_active.is_(True), func.lower(Item.name).like(_like(ref), escape="\\"))
            .order_by(Item.name)
            .limit(limit)
        ).scalars()
    )


def one_item(ctx: Ctx, ref: str) -> Item:
    found = find_items(ctx.db, ctx.org_id, ref)
    if not found:
        raise ToolError(f"I could not find a product matching “{ref}”.")
    if len(found) > 1:
        names = ", ".join(f"{i.name} ({i.sku})" for i in found[:5])
        raise ToolError(f"“{ref}” matches several products: {names}. Which one do you mean?")
    return found[0]


def find_contacts(db: Session, org_id: str, ref: str, kind: Optional[str] = None, limit: int = 6) -> List[Contact]:
    ref = (ref or "").strip()
    if not ref:
        return []
    stmt = select(Contact).where(Contact.organization_id == org_id, Contact.is_active.is_(True))
    if kind:
        stmt = stmt.where(Contact.type == kind)
    like = _like(ref)
    exact = db.execute(stmt.where(or_(Contact.id == ref, func.lower(Contact.display_name) == ref.lower()))).scalars().all()
    if exact:
        return list(exact)[:limit]
    return list(
        db.execute(
            stmt.where(
                or_(
                    func.lower(Contact.display_name).like(like, escape="\\"),
                    func.lower(Contact.company_name).like(like, escape="\\"),
                    func.lower(Contact.phone).like(like, escape="\\"),
                    func.lower(Contact.mobile).like(like, escape="\\"),
                    func.lower(Contact.email).like(like, escape="\\"),
                )
            )
            .order_by(Contact.display_name)
            .limit(limit)
        ).scalars()
    )


def one_contact(ctx: Ctx, ref: str, kind: str) -> Contact:
    found = find_contacts(ctx.db, ctx.org_id, ref, kind)
    label = "customer" if kind == "customer" else "supplier"
    if not found:
        raise ToolError(f"I could not find a {label} matching “{ref}”. You can ask me to add them first.")
    if len(found) > 1:
        names = ", ".join(c.display_name for c in found[:5])
        raise ToolError(f"“{ref}” matches several {label}s: {names}. Which one do you mean?")
    return found[0]


def similar_items(db: Session, org_id: str, name: str, brand: Optional[str] = None, barcode: Optional[str] = None, sku: Optional[str] = None) -> List[Dict[str, Any]]:
    """Possible duplicates of a product: same barcode / SKU, or a very similar name. Bounded query, ranked in Python."""
    hits: Dict[str, Dict[str, Any]] = {}

    def add(item: Item, why: str, score: float) -> None:
        if item.id not in hits or hits[item.id]["score"] < score:
            hits[item.id] = {"id": item.id, "name": item.name, "sku": item.sku, "brand": item.brand, "why": why, "score": round(score, 2)}

    if barcode:
        for item in db.execute(select(Item).where(Item.organization_id == org_id, Item.barcode == barcode)).scalars():
            add(item, "same barcode", 1.0)
    if sku:
        for item in db.execute(select(Item).where(Item.organization_id == org_id, func.upper(Item.sku) == sku.upper())).scalars():
            add(item, "same SKU", 1.0)
    tokens = [t for t in _norm(name).split() if len(t) > 2][:3]
    if tokens:
        stmt = select(Item).where(Item.organization_id == org_id, or_(*[func.lower(Item.name).like(_like(t), escape="\\") for t in tokens])).limit(150)
        target = _norm(f"{brand or ''} {name}")
        for item in db.execute(stmt).scalars():
            candidate = _norm(f"{item.brand or ''} {item.name}")
            ratio = difflib.SequenceMatcher(None, target, candidate).ratio()
            if ratio >= 0.82 or _norm(item.name) == _norm(name):
                add(item, "very similar name", max(ratio, 0.82))
    return sorted(hits.values(), key=lambda h: -h["score"])[:5]


def match_category(db: Session, org_id: str, guess: Optional[str]) -> Dict[str, Any]:
    """Map a guessed category onto the organization's existing categories (never silently invents one)."""
    existing = [c for (c,) in db.execute(select(Item.category).where(Item.organization_id == org_id, Item.category.is_not(None)).distinct().limit(300)) if c]
    guess = (guess or "").strip()
    if not guess:
        return {"category": None, "existing": existing, "is_new": False}
    norm = {_norm(c): c for c in existing}
    if _norm(guess) in norm:
        return {"category": norm[_norm(guess)], "existing": existing, "is_new": False}
    close = difflib.get_close_matches(_norm(guess), list(norm), n=1, cutoff=0.72)
    if close:
        return {"category": norm[close[0]], "existing": existing, "is_new": False}
    for key, label in norm.items():  # "skin care cream" ~ "Skin care"
        if key and (key in _norm(guess) or _norm(guess) in key):
            return {"category": label, "existing": existing, "is_new": False}
    return {"category": guess.title(), "existing": existing, "is_new": True}


def suggest_sku(db: Session, org_id: str, brand: Optional[str], name: str) -> str:
    """A SKU the employee can accept or change: brand + name initials + running number, unique in the org."""
    words = [w for w in _norm(f"{brand or ''} {name}").split() if w]
    stem = "".join(w[:3] for w in words[:3]).upper() or "ITEM"
    for n in range(1, 1000):
        candidate = f"{stem}-{n:03d}"
        if not db.execute(select(Item.id).where(Item.organization_id == org_id, func.upper(Item.sku) == candidate)).first():
            return candidate
    return f"{stem}-{date.today():%y%m%d}"


# --------------------------------------------------------------------------- #
# Read tools
# --------------------------------------------------------------------------- #
def _sales_summary(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    start, end, label = period_range(args.get("period", "today"), ctx.today)
    mine = bool(args.get("mine"))
    stmt = select(
        func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0), func.coalesce(func.sum(Invoice.amount_paid), 0)
    ).where(
        Invoice.organization_id == ctx.org_id,
        Invoice.status.notin_(("draft", "void", "cancelled")),
        Invoice.date >= start,
        Invoice.date <= end,
    )
    if mine:
        stmt = stmt.where(Invoice.created_by == ctx.user.id)
    count, total, paid = ctx.db.execute(stmt).one()
    total, paid = Decimal(str(total)), Decimal(str(paid))
    who = "Your sales" if mine else "Sales"
    text = f"{who} {label}: {inr(total)} from {count} invoice{'s' if count != 1 else ''}."
    if count:
        text += f" {inr(paid)} collected, {inr(total - paid)} still to collect."
    return {
        "text": text,
        "cards": [
            {
                "type": "stats",
                "title": f"{who} · {label}",
                "items": [
                    {"label": "Invoices", "value": str(count)},
                    {"label": "Sales value", "value": inr(total)},
                    {"label": "Collected", "value": inr(paid)},
                    {"label": "Outstanding", "value": inr(total - paid)},
                ],
            }
        ],
    }


def _list_invoices(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    status = (args.get("status") or "pending").lower()
    stmt = select(Invoice, Contact.display_name).join(Contact, Contact.id == Invoice.customer_id).where(Invoice.organization_id == ctx.org_id)
    if status in ("pending", "unpaid", "open"):
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES))
        title = "Pending invoices"
    elif status == "overdue":
        stmt = stmt.where(Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < ctx.today)
        title = "Overdue invoices"
    elif status in ("paid", "draft"):
        stmt = stmt.where(Invoice.status == status)
        title = f"{status.title()} invoices"
    else:
        stmt = stmt.where(Invoice.status != "void")
        title = "Recent invoices"
    if args.get("mine"):
        stmt = stmt.where(Invoice.created_by == ctx.user.id)
        title = "Your " + title.lower()
    if args.get("customer"):
        stmt = stmt.where(func.lower(Contact.display_name).like(_like(args["customer"]), escape="\\"))
    limit = min(int(args.get("limit") or MAX_ROWS), MAX_ROWS)
    total = ctx.db.execute(select(func.count()).select_from(stmt.order_by(None).subquery())).scalar_one()
    rows = ctx.db.execute(stmt.order_by(Invoice.date.desc(), Invoice.created_at.desc()).limit(limit)).all()
    if not rows:
        return {"text": f"No {title.lower()} found.", "cards": []}
    table = [
        [inv.invoice_number, name, inv.date.isoformat(), inv.due_date.isoformat(), inr(inv.total), inr(Decimal(inv.total) - Decimal(inv.amount_paid)), inv.status.replace("_", " ")]
        for inv, name in rows
    ]
    more = f" Showing the latest {len(rows)}." if total > len(rows) else ""
    return {
        "text": f"{title}: {total} found.{more}",
        "cards": [{"type": "table", "title": title, "columns": ["Invoice", "Customer", "Date", "Due", "Total", "Balance", "Status"], "rows": table}],
    }


def _find_customers(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    kind = "vendor" if args.get("kind") == "vendor" else "customer"
    found = find_contacts(ctx.db, ctx.org_id, args.get("query", ""), kind, limit=MAX_ROWS)
    label = "Suppliers" if kind == "vendor" else "Customers"
    if not found:
        return {"text": f"No {label.lower()} found for “{args.get('query', '')}”.", "cards": []}
    can_balance = kind == "customer" and perms.can(ctx.perm, "invoices", perms.VIEW)
    owed: Dict[str, Decimal] = {}
    if can_balance:
        for cid, bal in ctx.db.execute(
            select(Invoice.customer_id, func.sum(Invoice.total - Invoice.amount_paid))
            .where(Invoice.organization_id == ctx.org_id, Invoice.customer_id.in_([c.id for c in found]), Invoice.status.in_(OPEN_STATUSES))
            .group_by(Invoice.customer_id)
        ):
            owed[cid] = Decimal(str(bal or 0))
    columns = ["Name", "Phone", "Email", "GSTIN"] + (["Outstanding"] if can_balance else [])
    rows = [[c.display_name, c.mobile or c.phone or "—", c.email or "—", c.gstin or "—"] + ([inr(owed.get(c.id, 0))] if can_balance else []) for c in found]
    return {"text": f"{len(found)} {label.lower()} found.", "cards": [{"type": "table", "title": label, "columns": columns, "rows": rows}]}


def _product_row(i: Item, show_cost: bool) -> List[str]:
    row = [i.name, i.sku, i.brand or "—", i.category or "—", inr(i.selling_price), num(i.stock_on_hand) if i.track_inventory else "—"]
    if show_cost:
        row.append(inr(i.cost_price))
    return row


def _products_card(ctx: Ctx, items: List[Item], title: str) -> Dict[str, Any]:
    show_cost = perms.can_see_financial(ctx.perm)
    columns = ["Product", "SKU", "Brand", "Category", "Price", "In stock"] + (["Cost"] if show_cost else [])
    return {"type": "table", "title": title, "columns": columns, "rows": [_product_row(i, show_cost) for i in items]}


def _search_products(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    stmt = select(Item).where(Item.organization_id == ctx.org_id, Item.is_active.is_(True))
    parts = []
    query = (args.get("query") or "").strip()
    if query:
        like = _like(query)
        stmt = stmt.where(
            or_(
                func.lower(Item.name).like(like, escape="\\"),
                func.lower(Item.sku).like(like, escape="\\"),
                func.lower(Item.brand).like(like, escape="\\"),
                func.lower(Item.barcode).like(like, escape="\\"),
                func.lower(Item.category).like(like, escape="\\"),
            )
        )
        parts.append(f"“{query}”")
    category = (args.get("category") or "").strip()
    if category:
        stmt = stmt.where(func.lower(Item.category).like(_like(category), escape="\\"))
        parts.append(f"category {category}")
    if args.get("in_stock_only"):
        stmt = stmt.where(Item.stock_on_hand > 0)
    total = ctx.db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    items = list(ctx.db.execute(stmt.order_by(Item.name).limit(min(int(args.get("limit") or MAX_ROWS), MAX_ROWS))).scalars())
    what = " and ".join(parts) or "all products"
    if not items:
        return {"text": f"No products found for {what}.", "cards": []}
    more = f" Showing the first {len(items)}; narrow it down to see others." if total > len(items) else ""
    return {"text": f"{total} product{'s' if total != 1 else ''} found for {what}.{more}", "cards": [_products_card(ctx, items, "Products")]}


def _low_stock(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    stmt = select(Item).where(
        Item.organization_id == ctx.org_id, Item.is_active.is_(True), Item.track_inventory.is_(True), Item.stock_on_hand <= Item.reorder_level
    )
    total = ctx.db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    items = list(ctx.db.execute(stmt.order_by(Item.stock_on_hand, Item.name).limit(MAX_ROWS)).scalars())
    if not items:
        return {"text": "No products are at or below their reorder level.", "cards": []}
    rows = [[i.name, i.sku, num(i.stock_on_hand), num(i.reorder_level)] for i in items]
    more = f" Showing the {len(items)} lowest." if total > len(items) else ""
    return {
        "text": f"{total} product{'s' if total != 1 else ''} at or below the reorder level.{more}",
        "cards": [{"type": "table", "title": "Low stock", "columns": ["Product", "SKU", "In stock", "Reorder at"], "rows": rows}],
    }


def _stock_updates(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    start, end, label = period_range(args.get("period", "today"), ctx.today)
    rows = ctx.db.execute(
        select(InventoryAdjustment, Item.name)
        .join(Item, Item.id == InventoryAdjustment.item_id)
        .where(InventoryAdjustment.organization_id == ctx.org_id, InventoryAdjustment.date >= start, InventoryAdjustment.date <= end)
        .order_by(InventoryAdjustment.created_at.desc())
        .limit(MAX_ROWS)
    ).all()
    if not rows:
        return {"text": f"No stock updates {label}.", "cards": []}
    table = [[a.adjustment_number, name, f"{Decimal(a.quantity_delta):+f}".rstrip("0").rstrip("."), a.reason, a.date.isoformat()] for a, name in rows]
    return {
        "text": f"{len(rows)} stock update{'s' if len(rows) != 1 else ''} {label}.",
        "cards": [{"type": "table", "title": f"Stock updates · {label}", "columns": ["No.", "Product", "Change", "Reason", "Date"], "rows": table}],
    }


def _categories(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    rows = ctx.db.execute(
        select(Item.category, func.count(Item.id)).where(Item.organization_id == ctx.org_id, Item.category.is_not(None)).group_by(Item.category).order_by(Item.category).limit(100)
    ).all()
    if not rows:
        return {"text": "No product categories yet. They are created when you add products with a category.", "cards": []}
    return {"text": f"{len(rows)} categories.", "cards": [{"type": "table", "title": "Categories", "columns": ["Category", "Products"], "rows": [[c, str(n)] for c, n in rows]}]}


def _list_purchase_orders(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    stmt = select(PurchaseOrder, Contact.display_name).join(Contact, Contact.id == PurchaseOrder.vendor_id).where(PurchaseOrder.organization_id == ctx.org_id)
    status = (args.get("status") or "").lower()
    if status in ("draft", "issued", "billed", "cancelled"):
        stmt = stmt.where(PurchaseOrder.status == status)
    rows = ctx.db.execute(stmt.order_by(PurchaseOrder.date.desc()).limit(MAX_ROWS)).all()
    if not rows:
        return {"text": "No purchase orders found.", "cards": []}
    table = [[po.purchase_order_number, name, po.date.isoformat(), inr(po.total), po.status] for po, name in rows]
    return {"text": f"{len(rows)} purchase orders.", "cards": [{"type": "table", "title": "Purchase orders", "columns": ["PO", "Supplier", "Date", "Total", "Status"], "rows": table}]}


def _list_bills(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    stmt = select(Bill, Contact.display_name).join(Contact, Contact.id == Bill.vendor_id).where(Bill.organization_id == ctx.org_id, Bill.status != "void")
    if (args.get("status") or "").lower() in ("pending", "unpaid", "open"):
        stmt = stmt.where(Bill.status.in_(("open", "partially_paid", "received", "sent")))
    rows = ctx.db.execute(stmt.order_by(Bill.date.desc()).limit(MAX_ROWS)).all()
    if not rows:
        return {"text": "No bills found.", "cards": []}
    table = [[b.bill_number, name, b.date.isoformat(), inr(b.total), b.status.replace("_", " ")] for b, name in rows]
    return {"text": f"{len(rows)} bills.", "cards": [{"type": "table", "title": "Bills", "columns": ["Bill", "Supplier", "Date", "Total", "Status"], "rows": table}]}


def _top_customers(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    start, end, label = period_range(args.get("period", "year"), ctx.today)
    rows = ctx.db.execute(
        select(Contact.display_name, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0))
        .join(Contact, Contact.id == Invoice.customer_id)
        .where(Invoice.organization_id == ctx.org_id, Invoice.status.notin_(("draft", "void", "cancelled")), Invoice.date >= start, Invoice.date <= end)
        .group_by(Contact.display_name)
        .order_by(func.sum(Invoice.total).desc())
        .limit(5)
    ).all()
    if not rows:
        return {"text": f"No sales to customers {label} yet, so there is no best customer to name.", "cards": []}
    best = rows[0]
    return {
        "text": f"Your best customer {label} is {best[0]} with {inr(best[2])} across {best[1]} invoice{'s' if best[1] != 1 else ''}.",
        "cards": [{"type": "table", "title": f"Top customers · {label}", "columns": ["Customer", "Invoices", "Sales"], "rows": [[n, str(c), inr(t)] for n, c, t in rows]}],
    }


def _receivables(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    owed, count = ctx.db.execute(
        select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0), func.count(Invoice.id)).where(
            Invoice.organization_id == ctx.org_id, Invoice.status.in_(OPEN_STATUSES)
        )
    ).one()
    overdue = ctx.db.execute(
        select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0)).where(
            Invoice.organization_id == ctx.org_id, Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < ctx.today
        )
    ).scalar_one()
    return {
        "text": f"Customers owe {inr(owed)} across {count} open invoices; {inr(overdue)} of it is overdue.",
        "cards": [{"type": "stats", "title": "Receivables", "items": [{"label": "Outstanding", "value": inr(owed)}, {"label": "Overdue", "value": inr(overdue)}, {"label": "Open invoices", "value": str(count)}]}],
    }


# --------------------------------------------------------------------------- #
# Write tools: prepare() validates and previews, run() performs after confirmation
# --------------------------------------------------------------------------- #
def _preview(title: str, fields: List[tuple], warnings: Optional[List[str]] = None) -> Dict[str, Any]:
    return {"type": "preview", "title": title, "fields": [{"label": k, "value": str(v)} for k, v in fields if v not in (None, "")], "warnings": warnings or []}


PRODUCT_REQUIRED = ("name", "sku", "selling_price", "tax_rate", "opening_stock")
PRODUCT_LABELS = {
    "name": "product name",
    "sku": "SKU",
    "selling_price": "selling price",
    "tax_rate": "GST / tax rate (%)",
    "opening_stock": "opening stock quantity",
}


def product_missing(fields: Dict[str, Any]) -> List[str]:
    return [k for k in PRODUCT_REQUIRED if fields.get(k) in (None, "")]


def _prepare_product(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    f = {k: (v.strip() if isinstance(v, str) else v) for k, v in args.items() if v is not None}
    if f.get("name"):
        # Look for the product in the inventory first: no point asking for a price of something we already have.
        dupes = similar_items(ctx.db, ctx.org_id, f["name"], f.get("brand"), f.get("barcode"), f.get("sku") if not f.get("sku_suggested") else None)
        hard = [d for d in dupes if d["why"] in ("same barcode", "same SKU")]
        if hard:
            raise ToolError(f"This product already exists: {hard[0]['name']} ({hard[0]['sku']}) has the {hard[0]['why']}. I will not create a duplicate. Do you want to add stock to it or update it instead?")
        if dupes and not f.get("allow_duplicate"):
            d = dupes[0]
            raise ToolError(f"This looks like “{d['name']}” ({d['sku']}) which is already in your inventory. Reply “add anyway” (with the price, GST and stock) to create it as a new product, or tell me to update the existing one.")
    missing = product_missing(f)
    if missing:
        raise ToolError("I still need: " + ", ".join(PRODUCT_LABELS[m] for m in missing) + ". I never guess prices, tax rates, SKUs or stock.")
    f["selling_price"] = _dec(f["selling_price"], "Selling price", minimum=Decimal("0"))
    f["tax_rate"] = _dec(f["tax_rate"], "Tax rate", minimum=Decimal("0"))
    if f["tax_rate"] > 100:
        raise ToolError("Tax rate must be between 0 and 100.")
    f["opening_stock"] = _dec(f["opening_stock"], "Opening stock", minimum=Decimal("0"))
    f["sku"] = str(f["sku"]).upper()[:50]
    cat = match_category(ctx.db, ctx.org_id, f.get("category"))
    f["category"] = cat["category"]
    warnings = []
    if cat["is_new"] and cat["category"]:
        warnings.append(f"“{cat['category']}” is a new category (existing: {', '.join(cat['existing'][:6]) or 'none yet'}).")
    preview = _preview(
        "New product",
        [
            ("Name", f["name"]),
            ("Brand", f.get("brand")),
            ("SKU", f["sku"]),
            ("Category", f.get("category")),
            ("Selling price", inr(f["selling_price"])),
            ("GST / tax", f"{num(f['tax_rate'])}%"),
            ("Opening stock", f"{num(f['opening_stock'])} {f.get('unit') or 'pcs'}"),
            ("Barcode", f.get("barcode")),
            ("HSN", f.get("hsn_sac")),
            ("Description", (f.get("description") or "")[:160]),
        ],
        warnings,
    )
    return {"args": f, "preview": preview}


def _run_create_product(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    from backend.routers.items import create_item
    from backend.schemas.items import ItemCreate

    payload = ItemCreate(
        name=args["name"],
        sku=args["sku"],
        brand=args.get("brand"),
        category=args.get("category"),
        description=args.get("description"),
        barcode=args.get("barcode") or None,
        hsn_sac=args.get("hsn_sac"),
        unit=args.get("unit") or "pcs",
        selling_price=args["selling_price"],
        tax_rate=args["tax_rate"],
        opening_stock=args["opening_stock"],
        opening_stock_rate=Decimal(str(args.get("cost_price") or 0)) if perms.can_see_financial(ctx.perm) else Decimal("0"),
        cost_price=Decimal(str(args.get("cost_price") or 0)) if perms.can_see_financial(ctx.perm) else Decimal("0"),
        track_inventory=True,
        reorder_level=Decimal(str(args.get("reorder_level") or 0)),
    )
    item = create_item(payload, ctx.user, ctx.db)
    return {"text": f"Added {item.name} ({item.sku}) to your inventory with {num(item.opening_stock)} in stock.", "cards": [], "record": {"type": "item", "id": item.id}}


def _prepare_update_product(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    item = one_item(ctx, args.get("item", ""))
    changes: Dict[str, Any] = {}
    for key in ("name", "brand", "category", "description", "hsn_sac", "barcode", "unit"):
        if args.get(key) not in (None, ""):
            changes[key] = str(args[key]).strip()
    for key, label in (("selling_price", "Selling price"), ("tax_rate", "Tax rate"), ("reorder_level", "Reorder level")):
        if args.get(key) not in (None, ""):
            changes[key] = _dec(args[key], label, minimum=Decimal("0"))
    if args.get("cost_price") not in (None, ""):
        if not perms.can_see_financial(ctx.perm):
            raise ToolError("You are not allowed to change cost prices.")
        changes["cost_price"] = _dec(args["cost_price"], "Cost price", minimum=Decimal("0"))
    if changes.get("tax_rate", Decimal("0")) > 100:
        raise ToolError("Tax rate must be between 0 and 100.")
    if not changes:
        raise ToolError(f"What should I change on {item.name}? For example the price, tax rate, category or brand.")
    if "category" in changes:
        changes["category"] = match_category(ctx.db, ctx.org_id, changes["category"])["category"]
    fields = [("Product", f"{item.name} ({item.sku})")] + [(k.replace("_", " ").capitalize(), (inr(v) if "price" in k else v)) for k, v in changes.items()]
    return {"args": {"item": item.id, **changes}, "preview": _preview("Update product", fields)}


def _run_update_product(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    from backend.routers.items import update_item
    from backend.schemas.items import ItemUpdate

    changes = {k: v for k, v in args.items() if k != "item"}
    item = update_item(args["item"], ItemUpdate(**changes), ctx.user, ctx.db)
    return {"text": f"Updated {item.name} ({item.sku}).", "cards": [], "record": {"type": "item", "id": item.id}}


def _prepare_adjust_stock(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    item = one_item(ctx, args.get("item", ""))
    if not item.track_inventory:
        raise ToolError(f"Stock is not tracked for {item.name}.")
    if args.get("quantity") in (None, ""):
        raise ToolError(f"How many units of {item.name} should I add or remove?")
    delta = _dec(args["quantity"], "Quantity")
    if delta == 0:
        raise ToolError("The quantity change cannot be zero.")
    reason = (args.get("reason") or "Stock update via AI workspace").strip()[:120]
    after = Decimal(str(item.stock_on_hand)) + delta
    warnings = [f"This would take stock below zero ({num(after)})."] if after < 0 else []
    if after < 0:
        raise ToolError(f"Only {num(item.stock_on_hand)} of {item.name} in stock, so I cannot remove {num(abs(delta))}.")
    return {
        "args": {"item": item.id, "quantity": delta, "reason": reason},
        "preview": _preview("Stock update", [("Product", f"{item.name} ({item.sku})"), ("Change", f"{delta:+f}".rstrip("0").rstrip(".")), ("Now", num(item.stock_on_hand)), ("After", num(after)), ("Reason", reason)], warnings),
    }


def _run_adjust_stock(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    from backend.routers.items import create_adjustment
    from backend.schemas.items import InventoryAdjustmentCreate

    out = create_adjustment(InventoryAdjustmentCreate(item_id=args["item"], date=ctx.today, quantity_delta=args["quantity"], reason=args["reason"]), ctx.user, ctx.db)
    item = ctx.db.get(Item, args["item"])
    return {"text": f"Stock updated ({out.adjustment_number}): {item.name} now has {num(item.stock_on_hand)}.", "cards": [], "record": {"type": "adjustment", "id": out.id}}


def _lines_for_document(ctx: Ctx, raw_lines: Any, *, kind: str) -> tuple[list, list]:
    if not isinstance(raw_lines, list) or not raw_lines:
        raise ToolError("Which products and quantities should go on it?")
    lines, shown = [], []
    for raw in raw_lines[:30]:
        item = one_item(ctx, str(raw.get("item", "")))
        quantity = _dec(raw.get("quantity", 1), "Quantity", minimum=Decimal("0"))
        if quantity <= 0:
            raise ToolError("Quantities must be more than zero.")
        if raw.get("rate") not in (None, ""):
            rate = _dec(raw["rate"], "Rate", minimum=Decimal("0"))
        else:
            rate = Decimal(str(item.selling_price if kind == "sale" else item.cost_price))
            if rate == 0:
                raise ToolError(f"{item.name} has no {'selling' if kind == 'sale' else 'cost'} price saved. Tell me the rate to use.")
        lines.append({"item_id": item.id, "description": item.name, "quantity": quantity, "rate": rate, "tax_rate": Decimal(str(item.tax_rate))})
        shown.append([item.name, num(quantity), inr(rate), f"{num(item.tax_rate)}%", inr(quantity * rate)])
    return lines, shown


def _prepare_invoice(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    customer = one_contact(ctx, args.get("customer", ""), "customer")
    lines, shown = _lines_for_document(ctx, args.get("lines"), kind="sale")
    subtotal = sum((Decimal(r["quantity"]) * Decimal(r["rate"]) for r in lines), Decimal("0"))
    preview = _preview("New invoice (saved as a draft)", [("Customer", customer.display_name), ("Items", f"{len(lines)}"), ("Subtotal before GST", inr(subtotal))])
    preview["lines"] = {"columns": ["Product", "Qty", "Rate", "GST", "Amount"], "rows": shown}
    return {"args": {"customer": customer.id, "lines": lines}, "preview": preview}


def _run_create_invoice(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    from backend.routers.invoices import create_invoice_record
    from backend.schemas.sales import InvoiceCreate, LineInput

    payload = InvoiceCreate(
        customer_id=args["customer"],
        date=ctx.today,
        salesperson=ctx.user.name,
        status="draft",
        lines=[LineInput(**{**line, "quantity": Decimal(str(line["quantity"])), "rate": Decimal(str(line["rate"])), "tax_rate": Decimal(str(line["tax_rate"]))}) for line in args["lines"]],
    )
    inv = create_invoice_record(ctx.db, ctx.user, payload)
    ctx.db.flush()
    ctx.memory["invoice"] = inv.id
    return {"text": f"Created draft invoice {inv.invoice_number} for {inr(inv.total)}.", "cards": [], "record": {"type": "invoice", "id": inv.id}}


def _invoice_for_email(ctx: Ctx, ref: str) -> Invoice:
    ref = (ref or "").strip()
    if not ref or ref.lower() in ("last", "it", "this", "that", "latest", "new"):
        inv_id = ctx.memory.get("invoice")
        inv = ctx.db.get(Invoice, inv_id) if inv_id else None
        if inv is None:
            inv = ctx.db.execute(select(Invoice).where(Invoice.organization_id == ctx.org_id, Invoice.created_by == ctx.user.id).order_by(Invoice.created_at.desc()).limit(1)).scalar_one_or_none()
        if inv is None:
            raise ToolError("Which invoice should I send? Give me the invoice number.")
        return inv
    inv = ctx.db.execute(select(Invoice).where(Invoice.organization_id == ctx.org_id, or_(Invoice.id == ref, func.upper(Invoice.invoice_number) == ref.upper()))).scalar_one_or_none()
    if inv is None:
        raise ToolError(f"I could not find invoice {ref}.")
    return inv


def _prepare_send_invoice(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    inv = _invoice_for_email(ctx, str(args.get("invoice", "")))
    if inv.status == "void":
        raise ToolError(f"Invoice {inv.invoice_number} is void and cannot be emailed.")
    customer = ctx.db.get(Contact, inv.customer_id)
    to = (args.get("to_email") or (customer.email if customer else "") or "").strip()
    if not to or "@" not in to:
        raise ToolError(f"What email address should I send invoice {inv.invoice_number} to? {customer.display_name if customer else 'The customer'} has none saved.")
    warnings = ["Sending a draft invoice also issues it (it is posted to your books)."] if inv.status == "draft" else []
    return {
        "args": {"invoice": inv.id, "to_email": to},
        "preview": _preview("Email invoice", [("Invoice", f"{inv.invoice_number} - {inr(inv.total)}"), ("Customer", customer.display_name if customer else ""), ("To", to), ("PDF attached", "yes")], warnings),
    }


def _run_send_invoice(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    from backend.routers.invoices import SendInvoiceEmailRequest, send_invoice_via_gmail

    inv = ctx.db.get(Invoice, args["invoice"])
    send_invoice_via_gmail(args["invoice"], SendInvoiceEmailRequest(to_email=args["to_email"], attach_pdf=True), ctx.user, ctx.db)
    return {"text": f"Emailed invoice {inv.invoice_number} to {args['to_email']}.", "cards": [], "record": {"type": "invoice", "id": inv.id}}


def _prepare_purchase_order(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    vendor = one_contact(ctx, args.get("vendor", ""), "vendor")
    lines, shown = _lines_for_document(ctx, args.get("lines"), kind="purchase")
    total = sum((Decimal(r["quantity"]) * Decimal(r["rate"]) for r in lines), Decimal("0"))
    preview = _preview("New purchase order (saved as a draft)", [("Supplier", vendor.display_name), ("Items", f"{len(lines)}"), ("Value before GST", inr(total))])
    preview["lines"] = {"columns": ["Product", "Qty", "Rate", "GST", "Amount"], "rows": shown}
    return {"args": {"vendor": vendor.id, "lines": lines}, "preview": preview}


def _run_create_purchase_order(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    from backend.models import PurchaseOrder as PO
    from backend.schemas.documents_flow import PurchaseOrderCreate
    from backend.schemas.sales import LineInput
    from backend.services import doc_flow, numbering

    kind = doc_flow.PURCHASE_ORDER
    payload = PurchaseOrderCreate(
        vendor_id=args["vendor"],
        date=ctx.today,
        status="draft",
        lines=[LineInput(**{**line, "quantity": Decimal(str(line["quantity"])), "rate": Decimal(str(line["rate"])), "tax_rate": Decimal(str(line["tax_rate"]))}) for line in args["lines"]],
    )
    doc = PO(organization_id=ctx.org_id, status="draft", created_by=ctx.user.id)
    setattr(doc, kind.number_attr, numbering.next_number(ctx.db, ctx.org_id, kind.key))
    doc_flow.price(ctx.db, ctx.org_id, doc, payload, kind)
    ctx.db.add(doc)
    ctx.db.flush()
    return {"text": f"Created draft purchase order {doc.purchase_order_number} for {inr(doc.total)}.", "cards": [], "record": {"type": "purchase_order", "id": doc.id}}


def _prepare_contact(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    name = (args.get("name") or "").strip()
    if not name:
        raise ToolError("What is the name?")
    kind = "vendor" if args.get("kind") == "vendor" else "customer"
    if find_contacts(ctx.db, ctx.org_id, name, kind, limit=1) and _norm(find_contacts(ctx.db, ctx.org_id, name, kind, limit=1)[0].display_name) == _norm(name):
        raise ToolError(f"A {kind} named {name} already exists.")
    fields = {"name": name, "kind": kind, "phone": (args.get("phone") or "").strip() or None, "email": (args.get("email") or "").strip() or None, "gstin": (args.get("gstin") or "").strip().upper() or None}
    return {"args": fields, "preview": _preview("New supplier" if kind == "vendor" else "New customer", [("Name", name), ("Phone", fields["phone"]), ("Email", fields["email"]), ("GSTIN", fields["gstin"])])}


def _run_create_contact(ctx: Ctx, args: Dict[str, Any]) -> Dict[str, Any]:
    from backend.routers.contacts import create_contact
    from backend.schemas.contacts import ContactCreate

    out = create_contact(ContactCreate(type=args["kind"], display_name=args["name"], phone=args.get("phone"), email=args.get("email"), gstin=args.get("gstin")), ctx.user, ctx.db)
    return {"text": f"Added {out.display_name}.", "cards": [], "record": {"type": "contact", "id": out.id}}


_LINES_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {"item": {"type": "string", "description": "product name, SKU or barcode"}, "quantity": {"type": "number"}, "rate": {"type": "number", "description": "only if the user said a rate"}},
        "required": ["item", "quantity"],
    },
}


def _tool(**kw) -> Tool:
    return Tool(**kw)


REGISTRY: Dict[str, Tool] = {
    t.name: t
    for t in (
        _tool(name="sales_summary", feature="invoices", action=perms.VIEW, handler=_sales_summary, description="Sales totals for a period. mine=true for the employee's own sales.",
              schema={"type": "object", "properties": {"period": {"type": "string", "enum": ["today", "yesterday", "week", "month", "last_month", "year"]}, "mine": {"type": "boolean"}}}),
        _tool(name="top_customers", feature="invoices", action=perms.VIEW, handler=_top_customers, description="Best customers by sales value for a period (default this year).",
              schema={"type": "object", "properties": {"period": {"type": "string", "enum": ["today", "week", "month", "last_month", "year"]}}}),
        _tool(name="list_invoices", feature="invoices", action=perms.VIEW, handler=_list_invoices, description="List invoices: pending, overdue, paid, draft or recent. mine=true for own invoices.",
              schema={"type": "object", "properties": {"status": {"type": "string", "enum": ["pending", "overdue", "paid", "draft", "recent"]}, "mine": {"type": "boolean"}, "customer": {"type": "string"}}}),
        _tool(name="find_customers", feature="customers", action=perms.VIEW, handler=_find_customers, description="Look up customers or suppliers by name, phone or email.",
              schema={"type": "object", "properties": {"query": {"type": "string"}, "kind": {"type": "string", "enum": ["customer", "vendor"]}}, "required": ["query"]}),
        _tool(name="search_products", feature="items", action=perms.VIEW, handler=_search_products, description="Search products by name, SKU, brand, barcode or category.",
              schema={"type": "object", "properties": {"query": {"type": "string"}, "category": {"type": "string"}, "in_stock_only": {"type": "boolean"}}}),
        _tool(name="low_stock_products", feature="items", action=perms.VIEW, handler=_low_stock, description="Products at or below their reorder level.", schema={"type": "object", "properties": {}}),
        _tool(name="stock_updates", feature="items", action=perms.VIEW, handler=_stock_updates, description="Stock adjustments recorded in a period.",
              schema={"type": "object", "properties": {"period": {"type": "string", "enum": ["today", "yesterday", "week", "month"]}}}),
        _tool(name="product_categories", feature="items", action=perms.VIEW, handler=_categories, description="The product categories in use.", schema={"type": "object", "properties": {}}),
        _tool(name="list_purchase_orders", feature="purchaseOrders", action=perms.VIEW, handler=_list_purchase_orders, description="List purchase orders.",
              schema={"type": "object", "properties": {"status": {"type": "string", "enum": ["draft", "issued", "billed", "cancelled"]}}}),
        _tool(name="list_bills", feature="bills", action=perms.VIEW, handler=_list_bills, description="List purchase bills.", schema={"type": "object", "properties": {"status": {"type": "string", "enum": ["pending", "all"]}}}),
        _tool(name="receivables_summary", feature="reports", action=perms.VIEW, handler=_receivables, financial=True, description="What customers owe in total, and how much is overdue.", schema={"type": "object", "properties": {}}),
        _tool(name="create_product", feature="items", action=perms.CREATE, prepare=_prepare_product, run=_run_create_product, write=True,
              description="Add a product. Needs name, sku, selling_price, tax_rate and opening_stock from the user: never invent them.",
              schema={"type": "object", "properties": {"name": {"type": "string"}, "brand": {"type": "string"}, "sku": {"type": "string"}, "category": {"type": "string"}, "selling_price": {"type": "number"}, "tax_rate": {"type": "number"}, "opening_stock": {"type": "number"}, "description": {"type": "string"}, "barcode": {"type": "string"}}}),
        _tool(name="update_product", feature="items", action=perms.EDIT, prepare=_prepare_update_product, run=_run_update_product, write=True, description="Change details of an existing product.",
              schema={"type": "object", "properties": {"item": {"type": "string", "description": "product name, SKU or barcode"}, "name": {"type": "string"}, "brand": {"type": "string"}, "category": {"type": "string"}, "selling_price": {"type": "number"}, "tax_rate": {"type": "number"}, "description": {"type": "string"}, "reorder_level": {"type": "number"}}, "required": ["item"]}),
        _tool(name="adjust_stock", feature="items", action=perms.EDIT, prepare=_prepare_adjust_stock, run=_run_adjust_stock, write=True, description="Add (positive) or remove (negative) stock of a product.",
              schema={"type": "object", "properties": {"item": {"type": "string"}, "quantity": {"type": "number"}, "reason": {"type": "string"}}, "required": ["item", "quantity"]}),
        _tool(name="create_invoice", feature="invoices", action=perms.CREATE, prepare=_prepare_invoice, run=_run_create_invoice, write=True, description="Create a draft sales invoice for a customer.",
              schema={"type": "object", "properties": {"customer": {"type": "string"}, "lines": _LINES_SCHEMA}, "required": ["customer", "lines"]}),
        _tool(name="send_invoice_email", feature="invoices", action=perms.EDIT, prepare=_prepare_send_invoice, run=_run_send_invoice, write=True, description="Email an invoice (PDF) to the customer. invoice = number, or 'last' for the one just created.",
              schema={"type": "object", "properties": {"invoice": {"type": "string"}, "to_email": {"type": "string", "description": "only if the user gave an address; else the customer's saved email is used"}}}),
        _tool(name="create_purchase_order", feature="purchaseOrders", action=perms.CREATE, prepare=_prepare_purchase_order, run=_run_create_purchase_order, write=True, description="Create a draft purchase order to a supplier.",
              schema={"type": "object", "properties": {"vendor": {"type": "string"}, "lines": _LINES_SCHEMA}, "required": ["vendor", "lines"]}),
        _tool(name="create_contact", feature="customers", action=perms.CREATE, prepare=_prepare_contact, run=_run_create_contact, write=True, description="Add a customer or supplier.",
              schema={"type": "object", "properties": {"name": {"type": "string"}, "kind": {"type": "string", "enum": ["customer", "vendor"]}, "phone": {"type": "string"}, "email": {"type": "string"}, "gstin": {"type": "string"}}, "required": ["name"]}),
    )
}


# --------------------------------------------------------------------------- #
# The one door
# --------------------------------------------------------------------------- #
def _in_plan(ctx: Ctx, feature: str) -> bool:
    plan = subscription.plan_features(ctx.user.organization)
    return plan is None or feature in plan or feature in base_permissions.CORE_FEATURES


def allowed(ctx: Ctx, tool: Tool) -> bool:
    if not ctx.workspace.is_active or ctx.employee.status == "revoked" or not ctx.user.is_active:
        return False
    if tool.financial and not perms.can_see_financial(ctx.perm):
        return False
    return perms.can(ctx.perm, tool.feature, tool.action) and _in_plan(ctx, tool.feature)


def available_tools(ctx: Ctx) -> List[Tool]:
    return [t for t in REGISTRY.values() if allowed(ctx, t)]


def denial(tool: Optional[Tool], name: str = "") -> str:
    if tool is None:
        return "I don't have a way to do that."
    return "Your workspace is not allowed to do that. Ask your administrator if you need access."


def execute(ctx: Ctx, name: str, args: Dict[str, Any], *, confirmed: bool = False) -> Dict[str, Any]:
    """Run a tool for this employee. Returns {"status": "ok"|"denied"|"clarify"|"confirm", ...}."""
    tool = REGISTRY.get(name)
    if tool is None or not allowed(ctx, tool):
        audit.record(ctx.db, ctx.user, "denied", "ai_tool", None, f"AI workspace: blocked {name}")
        return {"status": "denied", "text": denial(tool, name), "cards": []}
    args = args if isinstance(args, dict) else {}
    try:
        if not tool.write:
            out = tool.handler(ctx, args)
            return {"status": "ok", "tool": name, **out}
        prepared = tool.prepare(ctx, args)
        if not confirmed:
            # The pending action keeps what was asked (re-validated again at confirmation), not the resolved form.
            return {"status": "confirm", "tool": name, "args": _jsonable(args), "text": "Please check the details and confirm.", "cards": [prepared["preview"]]}
        # Save the conversation state first: if the write fails and is rolled back, the chat survives.
        ctx.db.commit()
        out = tool.run(ctx, prepared["args"])
        audit.record(ctx.db, ctx.user, "create" if tool.action == perms.CREATE else "update", "ai_action", (out.get("record") or {}).get("id"), f"AI workspace ({ctx.workspace.name}): {out['text']}")
        ctx.db.commit()
        return {"status": "ok", "tool": name, **out}
    except ToolError as exc:  # raised while validating: nothing was written, nothing to roll back
        return {"status": "clarify", "tool": name, "text": str(exc), "cards": []}
    except HTTPException as exc:
        ctx.db.rollback()
        return {"status": "clarify", "tool": name, "text": str(exc.detail), "cards": []}
    except ValueError as exc:  # pydantic validation of a bad value
        ctx.db.rollback()
        return {"status": "clarify", "tool": name, "text": f"That did not look right: {str(exc).splitlines()[0] if str(exc) else 'invalid value'}", "cards": []}


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, Decimal):
        return str(value)
    return value


def anthropic_tools(ctx: Ctx) -> List[Dict[str, Any]]:
    """Only the tools this employee may use, in the API's tool format (the model never even sees the others)."""
    return [{"name": t.name, "description": t.description, "input_schema": t.schema} for t in available_tools(ctx)]


# --------------------------------------------------------------------------- #
# Several steps, one confirmation
# --------------------------------------------------------------------------- #
MAX_PLAN_STEPS = 5


def describe_step(name: str, args: Dict[str, Any]) -> str:
    a = args or {}
    if name == "create_contact":
        who = "supplier" if a.get("kind") == "vendor" else "customer"
        extra = f" ({a['email']})" if a.get("email") else ""
        return f"Add {who} {a.get('name', '?')}{extra}"
    if name == "create_invoice":
        lines = ", ".join(f"{a_l.get('quantity', 1)} x {a_l.get('item', '?')}" for a_l in (a.get("lines") or [])[:4] if isinstance(a_l, dict))
        return f"Create an invoice for {a.get('customer', '?')}: {lines}"
    if name == "send_invoice_email":
        to = a.get("to_email") or "the customer's email"
        return f"Email the invoice ({a.get('invoice') or 'the new one'}) to {to}"
    if name == "create_product":
        return f"Add product {a.get('name', '?')}"
    if name == "adjust_stock":
        return f"Change stock of {a.get('item', '?')} by {a.get('quantity', '?')}"
    if name == "create_purchase_order":
        return f"Create a purchase order for {a.get('vendor', '?')}"
    if name == "update_product":
        return f"Update product {a.get('item', '?')}"
    return REGISTRY[name].description if name in REGISTRY else name


def plan_problem(ctx: Ctx, steps: List[Dict[str, Any]]) -> Optional[str]:
    """Why this plan cannot be offered (an unknown tool, or one the user may not use), else None."""
    if not steps or len(steps) > MAX_PLAN_STEPS:
        return "That is too many steps at once. Let's do it in smaller pieces."
    for st in steps:
        tool = REGISTRY.get(st.get("tool", ""))
        if tool is None or not allowed(ctx, tool):
            return denial(tool)
    return None


def run_plan(ctx: Ctx, steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Run the steps in order, each through the normal door; stop at the first one that cannot complete."""
    done: List[str] = []
    cards: List[Dict[str, Any]] = []
    for i, st in enumerate(steps, 1):
        out = execute(ctx, st["tool"], st.get("args") or {}, confirmed=True)
        if out["status"] != "ok":
            left = len(steps) - i
            msg = out["text"] + f" I stopped at step {i}" + (f"; {left} more step{'s' if left != 1 else ''} not done." if left else ".")
            return {"status": "clarify", "text": ("Done so far: " + " ".join(done) + "\n\n" if done else "") + msg, "cards": cards}
        done.append(out["text"])
        cards.extend(out.get("cards") or [])
    return {"status": "ok", "text": "All done, boss.\n" + "\n".join(f"- {d}" for d in done), "cards": cards}
