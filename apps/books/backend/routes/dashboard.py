import math
from typing import Optional
from fastapi import APIRouter, Query
from backend.models import (
    CashFlowPeriod,
    ReceivablesSummary,
    PayablesSummary,
    CashFlowSummary,
    InventorySummary,
    MonthlyBreakdown,
    DashboardSummaryResponse,
)
from backend import database

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def compute_receivables(items) -> ReceivablesSummary:
    if not items:
        return ReceivablesSummary(
            totalUnpaidInvoices=0,
            currentAmount=0.0,
            overdueAmount=0.0,
            totalReceivables=0.0,
        )

    total_sales_value = 0.0
    unpaid_invoice_count = 0

    for index, item in enumerate(items):
        stock = 1.0
        if item["type"] == "goods" and item.get("inventoryInfo"):
            stock = item["inventoryInfo"].get("openingStock", 1.0)
            if stock <= 0:
                stock = 1.0
        selling_price = item.get("salesInfo", {}).get("sellingPrice", 0.0)
        sales_val = selling_price * stock
        total_sales_value += sales_val
        if sales_val > 0:
            unpaid_invoice_count += 1 if (index % 2 == 0) else 2

    current = round(total_sales_value * 0.7, 2)
    overdue = round(total_sales_value * 0.3, 2)

    return ReceivablesSummary(
        totalUnpaidInvoices=unpaid_invoice_count,
        currentAmount=current,
        overdueAmount=overdue,
        totalReceivables=round(total_sales_value, 2),
    )


def compute_payables(items) -> PayablesSummary:
    if not items:
        return PayablesSummary(
            totalUnpaidBills=0,
            currentAmount=0.0,
            overdueAmount=0.0,
            totalPayables=0.0,
        )

    total_purchase_cost = 0.0
    unpaid_bills_count = 0

    for index, item in enumerate(items):
        stock = 1.0
        if item["type"] == "goods" and item.get("inventoryInfo"):
            stock = item["inventoryInfo"].get("openingStock", 1.0)
            if stock <= 0:
                stock = 1.0
        cost_price = item.get("purchaseInfo", {}).get("costPrice", 0.0)
        cost_val = cost_price * stock
        total_purchase_cost += cost_val
        if cost_val > 0:
            unpaid_bills_count += 1 if (index % 3 == 0) else 2

    current = round(total_purchase_cost * 0.65, 2)
    overdue = round(total_purchase_cost * 0.35, 2)

    return PayablesSummary(
        totalUnpaidBills=unpaid_bills_count,
        currentAmount=current,
        overdueAmount=overdue,
        totalPayables=round(total_purchase_cost, 2),
    )


def compute_cash_flow(items, period: CashFlowPeriod = "this_fiscal_year") -> CashFlowSummary:
    if not items:
        return CashFlowSummary(
            openingBalance=0.0,
            incomingAmount=0.0,
            outgoingAmount=0.0,
            netCashFlow=0.0,
            monthlyBreakdown=[],
        )

    total_incoming = 0.0
    total_outgoing = 0.0

    for item in items:
        selling_price = item.get("salesInfo", {}).get("sellingPrice", 0.0)
        cost_price = item.get("purchaseInfo", {}).get("costPrice", 0.0)

        if item["type"] == "goods" and item.get("inventoryInfo") and item["inventoryInfo"].get("trackInventory"):
            stock = item["inventoryInfo"].get("openingStock", 0.0)
            rate = item["inventoryInfo"].get("openingStockRate", cost_price)
            total_incoming += selling_price * stock
            total_outgoing += rate * stock
        else:
            total_incoming += selling_price * 5.0
            total_outgoing += cost_price * 5.0

    multiplier = 1.0
    months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]

    if period == "this_month":
        multiplier = 0.25
        months = ["Week 1", "Week 2", "Week 3", "Week 4"]
    elif period == "last_month":
        multiplier = 0.20
        months = ["W1 (Prev)", "W2 (Prev)", "W3 (Prev)", "W4 (Prev)"]
    elif period == "this_quarter":
        multiplier = 0.55
        months = ["Month 1", "Month 2", "Month 3"]

    incoming = round(total_incoming * multiplier, 2)
    outgoing = round(total_outgoing * multiplier, 2)
    opening_balance = round(outgoing * 0.4, 2)
    net_cash_flow = round(incoming - outgoing, 2)

    breakdown = []
    num_months = len(months)
    for idx, month in enumerate(months):
        weight = 0.6 + math.sin(idx + 1) * 0.4
        m_in = round((incoming / num_months) * weight, 2)
        m_out = round((outgoing / num_months) * (1.2 - weight * 0.5), 2)
        breakdown.append(MonthlyBreakdown(month=month, incoming=m_in, outgoing=m_out))

    return CashFlowSummary(
        openingBalance=opening_balance,
        incomingAmount=incoming,
        outgoingAmount=outgoing,
        netCashFlow=net_cash_flow,
        monthlyBreakdown=breakdown,
    )


def compute_inventory(items) -> InventorySummary:
    goods_count = 0
    service_count = 0
    tracked_count = 0
    total_valuation = 0.0
    low_stock_count = 0

    for item in items:
        if item["type"] == "goods":
            goods_count += 1
            inv = item.get("inventoryInfo")
            if inv and inv.get("trackInventory"):
                tracked_count += 1
                stock = inv.get("openingStock", 0.0)
                rate = inv.get("openingStockRate") or item.get("purchaseInfo", {}).get("costPrice", 0.0)
                total_valuation += stock * rate

                reorder = inv.get("reorderLevel", 0.0)
                if reorder and stock <= reorder:
                    low_stock_count += 1
        else:
            service_count += 1

    return InventorySummary(
        totalItemsCount=len(items),
        goodsCount=goods_count,
        serviceCount=service_count,
        trackedCount=tracked_count,
        totalInventoryValuation=round(total_valuation, 2),
        lowStockItemsCount=low_stock_count,
    )


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    period: CashFlowPeriod = Query("this_fiscal_year", description="Period for cash flow calculations")
):
    items = database.get_all_items()
    receivables = compute_receivables(items)
    payables = compute_payables(items)
    cash_flow = compute_cash_flow(items, period)
    inventory = compute_inventory(items)

    return DashboardSummaryResponse(
        receivables=receivables,
        payables=payables,
        cashFlow=cash_flow,
        inventory=inventory,
    )
