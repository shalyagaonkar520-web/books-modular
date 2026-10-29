"""Quotes, sales orders, credit notes, purchase orders, vendor credits, refunds
and recurring profiles: the documents around invoices and bills."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional

from pydantic import Field, model_validator

from backend.schemas.common import MAX_MONEY, APIModel
from backend.schemas.sales import LineInput, LineOut, PaymentMode


class _DocumentBody(APIModel):
    date: date
    reference: Optional[str] = Field(default=None, max_length=120)
    subject: Optional[str] = Field(default=None, max_length=250)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0, le=MAX_MONEY)
    notes: Optional[str] = None
    terms: Optional[str] = None
    lines: List[LineInput] = Field(min_length=1)


def _not_before(value: Optional[date], start: date, label: str) -> None:
    if value and value < start:
        raise ValueError(f"{label} cannot be before the document date")


class EstimateCreate(_DocumentBody):
    customer_id: str
    expiry_date: Optional[date] = None
    salesperson: Optional[str] = Field(default=None, max_length=120)
    status: Literal["draft", "sent"] = "draft"

    @model_validator(mode="after")
    def _dates(self):
        _not_before(self.expiry_date, self.date, "Expiry date")
        return self


class SalesOrderCreate(_DocumentBody):
    customer_id: str
    shipment_date: Optional[date] = None
    salesperson: Optional[str] = Field(default=None, max_length=120)
    status: Literal["draft", "confirmed"] = "draft"

    @model_validator(mode="after")
    def _dates(self):
        _not_before(self.shipment_date, self.date, "Expected shipment date")
        return self


class DeliveryChallanCreate(_DocumentBody):
    customer_id: str
    # Why the goods move (Rule 55): supply on approval, job work, ...
    reason: Optional[str] = Field(default=None, max_length=120)
    status: Literal["draft", "issued"] = "draft"


class CreditNoteCreate(_DocumentBody):
    customer_id: str
    invoice_id: Optional[str] = None
    reason: Optional[str] = Field(default=None, max_length=120)
    # Warehouse returned goods go back into (or leave from); null = the default.
    warehouse_id: Optional[str] = None
    status: Literal["draft", "open"] = "open"


class PurchaseOrderCreate(_DocumentBody):
    vendor_id: str
    delivery_date: Optional[date] = None
    status: Literal["draft", "issued"] = "draft"

    @model_validator(mode="after")
    def _dates(self):
        _not_before(self.delivery_date, self.date, "Delivery date")
        return self


class VendorCreditCreate(_DocumentBody):
    vendor_id: str
    bill_id: Optional[str] = None
    reason: Optional[str] = Field(default=None, max_length=120)
    # Warehouse returned goods go back into (or leave from); null = the default.
    warehouse_id: Optional[str] = None
    status: Literal["draft", "open"] = "open"


class StatusChange(APIModel):
    status: str = Field(min_length=1, max_length=20)


class ConvertRequest(APIModel):
    # Whether the new invoice/bill is issued straight away (posting it) or
    # left as a draft to review.
    issue: bool = False


class ConversionResult(APIModel):
    kind: str
    id: str
    number: str


class CreditApplicationOut(APIModel):
    id: str
    date: date
    amount: Decimal
    credit_id: Optional[str] = None  # null when an advance was applied
    credit_number: str
    document_id: str
    document_number: str
    created_at: datetime


class ApplyCreditLine(APIModel):
    document_id: str
    amount: Decimal = Field(gt=0, le=MAX_MONEY)


class ApplyCreditRequest(APIModel):
    date: Optional[date] = None
    applications: List[ApplyCreditLine] = Field(min_length=1)


class RefundCreate(APIModel):
    bank_account_id: str
    date: date
    amount: Decimal = Field(gt=0, le=MAX_MONEY)
    mode: PaymentMode = "bank_transfer"
    reference: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = None


class AdvanceRefundCreate(RefundCreate):
    party_type: Literal["customer", "vendor"]
    contact_id: str


class RefundOut(APIModel):
    id: str
    refund_number: str
    party_type: str
    source: str  # credit_note | vendor_credit | advance
    contact_id: str
    contact_name: str
    credit_note_id: Optional[str] = None
    credit_note_number: Optional[str] = None
    vendor_credit_id: Optional[str] = None
    vendor_credit_number: Optional[str] = None
    bank_account_id: str
    bank_account_name: str
    date: date
    amount: Decimal
    mode: str
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


class AdvanceBalance(APIModel):
    contact_id: str
    party_type: str
    balance: Decimal


class DocumentOut(APIModel):
    """One shape for every document type; fields that do not apply are null."""

    id: str
    kind: str
    number: str
    # status is what the document shows (a quote past its expiry date is "expired");
    # stored_status is what was saved (draft or sent), which decides how it is edited.
    stored_status: Optional[str] = None
    contact_id: str
    contact_name: str
    contact_email: Optional[str] = None
    contact_gstin: Optional[str] = None
    contact_billing_address: Optional[str] = None
    date: date
    expiry_date: Optional[date] = None
    shipment_date: Optional[date] = None
    delivery_date: Optional[date] = None
    status: str
    reference: Optional[str] = None
    subject: Optional[str] = None
    salesperson: Optional[str] = None
    reason: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_total: Decimal
    total: Decimal
    notes: Optional[str] = None
    terms: Optional[str] = None
    lines: List[LineOut] = []
    # Where it came from / what it became.
    estimate_id: Optional[str] = None
    estimate_number: Optional[str] = None
    sales_order_id: Optional[str] = None
    sales_order_number: Optional[str] = None
    invoice_id: Optional[str] = None
    invoice_number: Optional[str] = None
    bill_id: Optional[str] = None
    bill_number: Optional[str] = None
    # Credit notes and vendor credits.
    amount_applied: Optional[Decimal] = None
    amount_refunded: Optional[Decimal] = None
    balance: Optional[Decimal] = None
    applications: List[CreditApplicationOut] = []
    refunds: List[RefundOut] = []
    created_at: datetime
    updated_at: datetime


class DocumentListItem(APIModel):
    id: str
    kind: str
    number: str
    contact_id: str
    contact_name: str
    date: date
    expiry_date: Optional[date] = None
    shipment_date: Optional[date] = None
    delivery_date: Optional[date] = None
    status: str
    reference: Optional[str] = None
    total: Decimal
    balance: Optional[Decimal] = None
    invoice_number: Optional[str] = None
    bill_number: Optional[str] = None


# --------------------------------------------------------------------------- #
# Recurring profiles
# --------------------------------------------------------------------------- #
Frequency = Literal["weekly", "monthly", "quarterly", "yearly"]


class RecurringProfileCreate(APIModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["invoice", "bill", "journal"]
    frequency: Frequency = "monthly"
    interval_count: int = Field(default=1, ge=1, le=12)
    start_date: date
    end_date: Optional[date] = None
    auto_issue: bool = False
    # An invoice (or bill) body as POST /api/invoices (/api/bills) takes it;
    # its dates and status are set on each run.
    template: Dict[str, Any]

    @model_validator(mode="after")
    def _dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("End date cannot be before the start date")
        return self


class RecurringProfileUpdate(RecurringProfileCreate):
    pass


class RecurringProfileOut(APIModel):
    id: str
    name: str
    kind: str
    contact_id: Optional[str] = None
    contact_name: str = ""
    frequency: str
    interval_count: int
    start_date: date
    end_date: Optional[date] = None
    next_run_date: Optional[date] = None
    status: str
    auto_issue: bool
    template: Dict[str, Any]
    total: Decimal
    runs_count: int
    last_run_date: Optional[date] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class GeneratedDocument(APIModel):
    id: str
    number: str
    date: date
    status: str
    total: Decimal


class RecurringRunResult(APIModel):
    created: List[GeneratedDocument] = []
    errors: List[str] = []


# --------------------------------------------------------------------------- #
# Books lock and cash-flow statement
# --------------------------------------------------------------------------- #
class LockDateUpdate(APIModel):
    lock_date: Optional[date] = None


class LockDateOut(APIModel):
    lock_date: Optional[date] = None


class CashFlowLine(APIModel):
    label: str
    account_id: Optional[str] = None
    code: Optional[str] = None
    amount: Decimal


class CashFlowSection(APIModel):
    title: str
    lines: List[CashFlowLine] = []
    total: Decimal


class CashFlowStatement(APIModel):
    start_date: date
    end_date: date
    net_income: Decimal
    operating: CashFlowSection
    investing: CashFlowSection
    financing: CashFlowSection
    net_change: Decimal
    opening_cash: Decimal
    closing_cash: Decimal
