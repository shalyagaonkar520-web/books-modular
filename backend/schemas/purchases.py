from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import Field, field_validator, model_validator

from backend.schemas.common import MAX_MONEY, APIModel
from backend.schemas.sales import LineInput, LineOut, PaymentMode, validate_state

BillStatus = Literal["draft", "open", "partially_paid", "paid", "void", "overdue"]
# An expense is always paid out of a bank/cash/card account the moment it is
# recorded (it posts the withdrawal), so "paid" is its only honest status -
# money owed but not yet paid belongs on a bill. Free text here previously let
# an "unpaid" expense still debit the bank.
ExpenseStatus = Literal["paid"]
# The payment modes used elsewhere, plus "razorpay" for gateway fees the
# Razorpay sync books as expenses.
ExpensePaymentMethod = Literal["cash", "bank_transfer", "upi", "cheque", "card", "other", "razorpay"]


class BillCreate(APIModel):
    vendor_id: str
    vendor_bill_number: Optional[str] = Field(default=None, max_length=60)
    order_number: Optional[str] = Field(default=None, max_length=120)
    subject: Optional[str] = Field(default=None, max_length=250)
    date: date
    due_date: Optional[date] = None
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0, le=MAX_MONEY)
    notes: Optional[str] = None
    lines: List[LineInput] = Field(min_length=1)
    status: Literal["draft", "open"] = "open"
    place_of_supply: Optional[str] = Field(default=None, max_length=2)
    # GST payable by us instead of the vendor (section 9(3)/9(4)).
    reverse_charge: bool = False
    # TDS withheld from the vendor: Income-tax section (194C, 194J ...) and rate.
    tds_section: Optional[str] = Field(default=None, max_length=20)
    tds_rate: Decimal = Field(default=Decimal("0"), ge=0, le=30)
    exchange_rate: Optional[Decimal] = Field(default=None, gt=0, le=Decimal("1000000"))
    # Warehouse goods are received into; null = the default warehouse.
    warehouse_id: Optional[str] = None
    branch_id: Optional[str] = None
    # Project the cost is charged to (project profitability).
    project_id: Optional[str] = None

    @model_validator(mode="after")
    def _due_after_date(self):
        if self.due_date and self.due_date < self.date:
            raise ValueError("Due date cannot be before the bill date")
        if self.tds_rate > 0 and not self.tds_section:
            raise ValueError("Choose the TDS section for the rate deducted")
        return self

    @field_validator("place_of_supply")
    @classmethod
    def _state(cls, value: Optional[str]) -> Optional[str]:
        return validate_state(value)


class BillUpdate(BillCreate):
    pass


class BillOut(APIModel):
    id: str
    bill_number: str
    vendor_bill_number: Optional[str] = None
    order_number: Optional[str] = None
    subject: Optional[str] = None
    vendor_id: str
    vendor_name: str
    date: date
    due_date: date
    status: str
    subtotal: Decimal
    discount_amount: Decimal
    tax_total: Decimal
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    notes: Optional[str] = None
    lines: List[LineOut] = []
    place_of_supply: Optional[str] = None
    reverse_charge: bool = False
    tds_section: Optional[str] = None
    tds_rate: Decimal = Decimal("0")
    tds_amount: Decimal = Decimal("0")
    warehouse_id: Optional[str] = None
    branch_id: Optional[str] = None
    project_id: Optional[str] = None
    approval_status: Optional[str] = None
    approval_note: Optional[str] = None
    currency: Optional[str] = None
    exchange_rate: Decimal = Decimal("1")
    fc_subtotal: Optional[Decimal] = None
    fc_discount_amount: Optional[Decimal] = None
    fc_tax_total: Optional[Decimal] = None
    fc_total: Optional[Decimal] = None
    fc_amount_paid: Optional[Decimal] = None
    fc_balance_due: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime


class BillListItem(APIModel):
    id: str
    bill_number: str
    vendor_bill_number: Optional[str] = None
    order_number: Optional[str] = None
    subject: Optional[str] = None
    vendor_id: str
    vendor_name: str
    date: date
    due_date: date
    status: str
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    currency: Optional[str] = None
    fc_total: Optional[Decimal] = None
    fc_balance_due: Optional[Decimal] = None


class BillStatusUpdate(APIModel):
    status: Literal["open", "void", "draft"]


class BillStats(APIModel):
    total_outstanding: Decimal
    overdue: Decimal
    due_within_30_days: Decimal
    draft_count: int
    unpaid_count: int
    overdue_count: int


class VendorPaymentCreate(APIModel):
    vendor_id: str
    bill_id: Optional[str] = None
    bank_account_id: str
    date: date
    # In the bill's currency when it is a foreign-currency bill.
    amount: Decimal = Field(gt=0, le=MAX_MONEY)
    exchange_rate: Optional[Decimal] = Field(default=None, gt=0, le=Decimal("1000000"))
    mode: PaymentMode = "bank_transfer"
    reference: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = None


class VendorPaymentOut(APIModel):
    id: str
    payment_number: str
    vendor_id: str
    vendor_name: str
    bill_id: Optional[str] = None
    bill_number: Optional[str] = None
    bank_account_id: str
    bank_account_name: str
    date: date
    amount: Decimal
    mode: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    currency: Optional[str] = None
    exchange_rate: Decimal = Decimal("1")
    fc_amount: Optional[Decimal] = None
    created_at: datetime


class ExpenseCreate(APIModel):
    date: date
    account_id: str
    paid_through_account_id: str
    vendor_id: Optional[str] = None
    customer_id: Optional[str] = None
    amount: Decimal = Field(gt=0, le=MAX_MONEY)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    reference: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = None
    is_billable: bool = False
    # Category stays free text: spreadsheet imports carry whatever heads the
    # business uses. It is bounded to the column so it cannot overflow.
    category: str = Field(default="Other", min_length=1, max_length=60)
    payment_method: ExpensePaymentMethod = "bank_transfer"
    receipt_url: Optional[str] = Field(default=None, max_length=500)
    status: ExpenseStatus = "paid"
    branch_id: Optional[str] = None
    project_id: Optional[str] = None


class ExpenseUpdate(ExpenseCreate):
    """Same body as create, but category, payment method, receipt and status
    are only changed when sent - the edit form does not send them, and
    defaulting them here wiped an imported category back to "Other"."""

    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    payment_method: Optional[ExpensePaymentMethod] = None
    receipt_url: Optional[str] = Field(default=None, max_length=500)
    status: Optional[ExpenseStatus] = None


class ExpenseOut(APIModel):
    id: str
    expense_number: str
    date: date
    account_id: str
    account_name: str
    paid_through_account_id: str
    paid_through_name: str
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total: Decimal
    category: str = "Other"
    payment_method: str = "bank_transfer"
    receipt_url: Optional[str] = None
    status: str = "paid"
    reference: Optional[str] = None
    notes: Optional[str] = None
    is_billable: bool
    branch_id: Optional[str] = None
    project_id: Optional[str] = None
    distance_km: Optional[Decimal] = None
    rate_per_km: Optional[Decimal] = None
    created_at: datetime
