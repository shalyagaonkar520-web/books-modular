from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import Field, field_validator, model_validator

from backend.schemas.common import MAX_MONEY, MAX_QUANTITY, APIModel
from backend.services.gst import STATE_CODES

InvoiceStatus = Literal["draft", "sent", "partially_paid", "paid", "void", "overdue"]
PaymentMode = Literal["cash", "bank_transfer", "upi", "cheque", "card", "other"]


def validate_state(value: Optional[str]) -> Optional[str]:
    if value in (None, ""):
        return None
    code = value.strip().zfill(2)
    if code not in STATE_CODES:
        raise ValueError("Unknown GST state code")
    return code


class LineInput(APIModel):
    item_id: Optional[str] = None
    account_id: Optional[str] = None
    description: str = Field(default="", max_length=500)
    quantity: Decimal = Field(default=Decimal("1"), gt=0, le=MAX_QUANTITY)
    rate: Decimal = Field(default=Decimal("0"), ge=0, le=MAX_MONEY)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)


class LineOut(LineInput):
    id: str
    position: int
    amount: Decimal
    tax_amount: Decimal
    item_name: Optional[str] = None
    account_name: Optional[str] = None
    # The line in the document's currency (equal to rate / amount in the base currency).
    fc_rate: Optional[Decimal] = None
    fc_amount: Optional[Decimal] = None
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
    order_number: Optional[str] = Field(default=None, max_length=120)
    subject: Optional[str] = Field(default=None, max_length=250)
    salesperson: Optional[str] = Field(default=None, max_length=120)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0, le=MAX_MONEY)
    notes: Optional[str] = None
    terms: Optional[str] = None
    lines: List[LineInput] = Field(min_length=1)
    status: Literal["draft", "sent"] = "draft"
    # GST state code where the supply is made; null = the customer's state.
    place_of_supply: Optional[str] = Field(default=None, max_length=2)
    # TCS (Income-tax section 206C) collected on the invoice value, in percent.
    tcs_rate: Decimal = Field(default=Decimal("0"), ge=0, le=10)
    # Base currency per unit of the customer's currency; null = the saved rate.
    exchange_rate: Optional[Decimal] = Field(default=None, gt=0, le=Decimal("1000000"))

    @model_validator(mode="after")
    def _due_after_date(self):
        if self.due_date and self.due_date < self.date:
            raise ValueError("Due date cannot be before the invoice date")
        return self

    @field_validator("place_of_supply")
    @classmethod
    def _state(cls, value: Optional[str]) -> Optional[str]:
        return validate_state(value)


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
    order_number: Optional[str] = None
    subject: Optional[str] = None
    salesperson: Optional[str] = None
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
    place_of_supply: Optional[str] = None
    tcs_rate: Decimal = Decimal("0")
    tcs_amount: Decimal = Decimal("0")
    irn: Optional[str] = None
    irn_ack_no: Optional[str] = None
    irn_ack_date: Optional[datetime] = None
    eway_bill_no: Optional[str] = None
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
    currency: Optional[str] = None
    fc_total: Optional[Decimal] = None
    fc_balance_due: Optional[Decimal] = None


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
    # In the invoice's currency when it is a foreign-currency invoice.
    amount: Decimal = Field(gt=0, le=MAX_MONEY)
    # Today's rate for a foreign-currency invoice; null = the saved rate.
    exchange_rate: Optional[Decimal] = Field(default=None, gt=0, le=Decimal("1000000"))
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
    currency: Optional[str] = None
    exchange_rate: Decimal = Decimal("1")
    fc_amount: Optional[Decimal] = None
    created_at: datetime
