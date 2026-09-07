from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

ItemType = Literal['goods', 'service']
CashFlowPeriod = Literal['this_fiscal_year', 'this_month', 'last_month', 'this_quarter']


class SalesInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    selling_price: float = Field(default=0.0, alias='sellingPrice')
    sales_account: str = Field(default='Sales - General', alias='salesAccount')
    description: Optional[str] = None


class PurchaseInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    cost_price: float = Field(default=0.0, alias='costPrice')
    cost_account: str = Field(default='Cost of Goods Sold', alias='costAccount')
    description: Optional[str] = None
    preferred_vendor: Optional[str] = Field(default=None, alias='preferredVendor')


class InventoryInfo(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    track_inventory: bool = Field(default=True, alias='trackInventory')
    opening_stock: float = Field(default=0.0, alias='openingStock')
    opening_stock_rate: float = Field(default=0.0, alias='openingStockRate')
    reorder_level: float = Field(default=0.0, alias='reorderLevel')
    warehouse_location: Optional[str] = Field(default=None, alias='warehouseLocation')


class ItemBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=200)
    type: ItemType = 'goods'
    sku: str = Field(..., min_length=1, max_length=50)
    unit: str = Field(default='pcs', max_length=20)
    description: Optional[str] = None
    image_url: Optional[str] = Field(default=None, alias='imageUrl')
    sales_info: SalesInfo = Field(default_factory=SalesInfo, alias='salesInfo')
    purchase_info: PurchaseInfo = Field(default_factory=PurchaseInfo, alias='purchaseInfo')
    inventory_info: Optional[InventoryInfo] = Field(default=None, alias='inventoryInfo')


class ItemCreate(ItemBase):
    pass


class ItemUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = None
    type: Optional[ItemType] = None
    sku: Optional[str] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = Field(default=None, alias='imageUrl')
    sales_info: Optional[SalesInfo] = Field(default=None, alias='salesInfo')
    purchase_info: Optional[PurchaseInfo] = Field(default=None, alias='purchaseInfo')
    inventory_info: Optional[InventoryInfo] = Field(default=None, alias='inventoryInfo')


class ItemResponse(ItemBase):
    id: str
    created_at: str = Field(..., alias='createdAt')
    updated_at: str = Field(..., alias='updatedAt')


# Dashboard Models
class ReceivablesSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_unpaid_invoices: int = Field(alias='totalUnpaidInvoices')
    current_amount: float = Field(alias='currentAmount')
    overdue_amount: float = Field(alias='overdueAmount')
    total_receivables: float = Field(alias='totalReceivables')


class PayablesSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_unpaid_bills: int = Field(alias='totalUnpaidBills')
    current_amount: float = Field(alias='currentAmount')
    overdue_amount: float = Field(alias='overdueAmount')
    total_payables: float = Field(alias='totalPayables')


class MonthlyBreakdown(BaseModel):
    month: str
    incoming: float
    outgoing: float


class CashFlowSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    opening_balance: float = Field(alias='openingBalance')
    incoming_amount: float = Field(alias='incomingAmount')
    outgoing_amount: float = Field(alias='outgoingAmount')
    net_cash_flow: float = Field(alias='netCashFlow')
    monthly_breakdown: List[MonthlyBreakdown] = Field(alias='monthlyBreakdown')


class InventorySummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_items_count: int = Field(alias='totalItemsCount')
    goods_count: int = Field(alias='goodsCount')
    service_count: int = Field(alias='serviceCount')
    tracked_count: int = Field(alias='trackedCount')
    total_inventory_valuation: float = Field(alias='totalInventoryValuation')
    low_stock_items_count: int = Field(alias='lowStockItemsCount')


class DashboardSummaryResponse(BaseModel):
    receivables: ReceivablesSummary
    payables: PayablesSummary
    cash_flow: CashFlowSummary = Field(alias='cashFlow')
    inventory: InventorySummary


# Authentication Models
class UserLoginRequest(BaseModel):
    email: str
    password: str


class UserRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str
    password: str = Field(..., min_length=6)
    organization: Optional[str] = "Zylker Electronics India Pvt Ltd"
    role: Optional[str] = "Administrator"


class UserProfile(BaseModel):
    id: str
    name: str
    email: str
    role: str
    organization: str
    avatar: Optional[str] = None


class AuthResponse(BaseModel):
    user: UserProfile
    token: str
    message: str
