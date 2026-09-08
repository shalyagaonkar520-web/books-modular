"""Stock movements and their journal effects."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models import Item
from backend.services import ledger
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money, qty


def adjust_stock(
    db: Session,
    item: Item,
    delta: Decimal,
    entry_date: date,
    source_type: str,
    source_id: Optional[str],
    description: str,
    created_by: Optional[str],
    rate: Optional[Decimal] = None,
    allow_negative: bool = False,
) -> None:
    """Change stock on hand and post the inventory asset movement."""
    if not item.track_inventory:
        return
    delta = qty(delta)
    if delta == 0:
        return
    new_qty = qty(item.stock_on_hand) + delta
    if new_qty < 0 and not allow_negative:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Insufficient stock for '{item.name}': {item.stock_on_hand} {item.unit} available",
        )
    item.stock_on_hand = new_qty
    unit_rate = money(rate if rate is not None else item.cost_price)
    value = money(delta * unit_rate)
    if value == 0:
        return
    inventory = get_account_by_code(db, item.organization_id, "1200")
    adjustments = get_account_by_code(db, item.organization_id, "7000")
    if value > 0:
        lines = [(inventory.id, value, Decimal("0"), description, None), (adjustments.id, Decimal("0"), value, description, None)]
    else:
        lines = [(adjustments.id, -value, Decimal("0"), description, None), (inventory.id, Decimal("0"), -value, description, None)]
    ledger.post_entry(db, item.organization_id, entry_date, lines, source_type, source_id, reference=item.sku, notes=description, created_by=created_by)


def post_opening_stock(db: Session, item: Item, created_by: Optional[str]) -> None:
    if not item.track_inventory or qty(item.opening_stock) == 0:
        return
    value = money(qty(item.opening_stock) * money(item.opening_stock_rate or item.cost_price))
    if value == 0:
        return
    inventory = get_account_by_code(db, item.organization_id, "1200")
    opening = get_account_by_code(db, item.organization_id, "3100")
    ledger.post_entry(
        db,
        item.organization_id,
        date.today(),
        [(inventory.id, value, Decimal("0"), f"Opening stock {item.name}", None), (opening.id, Decimal("0"), value, f"Opening stock {item.name}", None)],
        source_type="item_opening",
        source_id=item.id,
        reference=item.sku,
        created_by=created_by,
    )
