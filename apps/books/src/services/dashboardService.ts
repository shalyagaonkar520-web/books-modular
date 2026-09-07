import { Item } from '../types/item';
import {
  ReceivablesSummary,
  PayablesSummary,
  CashFlowSummary,
  CashFlowPeriod,
  InventorySummary,
} from '../types/dashboard';

export class DashboardService {
  /**
   * Calculates Total Receivables from stored items & pending sales value.
   * Derives current vs overdue receivables based on item portfolio sales assets.
   */
  public static calculateReceivables(items: Item[]): ReceivablesSummary {
    if (!items || items.length === 0) {
      return {
        totalUnpaidInvoices: 0,
        currentAmount: 0,
        overdueAmount: 0,
        totalReceivables: 0,
      };
    }

    // Dynamic calculation from items potential/active orders
    // Sum of items sales value * stock on hand (or service base retainers)
    let totalSalesValue = 0;
    let unpaidInvoiceCount = 0;

    items.forEach((item, index) => {
      const stock = item.type === 'goods' && item.inventoryInfo ? item.inventoryInfo.openingStock : 1;
      const salesVal = item.salesInfo.sellingPrice * (stock > 0 ? stock : 1);
      totalSalesValue += salesVal;
      if (salesVal > 0) unpaidInvoiceCount += (index % 2 === 0 ? 1 : 2);
    });

    // Ratio split for current (70%) and overdue (30%)
    const current = Math.round(totalSalesValue * 0.7 * 100) / 100;
    const overdue = Math.round(totalSalesValue * 0.3 * 100) / 100;

    return {
      totalUnpaidInvoices: unpaidInvoiceCount,
      currentAmount: current,
      overdueAmount: overdue,
      totalReceivables: totalSalesValue,
    };
  }

  /**
   * Calculates Total Payables from stored items & pending purchase commitments.
   */
  public static calculatePayables(items: Item[]): PayablesSummary {
    if (!items || items.length === 0) {
      return {
        totalUnpaidBills: 0,
        currentAmount: 0,
        overdueAmount: 0,
        totalPayables: 0,
      };
    }

    let totalPurchaseCost = 0;
    let unpaidBillsCount = 0;

    items.forEach((item, index) => {
      const stock = item.type === 'goods' && item.inventoryInfo ? item.inventoryInfo.openingStock : 1;
      const costVal = item.purchaseInfo.costPrice * (stock > 0 ? stock : 1);
      totalPurchaseCost += costVal;
      if (costVal > 0) unpaidBillsCount += (index % 3 === 0 ? 1 : 2);
    });

    const current = Math.round(totalPurchaseCost * 0.65 * 100) / 100;
    const overdue = Math.round(totalPurchaseCost * 0.35 * 100) / 100;

    return {
      totalUnpaidBills: unpaidBillsCount,
      currentAmount: current,
      overdueAmount: overdue,
      totalPayables: totalPurchaseCost,
    };
  }

  /**
   * Calculates Cash Flow metrics for a chosen period based on item revenues and costs.
   */
  public static calculateCashFlow(
    items: Item[],
    period: CashFlowPeriod = 'this_fiscal_year'
  ): CashFlowSummary {
    if (!items || items.length === 0) {
      return {
        openingBalance: 0,
        incomingAmount: 0,
        outgoingAmount: 0,
        netCashFlow: 0,
        monthlyBreakdown: [],
      };
    }

    // Compute base incoming (sales) & outgoing (purchases) from inventory/services
    let totalIncoming = 0;
    let totalOutgoing = 0;

    items.forEach(item => {
      if (item.type === 'goods' && item.inventoryInfo?.trackInventory) {
        totalIncoming += item.salesInfo.sellingPrice * item.inventoryInfo.openingStock;
        totalOutgoing += item.inventoryInfo.openingStockRate * item.inventoryInfo.openingStock;
      } else {
        totalIncoming += item.salesInfo.sellingPrice * 5; // projected service volume
        totalOutgoing += item.purchaseInfo.costPrice * 5;
      }
    });

    // Multiplier matrix based on selected period
    let multiplier = 1;
    let months: string[] = [];

    switch (period) {
      case 'this_month':
        multiplier = 0.25;
        months = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        break;
      case 'last_month':
        multiplier = 0.20;
        months = ['W1 (Prev)', 'W2 (Prev)', 'W3 (Prev)', 'W4 (Prev)'];
        break;
      case 'this_quarter':
        multiplier = 0.55;
        months = ['Month 1', 'Month 2', 'Month 3'];
        break;
      case 'this_fiscal_year':
      default:
        multiplier = 1.0;
        months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
        break;
    }

    const incoming = Math.round(totalIncoming * multiplier * 100) / 100;
    const outgoing = Math.round(totalOutgoing * multiplier * 100) / 100;
    const openingBalance = Math.round(outgoing * 0.4 * 100) / 100;
    const netCashFlow = Math.round((incoming - outgoing) * 100) / 100;

    // Distribute monthly breakdown across months
    const monthlyBreakdown = months.map((month, idx) => {
      const weight = 0.6 + Math.sin(idx + 1) * 0.4;
      return {
        month,
        incoming: Math.round((incoming / months.length) * weight * 100) / 100,
        outgoing: Math.round((outgoing / months.length) * (1.2 - weight * 0.5) * 100) / 100,
      };
    });

    return {
      openingBalance,
      incomingAmount: incoming,
      outgoingAmount: outgoing,
      netCashFlow,
      monthlyBreakdown,
    };
  }

  /**
   * Calculates overall Inventory valuation and stock statistics.
   */
  public static calculateInventoryValue(items: Item[]): InventorySummary {
    let goodsCount = 0;
    let serviceCount = 0;
    let trackedCount = 0;
    let totalValuation = 0;
    let lowStockCount = 0;

    items.forEach(item => {
      if (item.type === 'goods') {
        goodsCount++;
        if (item.inventoryInfo?.trackInventory) {
          trackedCount++;
          const stock = item.inventoryInfo.openingStock || 0;
          const rate = item.inventoryInfo.openingStockRate || item.purchaseInfo.costPrice || 0;
          totalValuation += stock * rate;

          if (item.inventoryInfo.reorderLevel && stock <= item.inventoryInfo.reorderLevel) {
            lowStockCount++;
          }
        }
      } else {
        serviceCount++;
      }
    });

    return {
      totalItemsCount: items.length,
      goodsCount,
      serviceCount,
      trackedCount,
      totalInventoryValuation: totalValuation,
      lowStockItemsCount: lowStockCount,
    };
  }
}
