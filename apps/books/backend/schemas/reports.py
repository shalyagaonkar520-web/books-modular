from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import Field

from backend.schemas.common import APIModel


class ReportLine(APIModel):
    account_id: Optional[str] = None
    code: Optional[str] = None
    name: str
    amount: Decimal


class ReportSection(APIModel):
    title: str
    lines: List[ReportLine]
    total: Decimal


class ProfitAndLoss(APIModel):
    start_date: date
    end_date: date
    income: ReportSection
    cost_of_goods_sold: ReportSection
    gross_profit: Decimal
    operating_expenses: ReportSection
    operating_profit: Decimal
    other_income: ReportSection
    net_profit: Decimal


class BalanceSheet(APIModel):
    as_of: date
    assets: ReportSection
    liabilities: ReportSection
    equity: ReportSection
    current_period_earnings: Decimal
    total_liabilities_and_equity: Decimal
    is_balanced: bool


class AgingBucket(APIModel):
    label: str
    amount: Decimal
    count: int


class AgingRow(APIModel):
    # Explicit aliases: pydantic's camelCase generator merges digits together
    # (days_1_30 -> "days130"), which is ambiguous over the wire. Name these
    # to match the report's own bucket labels instead.
    contact_id: str
    contact_name: str
    current: Decimal
    days_1_30: Decimal = Field(alias="days1To30")
    days_31_60: Decimal = Field(alias="days31To60")
    days_61_90: Decimal = Field(alias="days61To90")
    days_over_90: Decimal
    total: Decimal


class AgingReport(APIModel):
    as_of: date
    rows: List[AgingRow]
    buckets: List[AgingBucket]
    total: Decimal


class ContactTotalsRow(APIModel):
    contact_id: str
    contact_name: str
    document_count: int
    amount: Decimal
    amount_paid: Decimal
    balance: Decimal


class ContactTotalsReport(APIModel):
    start_date: date
    end_date: date
    rows: List[ContactTotalsRow]
    total: Decimal


class ExpenseByCategoryRow(APIModel):
    account_id: str
    account_name: str
    count: int
    amount: Decimal


class ExpenseByCategoryReport(APIModel):
    start_date: date
    end_date: date
    rows: List[ExpenseByCategoryRow]
    total: Decimal


class InventoryRow(APIModel):
    item_id: str
    name: str
    sku: str
    unit: str
    stock_on_hand: Decimal
    reorder_level: Decimal
    cost_price: Decimal
    stock_value: Decimal
    is_low_stock: bool


class InventorySummaryReport(APIModel):
    rows: List[InventoryRow]
    total_items: int
    tracked_items: int
    low_stock_items: int
    total_stock_value: Decimal


class TaxSummary(APIModel):
    start_date: date
    end_date: date
    output_gst: Decimal
    input_gst: Decimal
    net_payable: Decimal
    taxable_sales: Decimal
    taxable_purchases: Decimal
