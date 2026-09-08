from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional

from backend.schemas.common import APIModel


class ReceivablesSummary(APIModel):
    total_unpaid_invoices: int
    current_amount: Decimal
    overdue_amount: Decimal
    total_receivables: Decimal


class PayablesSummary(APIModel):
    total_unpaid_bills: int
    current_amount: Decimal
    overdue_amount: Decimal
    total_payables: Decimal


class PeriodBreakdown(APIModel):
    label: str
    start: date
    end: date
    incoming: Decimal
    outgoing: Decimal


class CashFlowSummary(APIModel):
    period: str
    start_date: date
    end_date: date
    opening_balance: Decimal
    incoming_amount: Decimal
    outgoing_amount: Decimal
    net_cash_flow: Decimal
    closing_balance: Decimal
    breakdown: List[PeriodBreakdown]


class IncomeExpenseSummary(APIModel):
    start_date: date
    end_date: date
    total_income: Decimal
    total_expense: Decimal
    net: Decimal
    breakdown: List[PeriodBreakdown]


class InventorySummary(APIModel):
    total_items_count: int
    goods_count: int
    service_count: int
    tracked_count: int
    total_inventory_valuation: Decimal
    low_stock_items_count: int


class TopCustomer(APIModel):
    contact_id: str
    contact_name: str
    amount: Decimal


class RecentActivity(APIModel):
    id: str
    type: str
    number: str
    contact_name: Optional[str] = None
    date: date
    amount: Decimal
    status: Optional[str] = None


class BankBalance(APIModel):
    bank_account_id: str
    name: str
    type: str
    balance: Decimal


class DashboardSummary(APIModel):
    receivables: ReceivablesSummary
    payables: PayablesSummary
    cash_flow: CashFlowSummary
    income_expense: IncomeExpenseSummary
    inventory: InventorySummary
    bank_balances: List[BankBalance]
    total_cash: Decimal
    top_customers: List[TopCustomer]
    recent_activity: List[RecentActivity]
    unbilled_hours: Decimal
    unbilled_amount: Decimal


class NotificationItem(APIModel):
    id: str
    kind: str  # overdue_invoice | overdue_bill | low_stock | unreconciled
    title: str
    body: str
    entity_type: str
    entity_id: Optional[str] = None
    severity: str  # info | warning | danger


class Notifications(APIModel):
    items: List[NotificationItem]
    count: int
