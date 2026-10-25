"""Warehouses, transfer orders, composite items and assembly, price lists and stock reports."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import (
    Assembly,
    CompositeComponent,
    Item,
    ItemStock,
    PriceList,
    PriceListItem,
    StockBatch,
    StockMovement,
    StockSerial,
    TransferOrder,
    TransferOrderLine,
    User,
    Warehouse,
)
from backend.schemas.common import MAX_MONEY, MAX_QUANTITY, APIModel, Message, Page
from backend.services import audit, inventory, numbering, stock
from backend.services.money import money, qty
from backend.services.tenancy import Pagination, get_or_404, paginate

warehouses_router = APIRouter(prefix="/api/warehouses", tags=["Inventory"])
transfers_router = APIRouter(prefix="/api/transfer-orders", tags=["Inventory"])
composites_router = APIRouter(prefix="/api/composite-items", tags=["Inventory"])
price_lists_router = APIRouter(prefix="/api/price-lists", tags=["Inventory"])
stock_router = APIRouter(prefix="/api/stock", tags=["Inventory"])


# --------------------------------------------------------------------------- #
# Warehouses
# --------------------------------------------------------------------------- #
class WarehouseIn(APIModel):
    name: str = Field(min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = None
    is_default: bool = False
    is_active: bool = True


class WarehouseOut(APIModel):
    id: str
    name: str
    code: Optional[str] = None
    address: Optional[str] = None
    is_default: bool
    is_active: bool
    item_count: int = 0
    stock_value: Decimal = Decimal("0")


def _warehouse_out(db: Session, wh: Warehouse) -> WarehouseOut:
    rows = db.execute(
        select(ItemStock.quantity, Item.cost_price)
        .join(Item, Item.id == ItemStock.item_id)
        .where(ItemStock.warehouse_id == wh.id, ItemStock.quantity != 0)
    ).all()
    return WarehouseOut(
        id=wh.id,
        name=wh.name,
        code=wh.code,
        address=wh.address,
        is_default=wh.is_default,
        is_active=wh.is_active,
        item_count=len(rows),
        stock_value=money(sum((Decimal(str(q)) * Decimal(str(c)) for q, c in rows), Decimal("0"))),
    )


def _make_default(db: Session, wh: Warehouse) -> None:
    for other in db.execute(
        select(Warehouse).where(Warehouse.organization_id == wh.organization_id, Warehouse.id != wh.id, Warehouse.is_default.is_(True))
    ).scalars():
        other.is_default = False
    wh.is_default = True


@warehouses_router.get("", response_model=List[WarehouseOut])
def list_warehouses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stock.default_warehouse(db, user.organization_id)
    db.commit()
    rows = db.execute(
        select(Warehouse).where(Warehouse.organization_id == user.organization_id).order_by(Warehouse.is_default.desc(), Warehouse.name)
    ).scalars()
    return [_warehouse_out(db, wh) for wh in rows]


@warehouses_router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
def create_warehouse(payload: WarehouseIn, user: User = Depends(require_write), db: Session = Depends(get_db)):
    stock.default_warehouse(db, user.organization_id)
    wh = Warehouse(
        organization_id=user.organization_id,
        name=payload.name,
        code=payload.code,
        address=payload.address,
        is_default=False,
        is_active=True,
    )
    db.add(wh)
    db.flush()
    if payload.is_default:
        _make_default(db, wh)
    audit.record(db, user, "create", "warehouse", wh.id, f"Added warehouse {wh.name}")
    db.commit()
    return _warehouse_out(db, wh)


@warehouses_router.put("/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(warehouse_id: str, payload: WarehouseIn, user: User = Depends(require_write), db: Session = Depends(get_db)):
    wh = get_or_404(db, Warehouse, warehouse_id, user.organization_id, "Warehouse")
    if not payload.is_active and (wh.is_default or payload.is_default):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The default warehouse cannot be deactivated; make another one the default first")
    wh.name, wh.code, wh.address, wh.is_active = payload.name, payload.code, payload.address, payload.is_active
    if payload.is_default:
        _make_default(db, wh)
    audit.record(db, user, "update", "warehouse", wh.id, f"Updated warehouse {wh.name}")
    db.commit()
    return _warehouse_out(db, wh)


@warehouses_router.delete("/{warehouse_id}", response_model=Message)
def delete_warehouse(warehouse_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    wh = get_or_404(db, Warehouse, warehouse_id, user.organization_id, "Warehouse")
    if wh.is_default:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The default warehouse cannot be deleted")
    used = db.execute(select(func.count()).select_from(StockMovement).where(StockMovement.warehouse_id == wh.id)).scalar_one()
    if used:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Stock has moved through this warehouse; deactivate it instead")
    db.execute(ItemStock.__table__.delete().where(ItemStock.warehouse_id == wh.id))
    name = wh.name
    db.delete(wh)
    audit.record(db, user, "delete", "warehouse", warehouse_id, f"Deleted warehouse {name}")
    db.commit()
    return Message(message=f"Warehouse {name} deleted")


# --------------------------------------------------------------------------- #
# Transfer orders
# --------------------------------------------------------------------------- #
class TransferLineIn(APIModel):
    item_id: str
    quantity: Decimal = Field(gt=0, le=MAX_QUANTITY)
    batch_number: Optional[str] = Field(default=None, max_length=60)


class TransferIn(APIModel):
    date: date
    from_warehouse_id: str
    to_warehouse_id: str
    notes: Optional[str] = None
    lines: List[TransferLineIn] = Field(min_length=1)
    status: Literal["draft", "transferred"] = "transferred"

    @model_validator(mode="after")
    def _different(self):
        if self.from_warehouse_id == self.to_warehouse_id:
            raise ValueError("Choose two different warehouses")
        return self


class TransferLineOut(APIModel):
    item_id: str
    item_name: str
    quantity: Decimal
    batch_number: Optional[str] = None


class TransferOut(APIModel):
    id: str
    transfer_number: str
    date: date
    from_warehouse_id: str
    from_warehouse_name: str
    to_warehouse_id: str
    to_warehouse_name: str
    status: str
    notes: Optional[str] = None
    lines: List[TransferLineOut]


def _transfer_out(db: Session, t: TransferOrder) -> TransferOut:
    src, dst = db.get(Warehouse, t.from_warehouse_id), db.get(Warehouse, t.to_warehouse_id)
    return TransferOut(
        id=t.id,
        transfer_number=t.transfer_number,
        date=t.date,
        from_warehouse_id=t.from_warehouse_id,
        from_warehouse_name=src.name if src else "",
        to_warehouse_id=t.to_warehouse_id,
        to_warehouse_name=dst.name if dst else "",
        status=t.status,
        notes=t.notes,
        lines=[
            TransferLineOut(item_id=ln.item_id, item_name=ln.item.name, quantity=ln.quantity, batch_number=ln.batch_number)
            for ln in t.lines
        ],
    )


def _transfer_stock(db: Session, t: TransferOrder, user: User, reverse: bool = False) -> None:
    src, dst = (t.to_warehouse_id, t.from_warehouse_id) if reverse else (t.from_warehouse_id, t.to_warehouse_id)
    label = f"{'Reversal of ' if reverse else ''}transfer {t.transfer_number}"
    for line in t.lines:
        item = line.item
        stock.record(
            db,
            item,
            -line.quantity,
            t.date,
            "transfer_order",
            t.id,
            label,
            user.id,
            warehouse_id=src,
            batch_number=line.batch_number,
            total_includes_delta=False,
        )
        stock.record(
            db,
            item,
            line.quantity,
            t.date,
            "transfer_order",
            t.id,
            label,
            user.id,
            warehouse_id=dst,
            batch_number=line.batch_number,
            total_includes_delta=False,
        )


def _load_transfer(db: Session, transfer_id: str, org_id: str) -> TransferOrder:
    t = db.execute(
        select(TransferOrder)
        .where(TransferOrder.id == transfer_id, TransferOrder.organization_id == org_id)
        .options(selectinload(TransferOrder.lines).selectinload(TransferOrderLine.item))
    ).scalar_one_or_none()
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transfer order not found")
    return t


@transfers_router.get("", response_model=Page[TransferOut])
def list_transfers(pagination: Pagination = Depends(), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = (
        select(TransferOrder)
        .where(TransferOrder.organization_id == user.organization_id)
        .options(selectinload(TransferOrder.lines).selectinload(TransferOrderLine.item))
    )
    rows, total = paginate(db, stmt.order_by(TransferOrder.date.desc(), TransferOrder.transfer_number.desc()), pagination)
    return Page(items=[_transfer_out(db, t) for t in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@transfers_router.post("", response_model=TransferOut, status_code=status.HTTP_201_CREATED)
def create_transfer(payload: TransferIn, user: User = Depends(require_write), db: Session = Depends(get_db)):
    org_id = user.organization_id
    stock.resolve_warehouse(db, org_id, payload.from_warehouse_id)
    stock.resolve_warehouse(db, org_id, payload.to_warehouse_id)
    t = TransferOrder(
        organization_id=org_id,
        transfer_number=numbering.next_number(db, org_id, "transfer_order"),
        date=payload.date,
        from_warehouse_id=payload.from_warehouse_id,
        to_warehouse_id=payload.to_warehouse_id,
        status="draft",
        notes=payload.notes,
        created_by=user.id,
    )
    for line in payload.lines:
        item = get_or_404(db, Item, line.item_id, org_id, "Item")
        if not item.track_inventory:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{item.name}' does not track stock")
        t.lines.append(
            TransferOrderLine(item_id=item.id, quantity=qty(line.quantity), batch_number=(line.batch_number or "").strip() or None)
        )
    db.add(t)
    db.flush()
    db.refresh(t)
    if payload.status == "transferred":
        _transfer_stock(db, t, user)
        t.status = "transferred"
    audit.record(db, user, "create", "transfer_order", t.id, f"Transfer {t.transfer_number} ({t.status})")
    db.commit()
    return _transfer_out(db, _load_transfer(db, t.id, org_id))


@transfers_router.post("/{transfer_id}/transfer", response_model=TransferOut)
def mark_transferred(transfer_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    t = _load_transfer(db, transfer_id, user.organization_id)
    if t.status != "draft":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only draft transfers can be carried out")
    _transfer_stock(db, t, user)
    t.status = "transferred"
    audit.record(db, user, "update", "transfer_order", t.id, f"Transfer {t.transfer_number} carried out")
    db.commit()
    return _transfer_out(db, t)


@transfers_router.delete("/{transfer_id}", response_model=Message)
def delete_transfer(transfer_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    t = _load_transfer(db, transfer_id, user.organization_id)
    if t.status == "transferred":
        _transfer_stock(db, t, user, reverse=True)
    number = t.transfer_number
    db.delete(t)
    audit.record(db, user, "delete", "transfer_order", transfer_id, f"Deleted transfer {number}")
    db.commit()
    return Message(message=f"Transfer {number} deleted")


# --------------------------------------------------------------------------- #
# Composite items and assembly
# --------------------------------------------------------------------------- #
class ComponentIn(APIModel):
    item_id: str
    quantity: Decimal = Field(gt=0, le=MAX_QUANTITY)


class ComponentOut(APIModel):
    item_id: str
    item_name: str
    sku: str
    quantity: Decimal
    unit_cost: Decimal
    stock_on_hand: Decimal


class AssemblyIn(APIModel):
    quantity: Decimal = Field(gt=0, le=MAX_QUANTITY)
    date: date
    warehouse_id: Optional[str] = None
    notes: Optional[str] = None


class AssemblyOut(APIModel):
    id: str
    assembly_number: str
    item_id: str
    item_name: str
    quantity: Decimal
    date: date
    warehouse_id: str
    unit_cost: Decimal
    notes: Optional[str] = None


def _components(db: Session, item: Item) -> List[CompositeComponent]:
    return list(
        db.execute(
            select(CompositeComponent)
            .where(CompositeComponent.composite_item_id == item.id)
            .options(selectinload(CompositeComponent.component))
        ).scalars()
    )


@composites_router.get("/{item_id}/components", response_model=List[ComponentOut])
def get_components(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = get_or_404(db, Item, item_id, user.organization_id, "Item")
    return [
        ComponentOut(
            item_id=c.component_item_id,
            item_name=c.component.name,
            sku=c.component.sku,
            quantity=c.quantity,
            unit_cost=c.component.cost_price,
            stock_on_hand=c.component.stock_on_hand,
        )
        for c in _components(db, item)
    ]


@composites_router.put("/{item_id}/components", response_model=List[ComponentOut])
def set_components(item_id: str, payload: List[ComponentIn], user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Replace the item's bill of materials."""
    org_id = user.organization_id
    item = get_or_404(db, Item, item_id, org_id, "Item")
    if not item.track_inventory:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A composite item must track stock")
    seen = set()
    for c in _components(db, item):
        db.delete(c)
    db.flush()
    for comp in payload:
        component = get_or_404(db, Item, comp.item_id, org_id, "Component")
        if component.id == item.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "An item cannot be a component of itself")
        if component.id in seen:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{component.name}' is listed twice")
        if not component.track_inventory:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Component '{component.name}' must track stock")
        seen.add(component.id)
        db.add(
            CompositeComponent(
                organization_id=org_id, composite_item_id=item.id, component_item_id=component.id, quantity=qty(comp.quantity)
            )
        )
    audit.record(db, user, "update", "item", item.id, f"Bill of materials for {item.name} set ({len(payload)} components)")
    db.commit()
    return get_components(item_id, user, db)


def _assembly_out(db: Session, a: Assembly) -> AssemblyOut:
    return AssemblyOut(
        id=a.id,
        assembly_number=a.assembly_number,
        item_id=a.item_id,
        item_name=a.item.name,
        quantity=a.quantity,
        date=a.date,
        warehouse_id=a.warehouse_id,
        unit_cost=a.unit_cost,
        notes=a.notes,
    )


@composites_router.get("/assemblies", response_model=List[AssemblyOut])
def list_assemblies(
    item_id: Optional[str] = Query(None, alias="itemId"), user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    stmt = select(Assembly).where(Assembly.organization_id == user.organization_id).options(selectinload(Assembly.item))
    if item_id:
        stmt = stmt.where(Assembly.item_id == item_id)
    return [
        _assembly_out(db, a) for a in db.execute(stmt.order_by(Assembly.date.desc(), Assembly.assembly_number.desc()).limit(200)).scalars()
    ]


@composites_router.post("/{item_id}/assemble", response_model=AssemblyOut, status_code=status.HTTP_201_CREATED)
def assemble(item_id: str, payload: AssemblyIn, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Build composite units: components leave stock, finished units enter it at the components' cost."""
    org_id = user.organization_id
    item = get_or_404(db, Item, item_id, org_id, "Item")
    components = _components(db, item)
    if not components:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Set the components of '{item.name}' before assembling it")
    wh = stock.resolve_warehouse(db, org_id, payload.warehouse_id)
    quantity = qty(payload.quantity)
    a = Assembly(
        organization_id=org_id,
        assembly_number=numbering.next_number(db, org_id, "assembly"),
        item_id=item.id,
        quantity=quantity,
        date=payload.date,
        warehouse_id=wh.id,
        notes=payload.notes,
        created_by=user.id,
    )
    db.add(a)
    db.flush()
    unit_cost = money(sum((money(c.component.cost_price) * c.quantity for c in components), Decimal("0")))
    for c in components:
        inventory.adjust_stock(
            db,
            c.component,
            -(c.quantity * quantity),
            payload.date,
            "assembly",
            a.id,
            f"Used in {a.assembly_number}",
            user.id,
            rate=Decimal("0"),
            warehouse_id=wh.id,
        )
    on_hand = qty(item.stock_on_hand)
    inventory.adjust_stock(
        db, item, quantity, payload.date, "assembly", a.id, f"Assembled {a.assembly_number}", user.id, rate=Decimal("0"), warehouse_id=wh.id
    )
    # Weighted average, as receiving stock on a bill does.
    if unit_cost > 0:
        item.cost_price = (
            money((on_hand * money(item.cost_price) + quantity * unit_cost) / (on_hand + quantity)) if on_hand > 0 else unit_cost
        )
    a.unit_cost = unit_cost
    audit.record(db, user, "create", "assembly", a.id, f"Assembled {quantity} x {item.name} ({a.assembly_number})")
    db.commit()
    db.refresh(a)
    return _assembly_out(db, a)


@composites_router.delete("/assemblies/{assembly_id}", response_model=Message)
def undo_assembly(assembly_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    a = get_or_404(db, Assembly, assembly_id, user.organization_id, "Assembly")
    item = a.item
    for c in _components(db, item):
        inventory.adjust_stock(
            db,
            c.component,
            c.quantity * a.quantity,
            date.today(),
            "assembly",
            a.id,
            f"Undo {a.assembly_number}",
            user.id,
            rate=Decimal("0"),
            warehouse_id=a.warehouse_id,
        )
    inventory.adjust_stock(
        db,
        item,
        -a.quantity,
        date.today(),
        "assembly",
        a.id,
        f"Undo {a.assembly_number}",
        user.id,
        rate=Decimal("0"),
        warehouse_id=a.warehouse_id,
    )
    number = a.assembly_number
    db.delete(a)
    audit.record(db, user, "delete", "assembly", assembly_id, f"Undid assembly {number}")
    db.commit()
    return Message(message=f"Assembly {number} undone")


# --------------------------------------------------------------------------- #
# Price lists
# --------------------------------------------------------------------------- #
_ROUNDING = {"none": None, "whole": Decimal("1"), "nearest_10": Decimal("10"), "x99": "x99"}


class PriceListItemIn(APIModel):
    item_id: str
    rate: Decimal = Field(ge=0, le=MAX_MONEY)


class PriceListIn(APIModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["sales", "purchase"] = "sales"
    # markup: every item's price moved by a percentage; per_item: fixed rates.
    method: Literal["markup", "per_item"] = "markup"
    percentage: Decimal = Field(default=Decimal("0"), ge=-100, le=1000)
    rounding: Literal["none", "whole", "nearest_10", "x99"] = "none"
    description: Optional[str] = None
    is_active: bool = True
    items: List[PriceListItemIn] = []


class PriceListOut(APIModel):
    id: str
    name: str
    kind: str
    method: str
    percentage: Decimal
    rounding: str
    description: Optional[str] = None
    is_active: bool
    items: List[PriceListItemIn]


class PriceOut(APIModel):
    item_id: str
    base_rate: Decimal
    rate: Decimal


def _round(value: Decimal, rounding: str) -> Decimal:
    if rounding == "whole":
        return value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    if rounding == "nearest_10":
        return (value / 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 10
    if rounding == "x99":
        whole = value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        return max(Decimal("0"), whole - Decimal("0.01"))
    return money(value)


def price_for(pl: PriceList, item: Item, overrides: Dict[str, Decimal]) -> Decimal:
    base = money(item.selling_price if pl.kind == "sales" else item.cost_price)
    if pl.method == "per_item":
        return money(overrides.get(item.id, base))
    return money(_round(base * (Decimal("100") + pl.percentage) / Decimal("100"), pl.rounding))


def _pl_out(pl: PriceList) -> PriceListOut:
    return PriceListOut(
        id=pl.id,
        name=pl.name,
        kind=pl.kind,
        method=pl.method,
        percentage=pl.percentage,
        rounding=pl.rounding,
        description=pl.description,
        is_active=pl.is_active,
        items=[PriceListItemIn(item_id=i.item_id, rate=i.rate) for i in pl.items],
    )


def _load_pl(db: Session, pl_id: str, org_id: str) -> PriceList:
    pl = db.execute(
        select(PriceList).where(PriceList.id == pl_id, PriceList.organization_id == org_id).options(selectinload(PriceList.items))
    ).scalar_one_or_none()
    if pl is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Price list not found")
    return pl


def _apply_pl(db: Session, pl: PriceList, payload: PriceListIn, org_id: str) -> None:
    pl.name, pl.kind, pl.method, pl.percentage = payload.name, payload.kind, payload.method, payload.percentage
    pl.rounding, pl.description, pl.is_active = payload.rounding, payload.description, payload.is_active
    pl.items.clear()
    db.flush()
    for entry in payload.items if payload.method == "per_item" else []:
        get_or_404(db, Item, entry.item_id, org_id, "Item")
        pl.items.append(PriceListItem(item_id=entry.item_id, rate=money(entry.rate)))


@price_lists_router.get("", response_model=List[PriceListOut])
def list_price_lists(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(PriceList)
        .where(PriceList.organization_id == user.organization_id)
        .options(selectinload(PriceList.items))
        .order_by(PriceList.name)
    ).scalars()
    return [_pl_out(pl) for pl in rows]


@price_lists_router.post("", response_model=PriceListOut, status_code=status.HTTP_201_CREATED)
def create_price_list(payload: PriceListIn, user: User = Depends(require_write), db: Session = Depends(get_db)):
    pl = PriceList(organization_id=user.organization_id, name=payload.name, kind=payload.kind, method=payload.method)
    db.add(pl)
    _apply_pl(db, pl, payload, user.organization_id)
    db.flush()
    audit.record(db, user, "create", "price_list", pl.id, f"Created price list {pl.name}")
    db.commit()
    return _pl_out(_load_pl(db, pl.id, user.organization_id))


@price_lists_router.put("/{pl_id}", response_model=PriceListOut)
def update_price_list(pl_id: str, payload: PriceListIn, user: User = Depends(require_write), db: Session = Depends(get_db)):
    pl = _load_pl(db, pl_id, user.organization_id)
    _apply_pl(db, pl, payload, user.organization_id)
    audit.record(db, user, "update", "price_list", pl.id, f"Updated price list {pl.name}")
    db.commit()
    return _pl_out(_load_pl(db, pl.id, user.organization_id))


@price_lists_router.delete("/{pl_id}", response_model=Message)
def delete_price_list(pl_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    from backend.models import Contact

    pl = _load_pl(db, pl_id, user.organization_id)
    for contact in db.execute(select(Contact).where(Contact.price_list_id == pl.id)).scalars():
        contact.price_list_id = None
    name = pl.name
    db.delete(pl)
    audit.record(db, user, "delete", "price_list", pl_id, f"Deleted price list {name}")
    db.commit()
    return Message(message=f"Price list {name} deleted")


@price_lists_router.get("/{pl_id}/prices", response_model=List[PriceOut])
def prices(pl_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Every active item's price on this list (what a document line should charge)."""
    pl = _load_pl(db, pl_id, user.organization_id)
    overrides = {i.item_id: i.rate for i in pl.items}
    items = db.execute(select(Item).where(Item.organization_id == user.organization_id, Item.is_active.is_(True))).scalars()
    return [
        PriceOut(
            item_id=it.id, base_rate=money(it.selling_price if pl.kind == "sales" else it.cost_price), rate=price_for(pl, it, overrides)
        )
        for it in items
    ]


# --------------------------------------------------------------------------- #
# Stock reports
# --------------------------------------------------------------------------- #
class MovementOut(APIModel):
    id: str
    date: date
    item_id: str
    item_name: str
    warehouse_id: str
    warehouse_name: str
    quantity: Decimal
    unit_cost: Decimal
    batch_number: Optional[str] = None
    source_type: str
    source_id: Optional[str] = None
    description: str
    balance: Optional[Decimal] = None


class StockRow(APIModel):
    item_id: str
    item_name: str
    sku: str
    unit: str
    by_warehouse: Dict[str, float]
    total: Decimal
    unit_cost: Decimal
    value: Decimal
    reorder_level: Decimal
    below_reorder: bool


class StockSummary(APIModel):
    warehouses: List[WarehouseOut]
    rows: List[StockRow]
    total_value: Decimal


class BatchOut(APIModel):
    item_id: str
    item_name: str
    warehouse_id: str
    warehouse_name: str
    batch_number: str
    expiry_date: Optional[date] = None
    quantity: Decimal
    expired: bool


@stock_router.get("/movements", response_model=Page[MovementOut])
def movements(
    item_id: Optional[str] = Query(None, alias="itemId"),
    warehouse_id: Optional[str] = Query(None, alias="warehouseId"),
    start_date: Optional[date] = Query(None, alias="startDate"),
    end_date: Optional[date] = Query(None, alias="endDate"),
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The stock ledger: every movement, newest first. With one item, each row carries the running balance."""
    stmt = select(StockMovement).where(StockMovement.organization_id == user.organization_id)
    if item_id:
        stmt = stmt.where(StockMovement.item_id == item_id)
    if warehouse_id:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    if start_date:
        stmt = stmt.where(StockMovement.date >= start_date)
    if end_date:
        stmt = stmt.where(StockMovement.date <= end_date)
    rows, total = paginate(db, stmt.order_by(StockMovement.date.desc(), StockMovement.created_at.desc()), pagination)
    items = {i.id: i for i in db.execute(select(Item).where(Item.id.in_({r.item_id for r in rows}))).scalars()} if rows else {}
    whs = {w.id: w for w in db.execute(select(Warehouse).where(Warehouse.organization_id == user.organization_id)).scalars()}
    balances: Dict[str, Decimal] = {}
    if item_id and rows:
        # Running balance after each row, anchored on the stock held now (stock
        # that predates the movement log is included that way), less whatever
        # moved after the newest row on this page.
        newest = rows[0]
        if warehouse_id:
            now = stock.warehouse_quantity(db, item_id, warehouse_id)
        else:
            now = qty(db.execute(select(Item.stock_on_hand).where(Item.id == item_id)).scalar_one())
        later = select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
            StockMovement.item_id == item_id,
            (StockMovement.date > newest.date) | ((StockMovement.date == newest.date) & (StockMovement.created_at > newest.created_at)),
        )
        if warehouse_id:
            later = later.where(StockMovement.warehouse_id == warehouse_id)
        running = qty(now - qty(db.execute(later).scalar_one()))
        for r in rows:
            balances[r.id] = running
            running = qty(running - r.quantity)
    return Page(
        items=[
            MovementOut(
                id=r.id,
                date=r.date,
                item_id=r.item_id,
                item_name=items[r.item_id].name if r.item_id in items else "",
                warehouse_id=r.warehouse_id,
                warehouse_name=whs[r.warehouse_id].name if r.warehouse_id in whs else "",
                quantity=r.quantity,
                unit_cost=r.unit_cost,
                batch_number=r.batch_number,
                source_type=r.source_type,
                source_id=r.source_id,
                description=r.description,
                balance=balances.get(r.id),
            )
            for r in rows
        ],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@stock_router.get("/summary", response_model=StockSummary)
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Stock of every tracked item by warehouse, with value at average cost."""
    org_id = user.organization_id
    stock.default_warehouse(db, org_id)
    db.commit()
    whs = list(
        db.execute(
            select(Warehouse).where(Warehouse.organization_id == org_id).order_by(Warehouse.is_default.desc(), Warehouse.name)
        ).scalars()
    )
    default = next((w for w in whs if w.is_default), whs[0])
    per: Dict[str, Dict[str, Decimal]] = defaultdict(dict)
    for item_id, wh_id, quantity in db.execute(
        select(ItemStock.item_id, ItemStock.warehouse_id, ItemStock.quantity).where(ItemStock.organization_id == org_id)
    ):
        per[item_id][wh_id] = float(qty(quantity))
    rows: List[StockRow] = []
    total_value = Decimal("0")
    for item in db.execute(
        select(Item).where(Item.organization_id == org_id, Item.track_inventory.is_(True)).order_by(Item.name)
    ).scalars():
        by_wh = per.get(item.id) or {default.id: float(qty(item.stock_on_hand))}
        on_hand = qty(item.stock_on_hand)
        value = money(on_hand * money(item.cost_price))
        total_value += value
        rows.append(
            StockRow(
                item_id=item.id,
                item_name=item.name,
                sku=item.sku,
                unit=item.unit,
                by_warehouse=by_wh,
                total=on_hand,
                unit_cost=money(item.cost_price),
                value=value,
                reorder_level=item.reorder_level,
                below_reorder=item.reorder_level > 0 and on_hand <= item.reorder_level,
            )
        )
    return StockSummary(warehouses=[_warehouse_out(db, w) for w in whs], rows=rows, total_value=money(total_value))


@stock_router.get("/batches", response_model=List[BatchOut])
def batches(
    item_id: Optional[str] = Query(None, alias="itemId"),
    include_empty: bool = Query(False, alias="includeEmpty"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Batch balances, soonest expiry first (pick these first)."""
    stmt = select(StockBatch).where(StockBatch.organization_id == user.organization_id)
    if item_id:
        stmt = stmt.where(StockBatch.item_id == item_id)
    if not include_empty:
        stmt = stmt.where(StockBatch.quantity != 0)
    rows = list(db.execute(stmt.order_by(StockBatch.expiry_date.is_(None), StockBatch.expiry_date, StockBatch.batch_number)).scalars())
    items = {i.id: i for i in db.execute(select(Item).where(Item.id.in_({r.item_id for r in rows}))).scalars()} if rows else {}
    whs = {w.id: w for w in db.execute(select(Warehouse).where(Warehouse.organization_id == user.organization_id)).scalars()}
    today = date.today()
    return [
        BatchOut(
            item_id=r.item_id,
            item_name=items[r.item_id].name,
            warehouse_id=r.warehouse_id,
            warehouse_name=whs[r.warehouse_id].name,
            batch_number=r.batch_number,
            expiry_date=r.expiry_date,
            quantity=r.quantity,
            expired=bool(r.expiry_date and r.expiry_date < today),
        )
        for r in rows
    ]


# --------------------------------------------------------------------------- #
# Serial numbers
# --------------------------------------------------------------------------- #
class SerialOut(APIModel):
    id: str
    item_id: str
    item_name: str
    warehouse_id: str
    warehouse_name: str
    serial_number: str
    status: str
    last_source_type: Optional[str] = None
    last_source_id: Optional[str] = None


class SerialRegister(APIModel):
    item_id: str
    warehouse_id: Optional[str] = None
    serial_numbers: str = Field(min_length=1, max_length=20000)


@stock_router.get("/serials", response_model=List[SerialOut])
def serials(
    item_id: Optional[str] = Query(None, alias="itemId"),
    serial_status: Optional[Literal["in_stock", "out"]] = Query(None, alias="status"),
    search: Optional[str] = Query(None, max_length=80),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Serial-numbered units: where each one is, or which document it last moved on."""
    stmt = select(StockSerial).where(StockSerial.organization_id == user.organization_id)
    if item_id:
        stmt = stmt.where(StockSerial.item_id == item_id)
    if serial_status:
        stmt = stmt.where(StockSerial.status == serial_status)
    if search:
        stmt = stmt.where(StockSerial.serial_number.ilike(f"%{search.strip()}%"))
    rows = list(db.execute(stmt.order_by(StockSerial.serial_number).limit(1000)).scalars())
    items = {i.id: i for i in db.execute(select(Item).where(Item.id.in_({r.item_id for r in rows}))).scalars()} if rows else {}
    whs = {w.id: w for w in db.execute(select(Warehouse).where(Warehouse.organization_id == user.organization_id)).scalars()}
    return [
        SerialOut(
            id=r.id,
            item_id=r.item_id,
            item_name=items[r.item_id].name,
            warehouse_id=r.warehouse_id,
            warehouse_name=whs[r.warehouse_id].name,
            serial_number=r.serial_number,
            status=r.status,
            last_source_type=r.last_source_type,
            last_source_id=r.last_source_id,
        )
        for r in rows
    ]


@stock_router.post("/serials/register", response_model=Message)
def register_serials(payload: SerialRegister, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Name the units already on hand (opening stock, adjustments) without moving stock."""
    item = get_or_404(db, Item, payload.item_id, user.organization_id, "Item")
    if not item.track_serial:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{item.name}' is not tracked by serial number")
    wh = stock.resolve_warehouse(db, user.organization_id, payload.warehouse_id)
    numbers = stock.parse_serials(payload.serial_numbers)
    on_hand = stock.warehouse_quantity(db, item.id, wh.id)
    if (
        not db.execute(select(ItemStock.id).where(ItemStock.item_id == item.id)).first()
        and wh.id == stock.default_warehouse(db, user.organization_id).id
    ):
        on_hand = qty(item.stock_on_hand)  # stock from before warehouses sits in the default one
    free = on_hand - stock.serials_in_stock(db, item.id, wh.id)
    if len(numbers) > free:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Only {qty(max(free, Decimal('0')))} unit(s) of '{item.name}' at {wh.name} have no serial number yet; {len(numbers)} given",
        )
    stock.move_serials(db, item, wh, Decimal(len(numbers)), numbers, "serial_register", None)
    audit.record(db, user, "update", "item", item.id, f"Registered {len(numbers)} serial number(s) for {item.name}")
    db.commit()
    return Message(message=f"{len(numbers)} serial number(s) registered")
