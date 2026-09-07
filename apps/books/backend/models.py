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
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    email: str
    role: str
    organization: str
    avatar: Optional[str] = None
    auth_provider: Optional[str] = Field(default="local", alias="authProvider")


class OAuthLoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    provider: Literal['google', 'microsoft', 'zoho', 'github']
    code: Optional[str] = None
    access_token: Optional[str] = Field(default=None, alias='accessToken')
    email: Optional[str] = None
    name: Optional[str] = None
    avatar: Optional[str] = None
    organization: Optional[str] = "Zylker Electronics India Pvt Ltd"
    role: Optional[str] = "Administrator"


class OAuthProviderInfo(BaseModel):
    id: str
    name: str
    icon: str
    status: str = "Active"
    description: str


class AuthResponse(BaseModel):
    user: UserProfile
    token: str
    message: str


# Invoice Models
class InvoiceLineItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    hsn: str = "8471"
    quantity: float = 1.0
    rate: float = 0.0
    discount: float = 0.0
    tax_rate: float = Field(default=18.0, alias="taxRate")
    amount: float = 0.0


class InvoiceCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    client: str
    client_email: Optional[str] = Field(default="", alias="clientEmail")
    client_gstin: Optional[str] = Field(default="29AABCU9603R1ZM", alias="clientGstin")
    date: str
    due: str
    items: List[InvoiceLineItem] = []
    amount: Optional[float] = None
    status: str = "Sent"
    notes: Optional[str] = "Thank you for your business. Please remit payment via NEFT/RTGS."


class InvoiceUpdateStatus(BaseModel):
    status: Literal['Paid', 'Sent', 'Overdue', 'Draft']


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    client: str
    client_email: Optional[str] = Field(default="", alias="clientEmail")
    client_gstin: Optional[str] = Field(default="29AABCU9603R1ZM", alias="clientGstin")
    date: str
    due: str
    subtotal: float
    tax_amount: float = Field(alias="taxAmount")
    amount: float
    status: str
    items: List[InvoiceLineItem] = []
    notes: Optional[str] = None
    created_at: str = Field(alias="createdAt")


# Document Models
class DocumentCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str
    category: str
    uploaded_by: Optional[str] = Field(default="Shalya Gaonkar", alias="uploadedBy")
    size: Optional[str] = "1.2 MB"
    verified: bool = True
    notes: Optional[str] = None


class DocumentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    category: str
    uploaded_by: str = Field(alias="uploadedBy")
    date: str
    size: str
    verified: bool
    checksum: str
    notes: Optional[str] = None


# Payroll Models
class PayrollEmployeeCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str
    designation: str
    department: str
    gross: float
    bank_acc: Optional[str] = Field(default="••••••••5812", alias="bankAcc")
    pan: Optional[str] = "ABCDE1234F"
    uan: Optional[str] = "101294819201"


class PayrollEmployeeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    designation: str
    department: str
    gross: float
    deductions: float
    net: float
    bank_acc: str = Field(alias="bankAcc")
    pan: str
    uan: str
    status: str
    last_pay_date: str = Field(alias="lastPayDate")


class PayslipResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    employee_id: str = Field(alias="employeeId")
    name: str
    designation: str
    department: str
    month: str
    gross: float
    basic: float
    hra: float
    special_allowance: float = Field(alias="specialAllowance")
    pf: float
    pt: float
    tds: float
    total_deductions: float = Field(alias="totalDeductions")
    net: float
    net_in_words: str = Field(alias="netInWords")
    bank_acc: str = Field(alias="bankAcc")
    pan: str
    uan: str
    status: str

