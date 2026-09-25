from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import Field, ValidationInfo, field_validator, model_validator
from pydantic.alias_generators import to_camel

from backend.schemas import validators
from backend.schemas.common import MAX_QUANTITY, APIModel

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
    selling_price: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("999999999.99"))
    sales_account_id: Optional[str] = None
    sales_description: Optional[str] = None
    cost_price: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("999999999.99"))
    purchase_account_id: Optional[str] = None
    purchase_description: Optional[str] = None
    preferred_vendor_id: Optional[str] = None
    track_inventory: bool = False
    opening_stock: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("99999999"))
    opening_stock_rate: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("999999999.99"))
    reorder_level: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("99999999"))
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
    # An entry rule, so it sits here rather than on ItemBase: ItemOut extends
    # ItemBase too, and a legacy row must still be readable.
    @field_validator("image_url")
    @classmethod
    def _image_url(cls, value: Optional[str]) -> Optional[str]:
        return validators.image_url(value)


class ItemUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    type: Optional[ItemType] = None
    sku: Optional[str] = Field(default=None, min_length=1, max_length=50)
    unit: Optional[str] = Field(default=None, max_length=20)
    hsn_sac: Optional[str] = Field(default=None, max_length=20)
    tax_rate: Optional[Decimal] = Field(default=None, ge=0, le=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    selling_price: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("999999999.99"))
    sales_account_id: Optional[str] = None
    sales_description: Optional[str] = None
    cost_price: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("999999999.99"))
    purchase_account_id: Optional[str] = None
    purchase_description: Optional[str] = None
    preferred_vendor_id: Optional[str] = None
    track_inventory: Optional[bool] = None
    opening_stock: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("99999999"))
    opening_stock_rate: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("999999999.99"))
    reorder_level: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("99999999"))
    warehouse_location: Optional[str] = Field(default=None, max_length=120)
    is_active: Optional[bool] = None

    @field_validator(
        "name",
        "type",
        "sku",
        "unit",
        "tax_rate",
        "selling_price",
        "cost_price",
        "track_inventory",
        "opening_stock",
        "opening_stock_rate",
        "reorder_level",
        "is_active",
    )
    @classmethod
    def _required_columns_not_null(cls, value, info: ValidationInfo):
        # Omitting a field keeps it; null is not a value these columns can hold.
        return validators.not_null(value, to_camel(info.field_name))

    @field_validator("image_url")
    @classmethod
    def _image_url(cls, value: Optional[str]) -> Optional[str]:
        return validators.image_url(value)


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
    # Same cap as a document line: beyond it the Numeric(14, 3) stock column
    # overflows and the database driver answers with a 500.
    quantity_delta: Decimal = Field(ge=-MAX_QUANTITY, le=MAX_QUANTITY)
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
