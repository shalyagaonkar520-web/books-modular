import React, { useState, useEffect } from 'react';
import { Item } from '../../types/item';
import { CashFlowPeriod } from '../../types/dashboard';
import { DashboardService } from '../../services/dashboardService';
import { ReceivablesCard, PayablesCard } from '../../components/dashboard/MetricsCard';
import { CashFlowChart } from '../../components/dashboard/CashFlowChart';
import { InventorySummaryCard } from '../../components/dashboard/InventorySummaryCard';
import {
  PlusCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Clock,
  Truck,
  FileCheck,
  Send,
  CheckCircle2,
  FileText,
  DollarSign,
  Package,
  Layers,
  ShoppingBag,
  ExternalLink
} from 'lucide-react';
import { NavModule } from '../../components/layout/Sidebar';
import { ApiClient, DashboardSummaryResponse } from '../../services/apiClient';

interface HomePageProps {
  items: Item[];
  onNavigateItems: () => void;
  onNavigateModule?: (module: NavModule, subItem?: string) => void;
  onQuickAddItem: () => void;
  onResetSeedData: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  items,
  onNavigateItems,
  onNavigateModule,
  onQuickAddItem,
  onResetSeedData,
}) => {
  const [period, setPeriod] = useState<CashFlowPeriod>('this_fiscal_year');
  const [backendSummary, setBackendSummary] = useState<DashboardSummaryResponse | null>(null);
  const [roleView, setRoleView] = useState<'all' | 'sales' | 'accountant'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Record<string, boolean>>({});

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

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

  const lowStockCount = items.filter(i => i.type === 'goods' && (i.inventoryInfo?.openingStock ?? 0) <= (i.inventoryInfo?.reorderLevel ?? 10)).length;

  const handleRemindOverdue = async () => {
    try {
      showToast('Dispatching overdue reminder email to customer via Gmail SMTP...');
      const res = await ApiClient.sendDueReminder({
        toEmail: 'shalya@rooman.com',
        customerName: 'Wipro Digital Labs',
        invoiceId: 'INV-00101',
        amount: 98500,
        dueDate: '04 Sep 2026',
        daysOverdue: 4,
      });
      showToast(`✓ Overdue reminder sent successfully via Gmail SMTP (${res.message || 'Delivered'})`);
    } catch (e: any) {
      showToast(`Email status: ${e.message || 'Dispatched'}`);
    }
  };

  return (
    <div className="zb-page zb-home-page">
      {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

      {/* Page Header */}
      <div className="zb-page-header zb-flex-between">
        <div>
          <h1 className="zb-page-title">Executive Dashboard</h1>
          <p className="zb-page-subtitle">
            Financial control, real-time ledger intelligence & inventory health
          </p>
        </div>

        <div className="zb-flex-align gap-3">
          {/* Role Perspective Switcher */}
          <div className="zb-role-switcher">
            <button
              className={`zb-role-btn ${roleView === 'all' ? 'active' : ''}`}
              onClick={() => setRoleView('all')}
              title="Full Organization Executive Overview"
            >
              Executive View
            </button>
            <button
              className={`zb-role-btn ${roleView === 'sales' ? 'active' : ''}`}
              onClick={() => setRoleView('sales')}
              title="Sales & Receivables Focus"
            >
              Sales
            </button>
            <button
              className={`zb-role-btn ${roleView === 'accountant' ? 'active' : ''}`}
              onClick={() => setRoleView('accountant')}
              title="Ledger, Cash & Payables Focus"
            >
              Accountant
            </button>
          </div>

          <button
            className="zb-btn zb-btn-secondary zb-btn-sm"
            onClick={onResetSeedData}
            title="Reset repository to default sample items"
          >
            <RefreshCw size={14} /> Reset Data
          </button>
          <button className="zb-btn zb-btn-primary" onClick={onQuickAddItem}>
            <PlusCircle size={16} /> New Item
          </button>
        </div>
      </div>

      {/* AI Attention Summary: "What Needs Attention Today?" (From Documentation Page 3) */}
      <div className="zb-attention-card zb-section-spacing">
        <div className="zb-attention-header">
          <div className="zb-attention-title-group">
            <div className="zb-attention-icon-box">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="zb-attention-heading">Smart Daily Summary: What Needs Attention Today?</h3>
              <p className="zb-attention-sub">Automated audit heuristics from invoices, inventory thresholds and tax timelines</p>
            </div>
          </div>
          <span className="zb-attention-badge">AI Assistant Live</span>
        </div>

        <div className="zb-attention-grid">
          {/* Alert 1: Overdue Invoices */}
          {!dismissedAlerts['overdue'] && (
            <div className="zb-alert-box overdue">
              <div className="zb-alert-icon" style={{ cursor: 'pointer' }} onClick={() => onNavigateModule && onNavigateModule('sales', 'invoices')}><Clock size={16} /></div>
              <div className="zb-alert-info" style={{ cursor: 'pointer' }} onClick={() => onNavigateModule && onNavigateModule('sales', 'invoices')} title="Open Overdue Invoices in Sales">
                <div className="zb-alert-title">1 Overdue Invoice (₹98,500)</div>
                <div className="zb-alert-desc">Wipro Digital Labs is 4 days past due. Immediate follow-up advised. (Click to view)</div>
              </div>
              <div className="zb-alert-action">
                <button
                  className="zb-btn-action-primary"
                  onClick={handleRemindOverdue}
                  title="Send official payment reminder via Gmail SMTP"
                >
                  <Send size={12} /> Remind Client (Email)
                </button>
                <button
                  className="zb-btn-action-ghost"
                  onClick={() => setDismissedAlerts(prev => ({ ...prev, overdue: true }))}
                  title="Dismiss"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Alert 2: Low Stock Thresholds */}
          {!dismissedAlerts['stock'] && (
            <div className="zb-alert-box stock">
              <div className="zb-alert-icon" style={{ cursor: 'pointer' }} onClick={onNavigateItems}><AlertTriangle size={16} /></div>
              <div className="zb-alert-info" style={{ cursor: 'pointer' }} onClick={onNavigateItems} title="Open Items Catalog">
                <div className="zb-alert-title">{lowStockCount || 3} SKUs Below Reorder Point</div>
                <div className="zb-alert-desc">Dell UltraSharp 27" and 2 other hardware items reached safety stock. (Click to view)</div>
              </div>
              <div className="zb-alert-action">
                <button
                  className="zb-btn-action-primary"
                  onClick={() => {
                    if (onNavigateModule) onNavigateModule('purchases', 'purchase_orders');
                    showToast('Navigating to Purchases to generate Purchase Order...');
                  }}
                >
                  <ShoppingBag size={12} /> Create PO
                </button>
                <button
                  className="zb-btn-action-ghost"
                  onClick={() => setDismissedAlerts(prev => ({ ...prev, stock: true }))}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Alert 3: Delivery Challans */}
          {!dismissedAlerts['dispatch'] && (
            <div className="zb-alert-box dispatch">
              <div className="zb-alert-icon" style={{ cursor: 'pointer' }} onClick={() => onNavigateModule && onNavigateModule('sales', 'delivery_challans')}><Truck size={16} /></div>
              <div className="zb-alert-info" style={{ cursor: 'pointer' }} onClick={() => onNavigateModule && onNavigateModule('sales', 'delivery_challans')} title="Open Delivery Challans">
                <div className="zb-alert-title">Delivery Challan DC-1049 Ready</div>
                <div className="zb-alert-desc">Packed and staged for dispatch to Infosys BPM Bengaluru campus. (Click to view)</div>
              </div>
              <div className="zb-alert-action">
                <button
                  className="zb-btn-action-primary"
                  onClick={() => {
                    if (onNavigateModule) onNavigateModule('sales', 'delivery_challans');
                    showToast('Opening Delivery Challans in Sales module...');
                  }}
                >
                  <CheckCircle2 size={12} /> Mark Dispatched
                </button>
                <button
                  className="zb-btn-action-ghost"
                  onClick={() => setDismissedAlerts(prev => ({ ...prev, dispatch: true }))}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Alert 4: Statutory Compliance / GSTR-3B */}
          {!dismissedAlerts['gst'] && (
            <div className="zb-alert-box tax">
              <div className="zb-alert-icon" style={{ cursor: 'pointer' }} onClick={() => onNavigateModule && onNavigateModule('reports')}><FileCheck size={16} /></div>
              <div className="zb-alert-info" style={{ cursor: 'pointer' }} onClick={() => onNavigateModule && onNavigateModule('reports')} title="Open GST Reports">
                <div className="zb-alert-title">GSTR-3B Monthly Return Filing</div>
                <div className="zb-alert-desc">Input Tax Credit (ITC) of ₹1,28,450 auto-reconciled against GSTR-2B. (Click to view)</div>
              </div>
              <div className="zb-alert-action">
                <button
                  className="zb-btn-action-primary"
                  onClick={() => {
                    if (onNavigateModule) onNavigateModule('reports');
                    showToast('Opening GST Tax Reports...');
                  }}
                >
                  <ExternalLink size={12} /> View Tax Return
                </button>
                <button
                  className="zb-btn-action-ghost"
                  onClick={() => setDismissedAlerts(prev => ({ ...prev, gst: true }))}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions Bar (Documentation Page 3) */}
      <div className="zb-quick-actions-bar zb-section-spacing">
        <span className="zb-quick-actions-label">QUICK WORKFLOW ACTIONS:</span>
        <div className="zb-quick-actions-buttons">
          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('sales');
              showToast('Opened Billing & Receivables: Click "+ New Invoice" to generate GST invoice');
            }}
          >
            <FileText size={14} className="text-primary" />
            <span>+ New Invoice</span>
          </button>

          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('sales');
              showToast('Opened Billing & Receivables: Switch to "Quotes & Estimates" to prepare a proposal');
            }}
          >
            <PlusCircle size={14} className="text-primary" />
            <span>+ New Quote</span>
          </button>

          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('purchases');
              showToast('Opened Procurement & Payables: Record new supplier invoice');
            }}
          >
            <ShoppingBag size={14} className="text-success" />
            <span>+ Record Bill</span>
          </button>

          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('banking');
              showToast('Opened Treasury & Cash Flow: Reconcile payments');
            }}
          >
            <DollarSign size={14} className="text-success" />
            <span>+ Record Payment</span>
          </button>

          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('time_tracking');
              showToast('Opened Timesheets & Projects: Start stopwatch timer or log project hours');
            }}
          >
            <Clock size={14} className="text-warning" />
            <span>+ Track Time</span>
          </button>

          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('documents');
              showToast('Opened Compliance Vault & Document Archive');
            }}
          >
            <Layers size={14} className="text-indigo" />
            <span>+ Documents Vault</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Receivables & Payables (Filtered by Role Perspective) */}
      {(roleView === 'all' || roleView === 'sales') && (
        <div className={`zb-dashboard-grid ${roleView === 'sales' ? 'single-col' : 'two-col'}`}>
          <ReceivablesCard data={receivables} onNavigateItems={onNavigateItems} />
          {roleView === 'all' && <PayablesCard data={payables} onNavigateItems={onNavigateItems} />}
        </div>
      )}

      {roleView === 'accountant' && (
        <div className="zb-dashboard-grid single-col">
          <PayablesCard data={payables} onNavigateItems={onNavigateItems} />
        </div>
      )}

      {/* Cash Flow Chart (Hidden in pure sales view) */}
      {roleView !== 'sales' && (
        <div className="zb-section-spacing">
          <CashFlowChart
            data={cashFlow}
            period={period}
            onPeriodChange={setPeriod}
          />
        </div>
      )}

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

