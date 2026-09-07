import React, { useState, useEffect } from 'react';
import { Item } from '../../types/item';
import { CashFlowPeriod } from '../../types/dashboard';
import { DashboardService } from '../../services/dashboardService';
import { ReceivablesCard, PayablesCard } from '../../components/dashboard/MetricsCard';
import { CashFlowChart } from '../../components/dashboard/CashFlowChart';
import { InventorySummaryCard } from '../../components/dashboard/InventorySummaryCard';
import { PlusCircle, ArrowRight, RefreshCw } from 'lucide-react';

import { ApiClient, DashboardSummaryResponse } from '../../services/apiClient';

interface HomePageProps {
  items: Item[];
  onNavigateItems: () => void;
  onQuickAddItem: () => void;
  onResetSeedData: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  items,
  onNavigateItems,
  onQuickAddItem,
  onResetSeedData,
}) => {
  const [period, setPeriod] = useState<CashFlowPeriod>('this_fiscal_year');
  const [backendSummary, setBackendSummary] = useState<DashboardSummaryResponse | null>(null);

  // Sync dashboard calculations with cloud service
  useEffect(() => {
    let isMounted = true;
    ApiClient.getDashboardSummary(period)
      .then(data => {
        if (isMounted) setBackendSummary(data);
      })
      .catch(() => {
        // Graceful fallback to client calculations
      });

    return () => {
      isMounted = false;
    };
  }, [items, period]);

  const receivables = backendSummary?.receivables ?? DashboardService.calculateReceivables(items);
  const payables = backendSummary?.payables ?? DashboardService.calculatePayables(items);
  const cashFlow = backendSummary?.cashFlow ?? DashboardService.calculateCashFlow(items, period);
  const inventorySummary = backendSummary?.inventory ?? DashboardService.calculateInventoryValue(items);

  return (
    <div className="zb-page zb-home-page">
      {/* Page Header */}
      <div className="zb-page-header zb-flex-between">
        <div>
          <h1 className="rf-page-title zb-page-title">Dashboard Overview</h1>
          <p className="rf-page-subtitle zb-page-subtitle">
            Financial snapshot & operational health for Rooman Enterprise India
          </p>
        </div>

        <div className="zb-flex-align gap-3">
          <button
            className="zb-btn zb-btn-secondary zb-btn-sm"
            onClick={onResetSeedData}
            title="Reset repository to default sample items"
          >
            <RefreshCw size={14} /> Reset Sample Data
          </button>
          <button className="zb-btn zb-btn-primary" onClick={onQuickAddItem}>
            <PlusCircle size={16} /> New Item
          </button>
        </div>
      </div>

      {/* Main Grid: Receivables & Payables */}
      <div className="zb-dashboard-grid two-col">
        <ReceivablesCard data={receivables} onNavigateItems={onNavigateItems} />
        <PayablesCard data={payables} onNavigateItems={onNavigateItems} />
      </div>

      {/* Cash Flow Chart */}
      <div className="zb-section-spacing">
        <CashFlowChart
          data={cashFlow}
          period={period}
          onPeriodChange={setPeriod}
        />
      </div>

      {/* Inventory & Items Summary */}
      <div className="zb-section-spacing">
        <InventorySummaryCard
          data={inventorySummary}
          onNavigateItems={onNavigateItems}
          onQuickAddItem={onQuickAddItem}
        />
      </div>
    </div>
  );
};
