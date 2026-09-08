from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import Field, model_validator

from backend.schemas.common import APIModel

ItemType = Literal["goods", "service"]


class ItemBase(APIModel):
    name: str = Field(min_length=1, max_length=200)
    type: ItemType = "goods"
    sku: str = Field(min_length=1, max_length=50)
    unit: str = Field(default="pcs", max_length=20)
    hsn_sac: Optional[str] = Field(default=None, max_length=20)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    selling_price: Decimal = Field(default=Decimal("0"), ge=0)
    sales_account_id: Optional[str] = None
    sales_description: Optional[str] = None
    cost_price: Decimal = Field(default=Decimal("0"), ge=0)
    purchase_account_id: Optional[str] = None
    purchase_description: Optional[str] = None
    preferred_vendor_id: Optional[str] = None
    track_inventory: bool = False
    opening_stock: Decimal = Field(default=Decimal("0"), ge=0)
    opening_stock_rate: Decimal = Field(default=Decimal("0"), ge=0)
    reorder_level: Decimal = Field(default=Decimal("0"), ge=0)
    warehouse_location: Optional[str] = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def _service_has_no_inventory(self):
        if self.type == "service":
            self.track_inventory = False
            self.opening_stock = Decimal("0")
            self.opening_stock_rate = Decimal("0")
            self.reorder_level = Decimal("0")
        self.sku = self.sku.upper()
        return self


class ItemCreate(ItemBase):
    pass


class ItemUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    type: Optional[ItemType] = None
    sku: Optional[str] = Field(default=None, min_length=1, max_length=50)
    unit: Optional[str] = Field(default=None, max_length=20)
    hsn_sac: Optional[str] = None
    tax_rate: Optional[Decimal] = Field(default=None, ge=0, le=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    selling_price: Optional[Decimal] = Field(default=None, ge=0)
    sales_account_id: Optional[str] = None
    sales_description: Optional[str] = None
    cost_price: Optional[Decimal] = Field(default=None, ge=0)
    purchase_account_id: Optional[str] = None
    purchase_description: Optional[str] = None
    preferred_vendor_id: Optional[str] = None
    track_inventory: Optional[bool] = None
    opening_stock: Optional[Decimal] = Field(default=None, ge=0)
    opening_stock_rate: Optional[Decimal] = Field(default=None, ge=0)
    reorder_level: Optional[Decimal] = Field(default=None, ge=0)
    warehouse_location: Optional[str] = None
    is_active: Optional[bool] = None


class ItemOut(ItemBase):
    id: str
    is_active: bool
    stock_on_hand: Decimal
    sales_account_name: Optional[str] = None
    purchase_account_name: Optional[str] = None
    preferred_vendor_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class InventoryAdjustmentCreate(APIModel):
    item_id: str
    date: date
    quantity_delta: Decimal
    reason: str = Field(min_length=1, max_length=120)
    notes: Optional[str] = None


class InventoryAdjustmentOut(APIModel):
    id: str
    adjustment_number: str
    item_id: str
    item_name: str
    date: date
    quantity_delta: Decimal
    reason: str
    notes: Optional[str] = None
    created_at: datetime


from datetime import date  # noqa: E402  (forward reference for annotations above)

InventoryAdjustmentCreate.model_rebuild()
InventoryAdjustmentOut.model_rebuild()
