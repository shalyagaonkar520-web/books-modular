from typing import List, Optional, Literal
from fastapi import APIRouter, HTTPException, Query, status
from backend.models import ItemCreate, ItemUpdate, ItemResponse
from backend import database

router = APIRouter(prefix="/api/items", tags=["Items"])


@router.get("", response_model=List[ItemResponse])
def get_items(
    search: Optional[str] = Query(None, description="Search query matching name, sku, type, or description"),
    type_filter: str = Query("all", description="Filter by item type: all | goods | service"),
    inventory_filter: str = Query("all", description="Filter by inventory tracking: all | tracked | non-tracked"),
    sort_by: str = Query("createdAt", description="Sort field: name | sku | sellingPrice | costPrice | createdAt"),
    sort_order: str = Query("desc", description="Sort order: asc | desc")
):
    items = database.get_all_items()

    # 1. Search filter
    if search and search.strip():
        q = search.lower().strip()
        items = [
            item for item in items
            if q in item["name"].lower()
            or q in item["sku"].lower()
            or q in item["type"].lower()
            or (item.get("description") and q in item["description"].lower())
        ]

    # 2. Type filter
    if type_filter in ["goods", "service"]:
        items = [item for item in items if item["type"] == type_filter]

    # 3. Inventory filter
    if inventory_filter == "tracked":
        items = [
            item for item in items
            if item["type"] == "goods" and item.get("inventoryInfo") and item["inventoryInfo"].get("trackInventory")
        ]
    elif inventory_filter == "non-tracked":
        items = [
            item for item in items
            if item["type"] == "service" or not (item.get("inventoryInfo") and item["inventoryInfo"].get("trackInventory"))
        ]

    # 4. Sorting
    def get_sort_key(item):
        if sort_by == "name":
            return item["name"].lower()
        elif sort_by == "sku":
            return item["sku"].lower()
        elif sort_by == "sellingPrice":
            return item.get("salesInfo", {}).get("sellingPrice", 0)
        elif sort_by == "costPrice":
            return item.get("purchaseInfo", {}).get("costPrice", 0)
        elif sort_by == "createdAt":
            return item.get("createdAt", "")
        return item.get("createdAt", "")

    reverse = (sort_order.lower() == "desc")
    items.sort(key=get_sort_key, reverse=reverse)

    return items


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(item_id: str):
    item = database.get_item_by_id(item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Item with ID '{item_id}' not found")
    return item


@router.post("", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate):
    # Validate SKU uniqueness
    existing_sku = database.get_item_by_sku(payload.sku)
    if existing_sku:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An item with SKU '{payload.sku}' already exists. Please use a unique SKU."
        )

    # Validate prices
    if payload.sales_info.selling_price < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selling price cannot be negative."
        )
    if payload.purchase_info.cost_price < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cost price cannot be negative."
        )

    item_dict = payload.model_dump(by_alias=True)
    created = database.create_item(item_dict)
    return created


@router.put("/{item_id}", response_model=ItemResponse)
def update_item(item_id: str, payload: ItemUpdate):
    existing = database.get_item_by_id(item_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Item with ID '{item_id}' not found")

    # If SKU is updated, ensure uniqueness
    if payload.sku and payload.sku != existing["sku"]:
        sku_check = database.get_item_by_sku(payload.sku)
        if sku_check and sku_check["id"] != item_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An item with SKU '{payload.sku}' already exists."
            )

    # Validate prices if provided
    if payload.sales_info and payload.sales_info.selling_price < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selling price cannot be negative.")
    if payload.purchase_info and payload.purchase_info.cost_price < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cost price cannot be negative.")

    updates = payload.model_dump(by_alias=True, exclude_unset=True)
    updated = database.update_item(item_id, updates)
    return updated


@router.delete("/{item_id}")
def delete_item(item_id: str):
    success = database.delete_item(item_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Item with ID '{item_id}' not found")
    return {"success": True, "message": f"Item '{item_id}' deleted successfully"}


@router.post("/reset", response_model=List[ItemResponse])
def reset_items():
    return database.reset_seed_data()
