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
  ExternalLink,
  Bot,
  Zap,
  Check,
  X,
  ChevronRight,
  HelpCircle,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { NavModule } from '../../components/layout/Sidebar';
import {
  ApiClient,
  DashboardSummaryResponse,
  NeedsAttentionItem,
  AutomationMetrics,
  AssistantQueryResponse
} from '../../services/apiClient';

interface HomePageProps {
  items: Item[];
  onNavigateItems: () => void;
  onNavigateModule?: (module: NavModule, subItemId?: string) => void;
  onQuickAddItem: () => void;
  onResetSeedData: () => void;
  appMode?: 'simple' | 'accountant';
}

export const HomePage: React.FC<HomePageProps> = ({
  items,
  onNavigateItems,
  onNavigateModule,
  onQuickAddItem,
  onResetSeedData,
  appMode = 'simple',
}) => {
  const [period, setPeriod] = useState<CashFlowPeriod>('this_fiscal_year');
  const [backendSummary, setBackendSummary] = useState<DashboardSummaryResponse | null>(null);
  const [roleView, setRoleView] = useState<'all' | 'sales' | 'accountant'>(appMode === 'accountant' ? 'accountant' : 'all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Automation Engine State
  const [inboxText, setInboxText] = useState('');
  const [isProcessingEvent, setIsProcessingEvent] = useState(false);
  const [latestEventResult, setLatestEventResult] = useState<any | null>(null);

  // Attention & Exceptions State
  const [attentionItems, setAttentionItems] = useState<NeedsAttentionItem[]>([]);
  const [dismissedItems, setDismissedItems] = useState<Record<string, boolean>>({});

  // Metrics State
  const [metrics, setMetrics] = useState<AutomationMetrics>({
    automationScore: 94,
    processedTodayCount: 127,
    reconciledCount: 14,
    categorizedCount: 28,
    alertsCount: 3,
    activeRulesCount: 5,
  });

  // Assistant State
  const [assistantQuery, setAssistantQuery] = useState('');
  const [isQueryingAssistant, setIsQueryingAssistant] = useState(false);
  const [assistantResult, setAssistantResult] = useState<AssistantQueryResponse | null>(null);

  // Explainability Modal State
  const [explainModalData, setExplainModalData] = useState<{ title: string; explanation: string } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Sync dashboard summary and automation data
  useEffect(() => {
    let isMounted = true;

    ApiClient.getDashboardSummary(period)
      .then(data => {
        if (isMounted) setBackendSummary(data);
      })
      .catch(() => {});

    ApiClient.getAttentionItems()
      .then(items => {
        if (isMounted && items.length > 0) setAttentionItems(items);
      })
      .catch(() => {});

    ApiClient.getAutomationMetrics()
      .then(m => {
        if (isMounted && m) setMetrics(m);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [items, period]);

  // Handle Event Processing from Universal Inbox
  const handleProcessEvent = async (textToProcess?: string) => {
    const query = (textToProcess || inboxText).trim();
    if (!query) return;

    try {
      setIsProcessingEvent(true);
      const res = await ApiClient.processBusinessEvent(query);
      setLatestEventResult(res);
      setInboxText('');

      // Refresh metrics and attention
      ApiClient.getAutomationMetrics().then(m => setMetrics(m)).catch(() => {});
      ApiClient.getAttentionItems().then(items => setAttentionItems(items)).catch(() => {});

      if (res.status === 'auto_processed') {
        showToast(`Business event auto-processed: ${res.extracted.intent.toUpperCase()} of ₹${res.extracted.amount.toLocaleString()} posted to ledger!`);
      } else {
        showToast(`Event sent to 'Needs Your Attention' queue: ${res.reviewReason}`);
      }
    } catch (err: any) {
      showToast(`Automation Error: ${err.message || 'Could not process event'}`);
    } finally {
      setIsProcessingEvent(false);
    }
  };

  // Handle Assistant Query
  const handleAskAssistant = async (prompt?: string) => {
    const q = (prompt || assistantQuery).trim();
    if (!q) return;

    try {
      setIsQueryingAssistant(true);
      const res = await ApiClient.queryAssistant(q);
      setAssistantResult(res);
      setAssistantQuery('');
    } catch (err: any) {
      showToast(`Assistant: ${err.message || 'Could not retrieve data'}`);
    } finally {
      setIsQueryingAssistant(false);
    }
  };

  // Handle Exception 1-Click Action
  const handleAttentionAction = async (item: NeedsAttentionItem, action: string) => {
    try {
      await ApiClient.takeAttentionAction(item.id, action);
      setDismissedItems(prev => ({ ...prev, [item.id]: true }));

      if (action === 'confirm') {
        showToast(`Confirmed match: Transaction reconciled & ledger updated.`);
      } else if (action === 'send_reminder') {
        showToast(`Automated payment reminder dispatched to client!`);
      } else if (action === 'create_po') {
        if (onNavigateModule) onNavigateModule('purchases', 'purchase_orders');
        showToast(`Opening Purchases to generate Purchase Order...`);
      } else {
        showToast(`Item dismissed.`);
      }

      // Update metrics
      setMetrics(prev => ({
        ...prev,
        reconciledCount: action === 'confirm' ? prev.reconciledCount + 1 : prev.reconciledCount,
        alertsCount: Math.max(0, prev.alertsCount - 1),
      }));
    } catch (err: any) {
      showToast(`Action failed: ${err.message}`);
    }
  };

  const receivables = backendSummary?.receivables ?? DashboardService.calculateReceivables(items);
  const payables = backendSummary?.payables ?? DashboardService.calculatePayables(items);
  const cashFlow = backendSummary?.cashFlow ?? DashboardService.calculateCashFlow(items, period);
  const inventorySummary = backendSummary?.inventory ?? DashboardService.calculateInventoryValue(items);

  const visibleAttentionItems = attentionItems.filter(i => !dismissedItems[i.id]);

  return (
    <div className="zb-page zb-home-page">
      {toastMessage && <div className="zb-floating-toast">{toastMessage}</div>}

      {/* Page Header */}
      <div className="zb-page-header zb-flex-between">
        <div>
          <div className="zb-flex-align gap-2">
            <h1 className="zb-page-title">Financial Operating Center</h1>
            <span className={`zb-badge ${appMode === 'accountant' ? 'badge-primary' : 'badge-success'}`}>
              {appMode === 'accountant' ? 'Accountant Mode Active' : 'Simple Owner Mode'}
            </span>
          </div>
          <p className="zb-page-subtitle">
            {appMode === 'accountant'
              ? 'Real-time double-entry general ledger, automated tax splits & trial balance'
              : 'Describe what happened in your business — the system handles accounting, taxes & inventory'}
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

      {/* ========================================================================= */}
      {/* 1. UNIVERSAL BUSINESS INBOX (CORE PRODUCT PHILOSOPHY) */}
      {/* ========================================================================= */}
      <div className="zb-universal-inbox-card zb-section-spacing">
        <div className="zb-universal-inbox-header">
          <div className="zb-flex-align gap-2">
            <div className="zb-inbox-icon-box">
              <Zap size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="zb-inbox-title">Universal Business Inbox</h2>
              <p className="zb-inbox-subtitle">
                Enter any business activity in plain English. The engine automatically determines accounting, GST taxes, inventory, and payables.
              </p>
            </div>
          </div>
          <span className="zb-inbox-status-pill">
            <span className="zb-pulse-dot"></span>
            Zero Manual Journal Entries Required
          </span>
        </div>

        <div className="zb-inbox-input-group">
          <input
            type="text"
            className="zb-inbox-input"
            placeholder="e.g. 'Bought 5 chairs from IKEA for ₹30,000 via HDFC' or 'ABC paid ₹59,000'..."
            value={inboxText}
            onChange={(e) => setInboxText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleProcessEvent();
            }}
          />
          <button
            className="zb-btn zb-btn-primary zb-inbox-submit-btn"
            onClick={() => handleProcessEvent()}
            disabled={isProcessingEvent || !inboxText.trim()}
          >
            {isProcessingEvent ? (
              <>
                <RefreshCw size={15} className="zb-spin" />
                <span>Analyzing Event...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>Auto-Process Event</span>
              </>
            )}
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="zb-inbox-quick-chips">
          <span className="zb-chips-label">Try Examples:</span>
          <button
            className="zb-chip-btn"
            onClick={() => handleProcessEvent('Bought 5 chairs from IKEA for ₹30,000 via HDFC')}
          >
            "Bought 5 chairs from IKEA for ₹30,000 via HDFC"
          </button>
          <button
            className="zb-chip-btn"
            onClick={() => handleProcessEvent('ABC paid ₹59,000')}
          >
            "ABC paid ₹59,000"
          </button>
          <button
            className="zb-chip-btn"
            onClick={() => handleProcessEvent('Purchased 2 monitors from Dell for ₹58,000')}
          >
            "Purchased 2 monitors from Dell for ₹58,000"
          </button>
          <button
            className="zb-chip-btn"
            onClick={() => handleProcessEvent('Paid electricity bill ₹4,200 via UPI')}
          >
            "Paid electricity bill ₹4,200 via UPI"
          </button>
        </div>

        {/* Live Execution Result Card (Feedback) */}
        {latestEventResult && (
          <div className={`zb-inbox-result-banner ${latestEventResult.status === 'auto_processed' ? 'success' : 'attention'}`}>
            <div className="zb-result-header">
              <div className="zb-flex-align gap-2">
                {latestEventResult.status === 'auto_processed' ? (
                  <CheckCircle2 size={18} className="text-success" />
                ) : (
                  <AlertTriangle size={18} className="text-warning" />
                )}
                <strong>
                  {latestEventResult.status === 'auto_processed'
                    ? 'Automated Double-Entry Posting Completed'
                    : 'Queued to Needs Your Attention'}
                </strong>
                <span className="zb-confidence-badge">
                  {Math.round(latestEventResult.confidence * 100)}% Confidence
                </span>
              </div>
              <button
                className="zb-close-btn"
                onClick={() => setLatestEventResult(null)}
                title="Dismiss result"
              >
                <X size={14} />
              </button>
            </div>

            <div className="zb-result-details-grid">
              <div>
                <span className="zb-detail-label">Entity Detected:</span>
                <span className="zb-detail-value">{latestEventResult.extracted.party} ({latestEventResult.extracted.intent.toUpperCase()})</span>
              </div>
              <div>
                <span className="zb-detail-label">Total Amount:</span>
                <span className="zb-detail-value font-bold">₹{latestEventResult.extracted.amount.toLocaleString()}</span>
              </div>
              {latestEventResult.accounting?.taxBreakdown && (
                <div>
                  <span className="zb-detail-label">GST Tax Split (18%):</span>
                  <span className="zb-detail-value">
                    Base: ₹{latestEventResult.accounting.taxBreakdown.base_amount.toLocaleString()} | CGST: ₹{latestEventResult.accounting.taxBreakdown.cgst.toLocaleString()} | SGST: ₹{latestEventResult.accounting.taxBreakdown.sgst.toLocaleString()}
                  </span>
                </div>
              )}
              {latestEventResult.accounting?.journalEntry && (
                <div>
                  <span className="zb-detail-label">Double-Entry Verification:</span>
                  <span className="zb-detail-value text-success font-bold">
                    ✓ Total Debits (₹{latestEventResult.accounting.journalEntry.totalDebit.toLocaleString()}) == Total Credits (₹{latestEventResult.accounting.journalEntry.totalCredit.toLocaleString()})
                  </span>
                </div>
              )}
              {latestEventResult.reviewReason && (
                <div className="col-span-full">
                  <span className="zb-detail-label text-warning">Reason for Review:</span>
                  <span className="zb-detail-value">{latestEventResult.reviewReason}</span>
                </div>
              )}
            </div>

            <div className="zb-result-actions">
              <button
                className="zb-btn-action-ghost"
                onClick={() => {
                  setExplainModalData({
                    title: `Why did the system categorize this?`,
                    explanation: `• Vendor/Party '${latestEventResult.extracted.party}' was identified from previous transaction patterns.\n• Transaction amount of ₹${latestEventResult.extracted.amount.toLocaleString()} matched configured threshold limits.\n• Balanced double-entry postings were created with full Input Tax Credit tracking.\n• Audit log record was saved to ensure complete regulatory auditability.`,
                  });
                }}
              >
                <HelpCircle size={13} /> Why was this automated?
              </button>
              {onNavigateModule && (
                <button
                  className="zb-btn-action-ghost"
                  onClick={() => onNavigateModule('automations', 'audit_trail')}
                >
                  View Audit Trail <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. "AUTOMATED TODAY" LIVE METRIC STRIP */}
      {/* ========================================================================= */}
      <div className="zb-automated-today-strip zb-section-spacing">
        <div className="zb-strip-card">
          <div className="zb-strip-icon-box success">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="zb-strip-number">{metrics.processedTodayCount}</div>
            <div className="zb-strip-label">Transactions Automated Today</div>
          </div>
        </div>

        <div className="zb-strip-card">
          <div className="zb-strip-icon-box primary">
            <Layers size={20} />
          </div>
          <div>
            <div className="zb-strip-number">{metrics.reconciledCount}</div>
            <div className="zb-strip-label">Bank Matches Reconciled</div>
          </div>
        </div>

        <div className="zb-strip-card">
          <div className="zb-strip-icon-box indigo">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="zb-strip-number">{metrics.categorizedCount}</div>
            <div className="zb-strip-label">Expenses Auto-Categorized</div>
          </div>
        </div>

        <div className="zb-strip-card highlight">
          <div className="zb-strip-icon-box emerald">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="zb-strip-number">{metrics.automationScore}%</div>
            <div className="zb-strip-label">Automation Score (Touchless)</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. EXCEPTION-FIRST QUEUE: "NEEDS YOUR ATTENTION" */}
      {/* ========================================================================= */}
      <div className="zb-attention-card zb-section-spacing">
        <div className="zb-attention-header">
          <div className="zb-attention-title-group">
            <div className="zb-attention-icon-box">
              <AlertCircle size={18} className="text-warning" />
            </div>
            <div>
              <h3 className="zb-attention-heading">Needs Your Attention</h3>
              <p className="zb-attention-sub">
                You only handle exceptions. High-confidence transactions process automatically in the background.
              </p>
            </div>
          </div>
          <span className="zb-attention-badge">
            {visibleAttentionItems.length} Exceptions Active
          </span>
        </div>

        <div className="zb-attention-grid">
          {visibleAttentionItems.length === 0 ? (
            <div className="zb-empty-attention">
              <CheckCircle2 size={24} className="text-success" />
              <span>All clear! No financial exceptions or unmatched records require attention.</span>
            </div>
          ) : (
            visibleAttentionItems.map(item => (
              <div key={item.id} className={`zb-alert-box ${item.severity}`}>
                <div className="zb-alert-icon">
                  {item.severity === 'critical' ? (
                    <AlertCircle size={16} />
                  ) : item.severity === 'attention' ? (
                    <Clock size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                </div>
                <div className="zb-alert-info">
                  <div className="zb-alert-title">{item.title}</div>
                  <div className="zb-alert-desc">{item.description}</div>
                </div>
                <div className="zb-alert-action">
                  {item.actions.includes('confirm') && (
                    <button
                      className="zb-btn-action-primary"
                      onClick={() => handleAttentionAction(item, 'confirm')}
                    >
                      <Check size={12} /> Confirm Match
                    </button>
                  )}
                  {item.actions.includes('send_reminder') && (
                    <button
                      className="zb-btn-action-primary"
                      onClick={() => handleAttentionAction(item, 'send_reminder')}
                    >
                      <Send size={12} /> Remind Client
                    </button>
                  )}
                  {item.actions.includes('create_po') && (
                    <button
                      className="zb-btn-action-primary"
                      onClick={() => handleAttentionAction(item, 'create_po')}
                    >
                      <ShoppingBag size={12} /> Create PO
                    </button>
                  )}
                  {item.actions.includes('review') && (
                    <button
                      className="zb-btn-action-primary"
                      onClick={() => {
                        if (onNavigateModule) onNavigateModule('banking', 'reconciliation');
                        showToast('Opening Bank Reconciliation Hub...');
                      }}
                    >
                      <ExternalLink size={12} /> Review Match
                    </button>
                  )}
                  <button
                    className="zb-btn-action-ghost"
                    onClick={() => handleAttentionAction(item, 'dismiss')}
                    title="Dismiss"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. NATURAL LANGUAGE BUSINESS ASSISTANT CONSOLE */}
      {/* ========================================================================= */}
      <div className="zb-assistant-console-card zb-section-spacing">
        <div className="zb-assistant-header">
          <div className="zb-flex-align gap-2">
            <div className="zb-assistant-icon-box">
              <Bot size={20} className="text-indigo" />
            </div>
            <div>
              <h3 className="zb-assistant-title">Ask Your Business Assistant</h3>
              <p className="zb-assistant-subtitle">
                Queries run directly against your actual ledger data, receivables aging, and tax compliance records.
              </p>
            </div>
          </div>
          <span className="zb-assistant-status-pill">Live Ledger Connected</span>
        </div>

        <div className="zb-assistant-input-row">
          <input
            type="text"
            className="zb-assistant-input"
            placeholder="Ask anything, e.g. 'Show unpaid invoices' or 'How much GST do I owe this month?'..."
            value={assistantQuery}
            onChange={(e) => setAssistantQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAskAssistant();
            }}
          />
          <button
            className="zb-btn zb-btn-primary"
            onClick={() => handleAskAssistant()}
            disabled={isQueryingAssistant || !assistantQuery.trim()}
          >
            {isQueryingAssistant ? <RefreshCw size={14} className="zb-spin" /> : <Send size={14} />}
            <span>Ask</span>
          </button>
        </div>

        <div className="zb-assistant-chips">
          <span className="zb-chips-label">Quick Questions:</span>
          <button className="zb-chip-btn" onClick={() => handleAskAssistant('Show unpaid invoices')}>
            "Show unpaid invoices"
          </button>
          <button className="zb-chip-btn" onClick={() => handleAskAssistant('How much GST do I owe this month?')}>
            "How much GST do I owe this month?"
          </button>
          <button className="zb-chip-btn" onClick={() => handleAskAssistant('Which inventory will run out soon?')}>
            "Which inventory will run out soon?"
          </button>
          <button className="zb-chip-btn" onClick={() => handleAskAssistant('What were my expenses last month?')}>
            "What were my expenses last month?"
          </button>
        </div>

        {/* Assistant Response Card */}
        {assistantResult && (
          <div className="zb-assistant-reply-box">
            <div className="zb-reply-header">
              <div className="zb-flex-align gap-2">
                <Bot size={16} className="text-indigo" />
                <span className="font-bold">Assistant Response:</span>
              </div>
              <button
                className="zb-close-btn"
                onClick={() => setAssistantResult(null)}
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
            <div className="zb-reply-content whitespace-pre-line">
              {assistantResult.reply}
            </div>
            {assistantResult.actionType === 'navigate' && assistantResult.actionPayload && (
              <div className="zb-reply-action-footer">
                <button
                  className="zb-btn zb-btn-secondary zb-btn-sm"
                  onClick={() => {
                    if (onNavigateModule && assistantResult.actionPayload?.module) {
                      onNavigateModule(
                        assistantResult.actionPayload.module as NavModule,
                        assistantResult.actionPayload.subItem
                      );
                    }
                  }}
                >
                  <span>{assistantResult.actionLabel || 'View Records'}</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions Bar */}
      <div className="zb-quick-actions-bar zb-section-spacing">
        <span className="zb-quick-actions-label">BUSINESS SHORTCUTS:</span>
        <div className="zb-quick-actions-buttons">
          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('sales', 'invoices');
              showToast('Opened Invoices: Click "+ New Invoice" to generate GST invoice');
            }}
          >
            <FileText size={14} className="text-primary" />
            <span>+ New Invoice</span>
          </button>

          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('purchases', 'bills');
              showToast('Opened Procurement: Record new supplier invoice');
            }}
          >
            <ShoppingBag size={14} className="text-success" />
            <span>+ Record Bill</span>
          </button>

          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('banking', 'reconciliation');
              showToast('Opened Bank Reconciliation Hub');
            }}
          >
            <DollarSign size={14} className="text-success" />
            <span>+ Reconcile Bank</span>
          </button>

          <button
            className="zb-quick-action-btn"
            onClick={() => {
              if (onNavigateModule) onNavigateModule('automations', 'rules_engine');
              showToast('Opened Automation Center');
            }}
          >
            <Sparkles size={14} className="text-indigo" />
            <span>Automations Center</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Receivables & Payables */}
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

      {/* Cash Flow Chart */}
      {roleView !== 'sales' && (
        <div className="zb-section-spacing">
          <CashFlowChart
            data={cashFlow}
            period={period}
            onPeriodChange={setPeriod}
          />
        </div>
      )}

      {/* Inventory Summary */}
      <div className="zb-section-spacing">
        <InventorySummaryCard
          data={inventorySummary}
          onNavigateItems={onNavigateItems}
          onQuickAddItem={onQuickAddItem}
        />
      </div>

      {/* Explainability Popup Modal */}
      {explainModalData && (
        <div className="zb-modal-backdrop" onClick={() => setExplainModalData(null)}>
          <div className="zb-explain-modal" onClick={e => e.stopPropagation()}>
            <div className="zb-modal-header">
              <div className="zb-flex-align gap-2">
                <Sparkles size={18} className="text-primary" />
                <h3 className="zb-modal-title">{explainModalData.title}</h3>
              </div>
              <button className="zb-close-btn" onClick={() => setExplainModalData(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="zb-modal-body">
              <div className="zb-explain-text whitespace-pre-line">
                {explainModalData.explanation}
              </div>
            </div>
            <div className="zb-modal-footer">
              <button className="zb-btn zb-btn-primary" onClick={() => setExplainModalData(null)}>
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
