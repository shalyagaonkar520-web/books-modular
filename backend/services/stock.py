"""Warehouses, batches and the stock movement log.

``inventory.adjust_stock`` (the one place stock on hand changes) calls
``record`` for every movement, so each sale, purchase, return, adjustment,
transfer and assembly leaves a movement row and keeps the per-warehouse and
per-batch quantities in step with ``Item.stock_on_hand``.

Organizations that never set up warehouses keep working unchanged: a default
"Primary warehouse" is created on first use, and an item's existing stock is
placed in it the first time the item moves.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from backend.models import Item, ItemStock, StockBatch, StockMovement, StockSerial, Warehouse
from backend.services.money import money, qty


def default_warehouse(db: Session, org_id: str) -> Warehouse:
    wh = (
        db.execute(
            select(Warehouse).where(Warehouse.organization_id == org_id, Warehouse.is_default.is_(True), Warehouse.is_active.is_(True))
        )
        .scalars()
        .first()
    )
    if wh is None:
        wh = (
            db.execute(
                select(Warehouse).where(Warehouse.organization_id == org_id, Warehouse.is_active.is_(True)).order_by(Warehouse.created_at)
            )
            .scalars()
            .first()
        )
    if wh is None:
        wh = Warehouse(organization_id=org_id, name="Primary warehouse", code="PRIMARY", is_default=True, is_active=True)
        db.add(wh)
        db.flush()
    return wh


def resolve_warehouse(db: Session, org_id: str, warehouse_id: Optional[str]) -> Warehouse:
    if not warehouse_id:
        return default_warehouse(db, org_id)
    wh = db.get(Warehouse, warehouse_id)
    if wh is None or wh.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Warehouse not found")
    if not wh.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Warehouse '{wh.name}' is inactive")
    return wh


def _ensure_rows(db: Session, item: Item, wh: Warehouse, quantity_before: Decimal) -> None:
    """Place stock that predates warehouses in the default warehouse, once."""
    has_any = db.execute(select(func.count()).select_from(ItemStock).where(ItemStock.item_id == item.id)).scalar_one()
    if not has_any:
        default = default_warehouse(db, item.organization_id)
        db.add(ItemStock(organization_id=item.organization_id, item_id=item.id, warehouse_id=default.id, quantity=qty(quantity_before)))
        db.flush()
    exists = db.execute(select(ItemStock.id).where(ItemStock.item_id == item.id, ItemStock.warehouse_id == wh.id)).first()
    if not exists:
        db.add(ItemStock(organization_id=item.organization_id, item_id=item.id, warehouse_id=wh.id, quantity=Decimal("0")))
        db.flush()


def _move(db: Session, model, where, delta: Decimal, allow_negative: bool, what: str) -> None:
    stmt = update(model).where(*where).values(quantity=model.quantity + delta).execution_options(synchronize_session=False)
    if delta < 0 and not allow_negative:
        stmt = stmt.where(model.quantity >= -delta)
    if db.execute(stmt).rowcount == 0:
        current = db.execute(select(model.quantity).where(*where)).scalar_one_or_none() or Decimal("0")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Insufficient stock {what}: {qty(current)} available")


def record(
    db: Session,
    item: Item,
    delta: Decimal,
    entry_date: date,
    source_type: str,
    source_id: Optional[str],
    description: str,
    created_by: Optional[str],
    warehouse_id: Optional[str] = None,
    batch_number: Optional[str] = None,
    expiry_date: Optional[date] = None,
    unit_cost: Optional[Decimal] = None,
    allow_negative: bool = False,
    total_includes_delta: bool = True,
    serial_numbers: Optional[list[str]] = None,
) -> StockMovement:
    """Log a stock movement and move it between warehouse / batch balances.

    ``total_includes_delta``: the movement is already in ``item.stock_on_hand``
    (everything through inventory.adjust_stock). Transfers move stock between
    warehouses without changing the total and pass False.

    ``serial_numbers``: the units moved, for a serial-tracked item; None when
    the movement does not name units (adjustments, opening stock).
    """
    delta = qty(delta)
    wh = resolve_warehouse(db, item.organization_id, warehouse_id)
    _ensure_rows(db, item, wh, qty(item.stock_on_hand) - (delta if total_includes_delta else Decimal("0")))
    _move(
        db,
        ItemStock,
        (ItemStock.item_id == item.id, ItemStock.warehouse_id == wh.id),
        delta,
        allow_negative,
        f"of '{item.name}' in {wh.name}",
    )
    batch = (batch_number or "").strip() or None
    if batch:
        found = db.execute(
            select(StockBatch).where(StockBatch.item_id == item.id, StockBatch.warehouse_id == wh.id, StockBatch.batch_number == batch)
        ).scalar_one_or_none()
        if found is None:
            if delta < 0 and not allow_negative:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Batch {batch} of '{item.name}' is not in stock at {wh.name}")
            found = StockBatch(
                organization_id=item.organization_id,
                item_id=item.id,
                warehouse_id=wh.id,
                batch_number=batch,
                expiry_date=expiry_date,
                quantity=Decimal("0"),
            )
            db.add(found)
            db.flush()
        elif expiry_date and not found.expiry_date:
            found.expiry_date = expiry_date
        _move(db, StockBatch, (StockBatch.id == found.id,), delta, allow_negative, f"in batch {batch} of '{item.name}'")
    if serial_numbers is not None and item.track_serial:
        move_serials(db, item, wh, delta, serial_numbers, source_type, source_id, allow_negative)
    movement = StockMovement(
        organization_id=item.organization_id,
        item_id=item.id,
        warehouse_id=wh.id,
        date=entry_date,
        quantity=delta,
        unit_cost=money(unit_cost if unit_cost is not None else item.cost_price),
        batch_number=batch,
        source_type=source_type,
        source_id=source_id,
        description=description[:255],
        created_by=created_by,
    )
    db.add(movement)
    db.flush()
    return movement


def warehouse_quantity(db: Session, item_id: str, warehouse_id: str) -> Decimal:
    value = db.execute(
        select(ItemStock.quantity).where(ItemStock.item_id == item_id, ItemStock.warehouse_id == warehouse_id)
    ).scalar_one_or_none()
    return qty(value or 0)


def parse_serials(text: Optional[str]) -> list[str]:
    """Serial numbers typed as a comma / newline separated list, de-duplicated in order."""
    seen: list[str] = []
    for part in (text or "").replace("\n", ",").replace(";", ",").split(","):
        value = part.strip()
        if value and value not in seen:
            seen.append(value[:80])
    return seen


def move_serials(
    db: Session,
    item: Item,
    wh: Warehouse,
    delta: Decimal,
    serials: list[str],
    source_type: str,
    source_id: Optional[str],
    allow_negative: bool = False,
) -> None:
    """Receive (delta > 0) or issue (delta < 0) the named units of a serial-tracked item."""
    if len(serials) != abs(int(delta)) or Decimal(len(serials)) != abs(delta):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"'{item.name}' is tracked by serial number: enter {qty(abs(delta))} serial number(s), {len(serials)} given",
        )
    existing = {
        s.serial_number: s
        for s in db.execute(select(StockSerial).where(StockSerial.item_id == item.id, StockSerial.serial_number.in_(serials))).scalars()
    }
    for number in serials:
        row = existing.get(number)
        if delta > 0:
            if row is not None and row.status == "in_stock":
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Serial {number} of '{item.name}' is already in stock")
            if row is None:
                row = StockSerial(organization_id=item.organization_id, item_id=item.id, serial_number=number, warehouse_id=wh.id)
                db.add(row)
            row.status, row.warehouse_id = "in_stock", wh.id
        else:
            if row is None or row.status != "in_stock" or row.warehouse_id != wh.id:
                if allow_negative:
                    continue
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Serial {number} of '{item.name}' is not in stock at {wh.name}")
            row.status = "out"
        row.last_source_type, row.last_source_id = source_type, source_id
    db.flush()


def serials_in_stock(db: Session, item_id: str, warehouse_id: Optional[str] = None) -> int:
    stmt = select(func.count()).select_from(StockSerial).where(StockSerial.item_id == item_id, StockSerial.status == "in_stock")
    if warehouse_id:
        stmt = stmt.where(StockSerial.warehouse_id == warehouse_id)
    return int(db.execute(stmt).scalar_one())
