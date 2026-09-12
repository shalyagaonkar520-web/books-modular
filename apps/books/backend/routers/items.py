"""Items catalogue and inventory adjustments."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Account, BillLine, Contact, InventoryAdjustment, InvoiceLine, Item, User
from backend.schemas.common import Message, Page
from backend.schemas.items import (
    InventoryAdjustmentCreate,
    InventoryAdjustmentOut,
    ItemCreate,
    ItemOut,
    ItemUpdate,
)
from backend.services import audit, inventory, ledger, numbering
from backend.services.money import money, qty
from backend.services.tenancy import Pagination, get_or_404, paginate

router = APIRouter(prefix="/api/items", tags=["Items"])

SORT_FIELDS = {
    "name": Item.name,
    "sku": Item.sku,
    "sellingPrice": Item.selling_price,
    "costPrice": Item.cost_price,
    "createdAt": Item.created_at,
    "stockOnHand": Item.stock_on_hand,
    "reorderLevel": Item.reorder_level,
}


def to_out(item: Item) -> ItemOut:
    data = ItemOut.model_validate(item)
    data.sales_account_name = item.sales_account.name if item.sales_account else None
    data.purchase_account_name = item.purchase_account.name if item.purchase_account else None
    data.preferred_vendor_name = item.preferred_vendor.display_name if item.preferred_vendor else None
    return data


def _validate_refs(db: Session, org_id: str, data: dict) -> None:
    for key, label in (("sales_account_id", "Sales account"), ("purchase_account_id", "Purchase account")):
        if data.get(key):
            get_or_404(db, Account, data[key], org_id, label)
    if data.get("preferred_vendor_id"):
        vendor = get_or_404(db, Contact, data["preferred_vendor_id"], org_id, "Vendor")
        if vendor.type != "vendor":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Preferred vendor must be a vendor contact")


def _sku_taken(db: Session, org_id: str, sku: str, exclude_id: Optional[str] = None) -> bool:
    stmt = select(Item.id).where(Item.organization_id == org_id, func.upper(Item.sku) == sku.upper())
    if exclude_id:
        stmt = stmt.where(Item.id != exclude_id)
    return db.execute(stmt).first() is not None


@router.get("", response_model=Page[ItemOut])
def list_items(
    search: Optional[str] = Query(None),
    type_filter: str = Query("all", pattern="^(all|goods|service)$"),
    inventory_filter: str = Query("all", pattern="^(all|tracked|non-tracked|low-stock)$"),
    include_inactive: bool = False,
    sort_by: str = Query("createdAt"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Item).where(Item.organization_id == user.organization_id).options(
        selectinload(Item.sales_account), selectinload(Item.purchase_account), selectinload(Item.preferred_vendor)
    )
    if not include_inactive:
        stmt = stmt.where(Item.is_active.is_(True))
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(Item.name).like(q), func.lower(Item.sku).like(q), func.lower(Item.description).like(q), func.lower(Item.hsn_sac).like(q)))
    if type_filter in ("goods", "service"):
        stmt = stmt.where(Item.type == type_filter)
    if inventory_filter == "tracked":
        stmt = stmt.where(Item.track_inventory.is_(True))
    elif inventory_filter == "non-tracked":
        stmt = stmt.where(Item.track_inventory.is_(False))
    elif inventory_filter == "low-stock":
        stmt = stmt.where(Item.track_inventory.is_(True), Item.stock_on_hand <= Item.reorder_level)
    column = SORT_FIELDS.get(sort_by, Item.created_at)
    stmt = stmt.order_by(column.desc() if sort_order == "desc" else column.asc(), Item.id)
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[to_out(i) for i in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/{item_id}", response_model=ItemOut)
def get_item(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return to_out(get_or_404(db, Item, item_id, user.organization_id, "Item"))


@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    data = payload.model_dump()
    if _sku_taken(db, user.organization_id, data["sku"]):
        raise HTTPException(status.HTTP_409_CONFLICT, f"An item with SKU '{data['sku']}' already exists")
    _validate_refs(db, user.organization_id, data)
    item = Item(organization_id=user.organization_id, **data)
    item.stock_on_hand = item.opening_stock if item.track_inventory else Decimal("0")
    db.add(item)
    db.flush()
    inventory.post_opening_stock(db, item, user.id)
    audit.record(db, user, "create", "item", item.id, f"Created item {item.name} ({item.sku})")
    db.commit()
    db.refresh(item)
    return to_out(item)


@router.put("/{item_id}", response_model=ItemOut)
def update_item(item_id: str, payload: ItemUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    item = get_or_404(db, Item, item_id, user.organization_id, "Item")
    data = payload.model_dump(exclude_unset=True)
    if "sku" in data:
        data["sku"] = data["sku"].upper()
        if _sku_taken(db, user.organization_id, data["sku"], exclude_id=item.id):
            raise HTTPException(status.HTTP_409_CONFLICT, f"An item with SKU '{data['sku']}' already exists")
    _validate_refs(db, user.organization_id, data)

    new_type = data.get("type", item.type)
    if new_type == "service":
        data.update({"track_inventory": False, "opening_stock": Decimal("0"), "opening_stock_rate": Decimal("0"), "reorder_level": Decimal("0")})

    was_tracked = item.track_inventory
    old_opening = qty(item.opening_stock)
    old_rate = money(item.opening_stock_rate or item.cost_price)

    for field, value in data.items():
        setattr(item, field, value)

    # Reconcile inventory when tracking toggles or opening stock changes.
    if item.track_inventory and not was_tracked:
        item.stock_on_hand = qty(item.opening_stock)
        inventory.post_opening_stock(db, item, user.id)
    elif not item.track_inventory and was_tracked:
        ledger.reverse_entries_for_source(db, user.organization_id, "item_opening", item.id, date.today(), user.id, "Inventory tracking disabled")
        item.stock_on_hand = Decimal("0")
    elif item.track_inventory and (qty(item.opening_stock) != old_opening or money(item.opening_stock_rate or item.cost_price) != old_rate):
        delta_qty = qty(item.opening_stock) - old_opening
        item.stock_on_hand = qty(item.stock_on_hand) + delta_qty
        ledger.reverse_entries_for_source(db, user.organization_id, "item_opening", item.id, date.today(), user.id, "Opening stock changed")
        inventory.post_opening_stock(db, item, user.id)

    audit.record(db, user, "update", "item", item.id, f"Updated item {item.name}")
    db.commit()
    db.refresh(item)
    return to_out(item)


@router.delete("/{item_id}", response_model=Message)
def delete_item(item_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    item = get_or_404(db, Item, item_id, user.organization_id, "Item")
    used = db.execute(select(InvoiceLine.id).where(InvoiceLine.item_id == item.id).limit(1)).first() or db.execute(
        select(BillLine.id).where(BillLine.item_id == item.id).limit(1)
    ).first()
    if used:
        item.is_active = False
        audit.record(db, user, "update", "item", item.id, f"Deactivated item {item.name} (used in transactions)")
        db.commit()
        return Message(message="Item is used in transactions and has been marked inactive instead of deleted")
    ledger.reverse_entries_for_source(db, user.organization_id, "item_opening", item.id, date.today(), user.id, "Item deleted")
    db.delete(item)
    audit.record(db, user, "delete", "item", item.id, f"Deleted item {item.name}")
    db.commit()
    return Message(message="Item deleted")


# --------------------------------------------------------------------------- #
# Inventory adjustments
# --------------------------------------------------------------------------- #
adjustments_router = APIRouter(prefix="/api/inventory-adjustments", tags=["Items"])


def adj_out(adj: InventoryAdjustment) -> InventoryAdjustmentOut:
    return InventoryAdjustmentOut(
        id=adj.id,
        adjustment_number=adj.adjustment_number,
        item_id=adj.item_id,
        item_name=adj.item.name,
        date=adj.date,
        quantity_delta=adj.quantity_delta,
        reason=adj.reason,
        notes=adj.notes,
        created_at=adj.created_at,
    )


@adjustments_router.get("", response_model=Page[InventoryAdjustmentOut])
def list_adjustments(
    item_id: Optional[str] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(InventoryAdjustment).where(InventoryAdjustment.organization_id == user.organization_id).options(selectinload(InventoryAdjustment.item))
    if item_id:
        stmt = stmt.where(InventoryAdjustment.item_id == item_id)
    stmt = stmt.order_by(InventoryAdjustment.date.desc(), InventoryAdjustment.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[adj_out(a) for a in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@adjustments_router.post("", response_model=InventoryAdjustmentOut, status_code=status.HTTP_201_CREATED)
def create_adjustment(payload: InventoryAdjustmentCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    item = get_or_404(db, Item, payload.item_id, user.organization_id, "Item")
    if not item.track_inventory:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Inventory is not tracked for this item")
    if qty(payload.quantity_delta) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Quantity change cannot be zero")
    adj = InventoryAdjustment(
        organization_id=user.organization_id,
        adjustment_number=numbering.next_number(db, user.organization_id, "inventory_adjustment"),
        item_id=item.id,
        date=payload.date,
        quantity_delta=qty(payload.quantity_delta),
        reason=payload.reason,
        notes=payload.notes,
        created_by=user.id,
    )
    db.add(adj)
    db.flush()
    inventory.adjust_stock(db, item, adj.quantity_delta, adj.date, "inventory_adjustment", adj.id, f"{adj.reason} ({adj.adjustment_number})", user.id)
    audit.record(db, user, "create", "inventory_adjustment", adj.id, f"{adj.adjustment_number}: {item.name} {adj.quantity_delta:+}")
    db.commit()
    db.refresh(adj)
    return adj_out(adj)

