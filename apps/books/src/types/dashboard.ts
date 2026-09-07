export type CashFlowPeriod = 'this_fiscal_year' | 'this_month' | 'last_month' | 'this_quarter';

export interface ReceivablesSummary {
  totalUnpaidInvoices: number;
  currentAmount: number;
  overdueAmount: number;
  totalReceivables: number;
}

export interface PayablesSummary {
  totalUnpaidBills: number;
  currentAmount: number;
  overdueAmount: number;
  totalPayables: number;
}

export interface CashFlowSummary {
  openingBalance: number;
  incomingAmount: number;
  outgoingAmount: number;
  netCashFlow: number;
  monthlyBreakdown: Array<{
    month: string;
    incoming: number;
    outgoing: number;
  }>;
}

export interface InventorySummary {
  totalItemsCount: number;
  goodsCount: number;
  serviceCount: number;
  trackedCount: number;
  totalInventoryValuation: number;
  lowStockItemsCount: number;
}
