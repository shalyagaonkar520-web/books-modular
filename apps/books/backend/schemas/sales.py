from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import Field, model_validator

from backend.schemas.common import APIModel

InvoiceStatus = Literal["draft", "sent", "partially_paid", "paid", "void", "overdue"]
PaymentMode = Literal["cash", "bank_transfer", "upi", "cheque", "card", "other"]


class LineInput(APIModel):
    item_id: Optional[str] = None
    account_id: Optional[str] = None
    description: str = Field(min_length=1, max_length=500)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    rate: Decimal = Field(default=Decimal("0"), ge=0)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)


class LineOut(LineInput):
    id: str
    position: int
    amount: Decimal
    tax_amount: Decimal
    item_name: Optional[str] = None
    account_name: Optional[str] = None
    # Relaxed from the input rule above. Entry still requires a description,
    # but an output model must be able to render whatever is stored - an
    # imported row with no description column would otherwise make the whole
    # invoice fail to serialise instead of just showing a blank cell.
    description: str = Field(default="", max_length=500)


class InvoiceCreate(APIModel):
    customer_id: str
    project_id: Optional[str] = None
    date: date
    due_date: Optional[date] = None
    reference: Optional[str] = Field(default=None, max_length=120)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: Optional[str] = None
    terms: Optional[str] = None
    lines: List[LineInput] = Field(min_length=1)
    status: Literal["draft", "sent"] = "draft"

    @model_validator(mode="after")
    def _due_after_date(self):
        if self.due_date and self.due_date < self.date:
            raise ValueError("Due date cannot be before the invoice date")
        return self


class InvoiceUpdate(InvoiceCreate):
    pass


class InvoiceOut(APIModel):
    id: str
    invoice_number: str
    customer_id: str
    customer_name: str
    customer_email: Optional[str] = None
    customer_gstin: Optional[str] = None
    customer_billing_address: Optional[str] = None
    project_id: Optional[str] = None
    date: date
    due_date: date
    status: str
    reference: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_total: Decimal
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    notes: Optional[str] = None
    terms: Optional[str] = None
    sent_at: Optional[datetime] = None
    lines: List[LineOut] = []
    created_at: datetime
    updated_at: datetime


class InvoiceListItem(APIModel):
    id: str
    invoice_number: str
    customer_id: str
    customer_name: str
    date: date
    due_date: date
    status: str
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    reference: Optional[str] = None


class InvoiceStatusUpdate(APIModel):
    status: Literal["sent", "void", "draft"]


class InvoiceStats(APIModel):
    total_outstanding: Decimal
    overdue: Decimal
    due_within_30_days: Decimal
    draft_count: int
    unpaid_count: int
    overdue_count: int


class CustomerPaymentCreate(APIModel):
    customer_id: str
    invoice_id: Optional[str] = None
    bank_account_id: str
    date: date
    amount: Decimal = Field(gt=0)
    mode: PaymentMode = "bank_transfer"
    reference: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = None


class CustomerPaymentOut(APIModel):
    id: str
    payment_number: str
    customer_id: str
    customer_name: str
    invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None
    bank_account_id: str
    bank_account_name: str
    date: date
    amount: Decimal
    mode: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
