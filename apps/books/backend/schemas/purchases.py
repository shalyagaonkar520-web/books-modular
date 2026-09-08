from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import Field, model_validator

from backend.schemas.common import APIModel
from backend.schemas.sales import LineInput, LineOut, PaymentMode

BillStatus = Literal["draft", "open", "partially_paid", "paid", "void", "overdue"]


class BillCreate(APIModel):
    vendor_id: str
    vendor_bill_number: Optional[str] = Field(default=None, max_length=60)
    date: date
    due_date: Optional[date] = None
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None
    lines: List[LineInput] = Field(min_length=1)
    status: Literal["draft", "open"] = "open"

    @model_validator(mode="after")
    def _due_after_date(self):
        if self.due_date and self.due_date < self.date:
            raise ValueError("Due date cannot be before the bill date")
        return self


class BillUpdate(BillCreate):
    pass


class BillOut(APIModel):
    id: str
    bill_number: str
    vendor_bill_number: Optional[str] = None
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
    created_at: datetime
    updated_at: datetime


class BillListItem(APIModel):
    id: str
    bill_number: str
    vendor_bill_number: Optional[str] = None
    vendor_id: str
    vendor_name: str
    date: date
    due_date: date
    status: str
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal


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
    amount: Decimal = Field(gt=0)
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
    created_at: datetime


class ExpenseCreate(APIModel):
    date: date
    account_id: str
    paid_through_account_id: str
    vendor_id: Optional[str] = None
    customer_id: Optional[str] = None
    amount: Decimal = Field(gt=0)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    reference: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = None
    is_billable: bool = False
    category: str = "Other"
    payment_method: str = "bank_transfer"
    receipt_url: Optional[str] = None
    status: str = "paid"


class ExpenseUpdate(ExpenseCreate):
    pass


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
    created_at: datetime
