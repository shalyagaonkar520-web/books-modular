/** Comprehensive Financial Dashboard, Analytics, Refunds, Settlements & Reconciliation Hub. */
import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Download,
  Landmark,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import {
  razorpayApi,
  type PaymentRecordItem,
} from '@/api/razorpay';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate } from '@/utils/format';

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This fiscal year' },
  { value: 'custom', label: 'Custom range' },
];

export function FinancialDashboardPage() {
  const toast = useToast();

  // Period State
  const [period, setPeriod] = useState<string>('this_month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'refunds' | 'reconciliation' | 'ledger'>('overview');

  // Sub-tabs data loaders
  const [paymentFilterStatus, setPaymentFilterStatus] = useState<string>('');
  const [reconcileFilterStatus, setReconcileFilterStatus] = useState<string>('');
  const [searchPayment, setSearchPayment] = useState<string>('');

  // Refund Modal State
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedPaymentForRefund, setSelectedPaymentForRefund] = useState<PaymentRecordItem | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('Customer return / refund');
  const [refundSpeed, setRefundSpeed] = useState<string>('normal');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  // Reconciliation Running State
  const [reconciling, setReconciling] = useState(false);

  // Main Dashboard Data Async
  const dashboard = useAsync(
    () =>
      razorpayApi.getFinancialDashboard({
        period,
        start_date: period === 'custom' ? startDate : undefined,
        end_date: period === 'custom' ? endDate : undefined,
      }),
    [period, startDate, endDate],
  );

  // Analytics Async
  const analytics = useAsync(
    () =>
      razorpayApi.getAnalytics({
        start_date: period === 'custom' ? startDate : undefined,
        end_date: period === 'custom' ? endDate : undefined,
      }),
    [period, startDate, endDate],
  );

  // Payments List Async
  const payments = useAsync(
    () =>
      razorpayApi.listPayments({
        status: paymentFilterStatus || undefined,
        page_size: 100,
      }),
    [paymentFilterStatus],
  );

  // Refunds List Async
  const refunds = useAsync(() => razorpayApi.listRefunds({ page_size: 100 }), []);

  // Settlements List Async
  const settlements = useAsync(() => razorpayApi.listSettlements({ page_size: 100 }), []);

  // Reconciliations List Async
  const reconciliations = useAsync(
    () => razorpayApi.listReconciliations({ status: reconcileFilterStatus || undefined, page_size: 100 }),
    [reconcileFilterStatus],
  );

  // Transactions Ledger Async
  const transactions = useAsync(() => razorpayApi.listTransactions({ page_size: 100 }), []);

  const reloadAll = () => {
    dashboard.reload();
    analytics.reload();
    payments.reload();
    refunds.reload();
    settlements.reload();
    reconciliations.reload();
    transactions.reload();
  };

  // Run Three-Way Reconciliation
  const handleRunReconciliation = async () => {
    setReconciling(true);
    try {
      const res = await razorpayApi.reconcile();
      toast.success(`${res.message}: ${res.total_evaluated} records evaluated (${res.discrepancies} discrepancies).`);
      reconciliations.reload();
      settlements.reload();
      dashboard.reload();
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? 'Reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  // Open Refund Modal for a Payment
  const openRefund = (payment: PaymentRecordItem) => {
    setSelectedPaymentForRefund(payment);
    const maxRefundable = Math.max(0, payment.amount - payment.refund_amount);
    setRefundAmount(String(maxRefundable));
    setRefundReason('Customer return / refund');
    setRefundSpeed('normal');
    setRefundError(null);
    setRefundModalOpen(true);
  };

  // Process Refund Submit
  const handleProcessRefund = async () => {
    if (!selectedPaymentForRefund) return;
    const num = parseFloat(refundAmount);
    const maxRefundable = selectedPaymentForRefund.amount - selectedPaymentForRefund.refund_amount;
    if (isNaN(num) || num <= 0 || num > maxRefundable) {
      setRefundError(`Enter a valid refund amount between ₹1 and ₹${maxRefundable.toFixed(2)}.`);
      return;
    }

    setRefundSubmitting(true);
    setRefundError(null);
    try {
      const res = await razorpayApi.createRefund({
        payment_id: selectedPaymentForRefund.id,
        amount: num,
        reason: refundReason,
        speed: refundSpeed,
      });
      toast.success(`Refund of ${formatCurrency(res.refund_amount)} issued successfully!`);
      setRefundModalOpen(false);
      reloadAll();
    } catch (err: unknown) {
      setRefundError((err as Error)?.message ?? 'Refund request failed.');
    } finally {
      setRefundSubmitting(false);
    }
  };

  // Export CSV Handler
  const handleExport = (type: string) => {
    try {
      razorpayApi.exportReport(type, startDate || undefined, endDate || undefined);
      toast.success(`Downloading ${type} report CSV...`);
    } catch {
      toast.error('Failed to export report');
    }
  };

  // Filtered Payments Table
  const filteredPayments = useMemo(() => {
    const list = payments.data?.items ?? [];
    if (!searchPayment.trim()) return list;
    const q = searchPayment.toLowerCase();
    return list.filter(
      (p) =>
        p.razorpay_payment_id.toLowerCase().includes(q) ||
        (p.invoice_number && p.invoice_number.toLowerCase().includes(q)) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(q)),
    );
  }, [payments.data, searchPayment]);

  const cards = dashboard.data?.top_cards;
  const cashFlow = dashboard.data?.cash_flow;

  return (
    <>
      <PageHeader
        title="Financial Hub & Razorpay Gateway"
        subtitle="End-to-end payment operations, automated reconciliation, fee accounting, and cash flow analysis"
        breadcrumb={['Finance', 'Financial Hub']}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#2563eb',
                background: 'rgba(37, 99, 235, 0.1)',
                padding: '0.25rem 0.625rem',
                borderRadius: '4px',
                border: '1px solid rgba(37, 99, 235, 0.2)',
              }}
            >
              <ShieldCheck size={14} />
              <span>TEST MODE (Ready for Live)</span>
            </div>

            <Button icon={<RefreshCw size={14} />} onClick={reloadAll} variant="secondary">
              Refresh
            </Button>

            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Button icon={<Download size={14} />} variant="secondary" onClick={() => handleExport('payments')}>
                Export CSV
              </Button>
            </div>
          </div>
        }
      />

      <div className="stack" style={{ gap: '1.25rem' }}>
        {/* Period Selector Filter Bar */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="detail-label" style={{ margin: 0 }}>
                Period:
              </span>
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`button ${period === opt.value ? 'is-primary' : 'is-secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                    onClick={() => setPeriod(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {period === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TextField label="Start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <TextField label="End" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
        </Card>

        {dashboard.loading && !dashboard.data ? (
          <LoadingBlock label="Loading financial data..." />
        ) : dashboard.error ? (
          <ErrorBlock message={dashboard.error} onRetry={dashboard.reload} />
        ) : cards && cashFlow ? (
          <>
            {/* Top 6 KPI Cards */}
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">Gross Revenue</span>
                  <ArrowUpRight size={18} style={{ color: '#16a34a' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.total_revenue)}</div>
                <div className="stat-tile-footer">Invoices billed in period</div>
              </div>

              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">Total Expenses</span>
                  <ArrowDownRight size={18} style={{ color: '#d97706' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.total_expenses)}</div>
                <div className="stat-tile-footer">Operating & gateway costs</div>
              </div>

              <div className="stat-tile" style={{ borderLeft: `3px solid ${cards.net_profit >= 0 ? '#16a34a' : '#dc2626'}` }}>
                <div className="stat-tile-header">
                  <span className="stat-tile-label">Net Profit</span>
                  {cards.net_profit >= 0 ? <TrendingUp size={18} style={{ color: '#16a34a' }} /> : <TrendingDown size={18} style={{ color: '#dc2626' }} />}
                </div>
                <div className="stat-tile-value" style={{ color: cards.net_profit >= 0 ? '#16a34a' : '#dc2626' }}>
                  {formatCurrency(cards.net_profit)}
                </div>
                <div className="stat-tile-footer">Revenue - Refunds - Expenses</div>
              </div>

              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">Gateway Fees</span>
                  <CreditCard size={18} style={{ color: '#6366f1' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.payment_gateway_fees)}</div>
                <div className="stat-tile-footer">Tracked under Bank Fees (6100)</div>
              </div>

              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">Total Refunds</span>
                  <RotateCcw size={18} style={{ color: '#9333ea' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.total_refunds)}</div>
                <div className="stat-tile-footer">Returns & reversals</div>
              </div>

              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">Net Settlements</span>
                  <Landmark size={18} style={{ color: '#0284c7' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.total_settlements)}</div>
                <div className="stat-tile-footer">Disbursed to Bank Account</div>
              </div>
            </div>

            {/* Cash Flow Analysis Bar */}
            <Card title="Cash Flow Tracker" subtitle="Actual liquidity movement into and out of operating bank accounts">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '1rem' }}>
                <div
                  style={{
                    padding: '1rem',
                    background: 'rgba(22, 163, 74, 0.06)',
                    borderRadius: '8px',
                    border: '1px solid rgba(22, 163, 74, 0.2)',
                  }}
                >
                  <span className="detail-label" style={{ color: '#16a34a' }}>
                    Money In (Collections)
                  </span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#16a34a' }}>{formatCurrency(cashFlow.money_in)}</div>
                  <span className="small text-muted">Customer payments received</span>
                </div>

                <div
                  style={{
                    padding: '1rem',
                    background: 'rgba(220, 38, 38, 0.06)',
                    borderRadius: '8px',
                    border: '1px solid rgba(220, 38, 38, 0.2)',
                  }}
                >
                  <span className="detail-label" style={{ color: '#dc2626' }}>
                    Money Out (Disbursements)
                  </span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(cashFlow.money_out)}</div>
                  <span className="small text-muted">Expenses + Refunds paid</span>
                </div>

                <div
                  style={{
                    padding: '1rem',
                    background: cashFlow.net_cash_flow >= 0 ? 'rgba(37, 99, 235, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                    borderRadius: '8px',
                    border: `1px solid ${cashFlow.net_cash_flow >= 0 ? 'rgba(37, 99, 235, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                  }}
                >
                  <span className="detail-label" style={{ color: cashFlow.net_cash_flow >= 0 ? '#2563eb' : '#dc2626' }}>
                    Net Cash Flow
                  </span>
                  <div
                    style={{
                      fontSize: '1.35rem',
                      fontWeight: 700,
                      color: cashFlow.net_cash_flow >= 0 ? '#2563eb' : '#dc2626',
                    }}
                  >
                    {formatCurrency(cashFlow.net_cash_flow)}
                  </div>
                  <span className="small text-muted">Money In minus Money Out</span>
                </div>
              </div>

              {/* Visual Performance Progression */}
              {dashboard.data?.chart_data && dashboard.data.chart_data.length > 0 && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '1.25rem' }}>
                  <span className="detail-label">Period Timeline Breakdown</span>
                  <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
                    <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th>Interval</th>
                          <th style={{ textAlign: 'right' }}>Revenue</th>
                          <th style={{ textAlign: 'right' }}>Expenses</th>
                          <th style={{ textAlign: 'right' }}>Refunds</th>
                          <th style={{ textAlign: 'right' }}>Net Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.data.chart_data.map((c, idx) => (
                          <tr key={idx}>
                            <td>{c.label}</td>
                            <td style={{ textAlign: 'right', color: '#16a34a' }}>{formatCurrency(c.revenue)}</td>
                            <td style={{ textAlign: 'right', color: '#d97706' }}>{formatCurrency(c.expenses)}</td>
                            <td style={{ textAlign: 'right', color: '#9333ea' }}>{formatCurrency(c.refunds)}</td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontWeight: 600,
                                color: c.profit >= 0 ? '#16a34a' : '#dc2626',
                              }}
                            >
                              {formatCurrency(c.profit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          </>
        ) : null}

        {/* Tabbed Interactive Operations */}
        <div style={{ borderBottom: '1px solid var(--border-color, #e2e8f0)', display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '0.625rem 1rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              borderBottom: activeTab === 'overview' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'overview' ? '#2563eb' : 'inherit',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Analytics & Methods
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => setActiveTab('payments')}
            style={{
              padding: '0.625rem 1rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              borderBottom: activeTab === 'payments' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'payments' ? '#2563eb' : 'inherit',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Payments Hub ({payments.data?.total ?? 0})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'refunds' ? 'active' : ''}`}
            onClick={() => setActiveTab('refunds')}
            style={{
              padding: '0.625rem 1rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              borderBottom: activeTab === 'refunds' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'refunds' ? '#2563eb' : 'inherit',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Refund Management ({refunds.data?.total ?? 0})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'reconciliation' ? 'active' : ''}`}
            onClick={() => setActiveTab('reconciliation')}
            style={{
              padding: '0.625rem 1rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              borderBottom: activeTab === 'reconciliation' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'reconciliation' ? '#2563eb' : 'inherit',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Reconciliation & Settlements
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
            onClick={() => setActiveTab('ledger')}
            style={{
              padding: '0.625rem 1rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              borderBottom: activeTab === 'ledger' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'ledger' ? '#2563eb' : 'inherit',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            Financial Audit Ledger
          </button>
        </div>

        {/* TAB 1: Analytics & Methods */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            <Card title="Gateway Performance Rates">
              {analytics.loading && !analytics.data ? (
                <LoadingBlock />
              ) : analytics.data ? (
                <div className="stack" style={{ gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div style={{ padding: '1rem', background: 'rgba(22, 163, 74, 0.08)', borderRadius: '8px', textAlign: 'center' }}>
                      <span className="small text-muted">Success Rate</span>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a' }}>{analytics.data.success_rate}%</div>
                      <span className="small">{analytics.data.successful_count} payments captured</span>
                    </div>
                    <div style={{ padding: '1rem', background: 'rgba(220, 38, 38, 0.08)', borderRadius: '8px', textAlign: 'center' }}>
                      <span className="small text-muted">Failure Rate</span>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#dc2626' }}>{analytics.data.failure_rate}%</div>
                      <span className="small">{analytics.data.failed_count} payments declined</span>
                    </div>
                  </div>

                  <div>
                    <span className="detail-label">Payment Volume Summary</span>
                    <div className="detail-grid" style={{ marginTop: '0.5rem' }}>
                      <div className="detail-item">
                        <dt>Total Captured</dt>
                        <dd className="strong" style={{ color: '#16a34a' }}>
                          {formatCurrency(analytics.data.total_captured_value)}
                        </dd>
                      </div>
                      <div className="detail-item">
                        <dt>Total Refunded</dt>
                        <dd className="strong" style={{ color: '#9333ea' }}>
                          {formatCurrency(analytics.data.total_refunded_value)}
                        </dd>
                      </div>
                      <div className="detail-item">
                        <dt>Total Gateway Fees</dt>
                        <dd className="strong" style={{ color: '#6366f1' }}>
                          {formatCurrency(analytics.data.total_fees_paid)}
                        </dd>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card title="Payment Methods Breakdown">
              {analytics.data?.methods_breakdown && analytics.data.methods_breakdown.length > 0 ? (
                <div className="stack" style={{ gap: '1rem' }}>
                  {analytics.data.methods_breakdown.map((m) => (
                    <div key={m.method} className="stack" style={{ gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span className="strong" style={{ textTransform: 'uppercase' }}>
                          {m.method}
                        </span>
                        <span>
                          {formatCurrency(m.value)} ({m.count} txns · {m.percentage}%)
                        </span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--bg-subtle, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(2, m.percentage))}%`,
                            height: '100%',
                            background: m.method === 'upi' ? '#16a34a' : m.method === 'card' ? '#2563eb' : '#8b5cf6',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No transactions yet" description="Payment methods will populate as transactions are processed." />
              )}
            </Card>
          </div>
        )}

        {/* TAB 2: Payments Hub */}
        {activeTab === 'payments' && (
          <Card
            title="Razorpay Payment Transactions"
            subtitle="Live status, fees, and customer invoices"
            actions={
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search payment ID, invoice..."
                  value={searchPayment}
                  onChange={(e) => setSearchPayment(e.target.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-card, #fff)',
                    fontSize: '0.85rem',
                  }}
                />
                <select
                  value={paymentFilterStatus}
                  onChange={(e) => setPaymentFilterStatus(e.target.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    background: 'var(--bg-card, #fff)',
                  }}
                >
                  <option value="">All Statuses</option>
                  <option value="captured">Captured</option>
                  <option value="partially_refunded">Partially Refunded</option>
                  <option value="refunded">Refunded</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            }
          >
            {payments.loading && !payments.data ? (
              <LoadingBlock />
            ) : !filteredPayments.length ? (
              <EmptyState title="No payments found" description="Payments processed through Razorpay will appear here." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Payment ID</th>
                      <th>Date</th>
                      <th>Customer & Invoice</th>
                      <th>Method</th>
                      <th style={{ textAlign: 'right' }}>Gross Amount</th>
                      <th style={{ textAlign: 'right' }}>Fee + GST</th>
                      <th style={{ textAlign: 'right' }}>Net Payout</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((p) => {
                      const canRefund = p.payment_status === 'captured' || (p.payment_status === 'partially_refunded' && p.amount > p.refund_amount);
                      return (
                        <tr key={p.id}>
                          <td>
                            <span className="cell-stack">
                              <span className="mono strong">{p.razorpay_payment_id}</span>
                              {p.razorpay_order_id && <small className="text-muted">{p.razorpay_order_id}</small>}
                            </span>
                          </td>
                          <td>{formatDate(p.created_at)}</td>
                          <td>
                            <span className="cell-stack">
                              <span>{p.customer_name || 'Customer'}</span>
                              <small className="mono">{p.invoice_number || '—'}</small>
                            </span>
                          </td>
                          <td>
                            <Badge tone="neutral">{p.payment_method?.toUpperCase() || 'CARD'}</Badge>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(p.amount)}</td>
                          <td style={{ textAlign: 'right', color: '#6366f1' }}>
                            {formatCurrency(p.razorpay_fee + p.tax_on_fee)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>
                            {formatCurrency(p.net_settlement)}
                          </td>
                          <td>
                            <Badge
                              tone={
                                p.payment_status === 'captured'
                                  ? 'success'
                                  : p.payment_status.includes('refund')
                                  ? 'info'
                                  : 'danger'
                              }
                            >
                              {p.payment_status.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {canRefund ? (
                              <Button
                                variant="secondary"
                                icon={<RotateCcw size={12} />}
                                onClick={() => openRefund(p)}
                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                              >
                                Refund
                              </Button>
                            ) : (
                              <span className="text-muted small">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* TAB 3: Refund Management */}
        {activeTab === 'refunds' && (
          <Card
            title="Refund Operations & History"
            subtitle="Track partial and full returns with automatic general ledger revenue adjustment"
            actions={
              <Button icon={<Download size={14} />} variant="secondary" onClick={() => handleExport('refunds')}>
                Export Refunds CSV
              </Button>
            }
          >
            {refunds.loading && !refunds.data ? (
              <LoadingBlock />
            ) : !refunds.data?.items.length ? (
              <EmptyState title="No refunds recorded" description="When refunds are issued, they will be listed here with audit timestamps." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Refund ID</th>
                      <th>Payment ID</th>
                      <th>Refund Date</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Reason</th>
                      <th>Speed</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.data.items.map((r) => (
                      <tr key={r.id}>
                        <td className="mono strong">{r.razorpay_refund_id}</td>
                        <td className="mono">{r.razorpay_payment_id}</td>
                        <td>{formatDate(r.refund_date)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#9333ea' }}>{formatCurrency(r.amount)}</td>
                        <td>{r.reason}</td>
                        <td>
                          <Badge tone="neutral">{r.speed.toUpperCase()}</Badge>
                        </td>
                        <td>
                          <Badge tone={r.status === 'processed' ? 'success' : 'warning'}>{r.status.toUpperCase()}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* TAB 4: Reconciliation & Settlements */}
        {activeTab === 'reconciliation' && (
          <div className="stack" style={{ gap: '1.25rem' }}>
            <Card
              title="Three-Way Reconciliation Engine"
              subtitle="Compares internal Customer Payments, Razorpay Gateway records, and Bank Settlements"
              actions={
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    value={reconcileFilterStatus}
                    onChange={(e) => setReconcileFilterStatus(e.target.value)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #cbd5e1)',
                      background: 'var(--bg-card, #fff)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <option value="">All Reconciliations</option>
                    <option value="matched">Matched Only</option>
                    <option value="mismatch">Mismatches</option>
                    <option value="missing_settlement">Missing Settlement</option>
                    <option value="duplicate">Duplicates</option>
                  </select>
                  <Button
                    variant="primary"
                    icon={<RefreshCw size={14} className={reconciling ? 'spin' : ''} />}
                    onClick={handleRunReconciliation}
                    disabled={reconciling}
                  >
                    {reconciling ? 'Reconciling...' : 'Run Reconciliation'}
                  </Button>
                </div>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ padding: '0.875rem', background: 'rgba(22, 163, 74, 0.08)', borderRadius: '6px' }}>
                  <span className="small text-muted">Matched Transactions</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#16a34a' }}>
                    {reconciliations.data?.items.filter((r) => r.status === 'matched').length ?? 0}
                  </div>
                  <span className="small text-muted">100% matched with books</span>
                </div>
                <div style={{ padding: '0.875rem', background: 'rgba(220, 38, 38, 0.08)', borderRadius: '6px' }}>
                  <span className="small text-muted">Discrepancies / Pending</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#dc2626' }}>
                    {reconciliations.data?.items.filter((r) => r.status !== 'matched').length ?? 0}
                  </div>
                  <span className="small text-muted">Needs review or pending T+2</span>
                </div>
              </div>

              {reconciliations.loading && !reconciliations.data ? (
                <LoadingBlock />
              ) : !reconciliations.data?.items.length ? (
                <EmptyState
                  title="No reconciliation data"
                  description="Click 'Run Reconciliation' to match internal payments against gateway logs."
                />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Payment ID</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Expected</th>
                        <th style={{ textAlign: 'right' }}>Actual</th>
                        <th style={{ textAlign: 'right' }}>Diff</th>
                        <th>Reconciliation Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliations.data.items.map((rec) => (
                        <tr key={rec.id}>
                          <td>{formatDate(rec.reconciliation_date)}</td>
                          <td className="mono">{rec.razorpay_payment_id}</td>
                          <td>
                            <Badge tone={rec.status === 'matched' ? 'success' : 'danger'}>
                              {rec.status.toUpperCase()}
                            </Badge>
                          </td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(rec.amount_expected)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(rec.amount_actual)}</td>
                          <td style={{ textAlign: 'right', color: rec.difference > 0 ? '#dc2626' : 'inherit' }}>
                            {formatCurrency(rec.difference)}
                          </td>
                          <td className="small text-muted">{rec.discrepancy_note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card
              title="Bank Settlements Log"
              subtitle="Payout batches received into organization bank accounts from Razorpay"
              actions={
                <Button icon={<Download size={14} />} variant="secondary" onClick={() => handleExport('settlements')}>
                  Export Settlements CSV
                </Button>
              }
            >
              {settlements.loading && !settlements.data ? (
                <LoadingBlock />
              ) : !settlements.data?.items.length ? (
                <EmptyState title="No settlements recorded" description="Settlement batches from Razorpay will appear here." />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Settlement ID</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Gross</th>
                        <th style={{ textAlign: 'right' }}>Fee + Tax</th>
                        <th style={{ textAlign: 'right' }}>Net Disbursed</th>
                        <th>Bank UTR Reference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.data.items.map((s) => (
                        <tr key={s.id}>
                          <td className="mono strong">{s.settlement_id}</td>
                          <td>{formatDate(s.settlement_date)}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(s.gross_amount)}</td>
                          <td style={{ textAlign: 'right', color: '#6366f1' }}>{formatCurrency(s.fee_amount + s.tax_amount)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{formatCurrency(s.net_amount)}</td>
                          <td className="mono small">{s.bank_reference || '—'}</td>
                          <td>
                            <Badge tone={s.status === 'processed' ? 'success' : 'neutral'}>{s.status.toUpperCase()}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 5: Financial Audit Ledger */}
        {activeTab === 'ledger' && (
          <Card
            title="Granular Financial Transaction Audit Trail"
            subtitle="Searchable and filterable ledger of double-entry postings"
            actions={
              <Button icon={<Download size={14} />} variant="secondary" onClick={() => handleExport('ledger')}>
                Export Ledger CSV
              </Button>
            }
          >
            {transactions.loading && !transactions.data ? (
              <LoadingBlock />
            ) : !transactions.data?.items.length ? (
              <EmptyState title="No transactions recorded" description="Financial transactions will show here as entries are posted." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>TXN ID</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Account</th>
                      <th style={{ textAlign: 'right' }}>Debit</th>
                      <th style={{ textAlign: 'right' }}>Credit</th>
                      <th style={{ textAlign: 'right' }}>Net Amount</th>
                      <th>Description</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.data.items.map((t) => (
                      <tr key={t.id}>
                        <td className="mono strong">{t.transaction_id}</td>
                        <td>{formatDate(t.date)}</td>
                        <td>
                          <Badge tone="neutral">{t.transaction_type.toUpperCase()}</Badge>
                        </td>
                        <td>{t.account}</td>
                        <td style={{ textAlign: 'right' }}>{t.debit > 0 ? formatCurrency(t.debit) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{t.credit > 0 ? formatCurrency(t.credit) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(t.amount)}</td>
                        <td className="small text-muted">{t.description}</td>
                        <td>
                          <Badge tone="success">{t.status.toUpperCase()}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Modal: Initiate Refund */}
      {selectedPaymentForRefund && (
        <Modal
          open={refundModalOpen}
          onClose={refundSubmitting ? () => {} : () => setRefundModalOpen(false)}
          title="Initiate Razorpay Refund"
          subtitle={`Process partial or full return for Payment ${selectedPaymentForRefund.razorpay_payment_id}`}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setRefundModalOpen(false)} disabled={refundSubmitting}>
                Cancel
              </Button>
              <Button variant="danger" icon={<RotateCcw size={14} />} onClick={handleProcessRefund} disabled={refundSubmitting}>
                {refundSubmitting ? 'Submitting Refund...' : `Confirm Refund of ${refundAmount ? formatCurrency(parseFloat(refundAmount) || 0) : ''}`}
              </Button>
            </>
          }
        >
          <div className="stack" style={{ gap: '1rem' }}>
            <FormError message={refundError} />

            <div
              style={{
                background: 'var(--bg-subtle, #f8fafc)',
                padding: '0.875rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e2e8f0)',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.5rem',
              }}
            >
              <div>
                <span className="small text-muted" style={{ display: 'block' }}>
                  Original Paid
                </span>
                <span className="strong">{formatCurrency(selectedPaymentForRefund.amount)}</span>
              </div>
              <div>
                <span className="small text-muted" style={{ display: 'block' }}>
                  Remaining Refundable
                </span>
                <span className="strong" style={{ color: '#16a34a' }}>
                  {formatCurrency(selectedPaymentForRefund.amount - selectedPaymentForRefund.refund_amount)}
                </span>
              </div>
              <div>
                <span className="small text-muted" style={{ display: 'block' }}>
                  Customer
                </span>
                <span>{selectedPaymentForRefund.customer_name || '—'}</span>
              </div>
              <div>
                <span className="small text-muted" style={{ display: 'block' }}>
                  Invoice
                </span>
                <span className="mono">{selectedPaymentForRefund.invoice_number || '—'}</span>
              </div>
            </div>

            <TextField
              label="Refund Amount (INR)"
              type="number"
              step="0.01"
              min="1"
              max={selectedPaymentForRefund.amount - selectedPaymentForRefund.refund_amount}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              hint="You can enter a partial amount or the entire remaining balance."
              required
            />

            <TextField
              label="Reason for Refund"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. Order cancelled, defective item return"
              required
            />

            <SelectField
              label="Refund Processing Speed"
              value={refundSpeed}
              onChange={(e) => setRefundSpeed(e.target.value)}
              options={[
                { value: 'normal', label: 'Normal (Standard banking window 5-7 business days)' },
                { value: 'optimum', label: 'Optimum (Instant refund via Razorpay when supported)' },
              ]}
            />

            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted, #64748b)',
                background: 'rgba(220, 38, 38, 0.05)',
                padding: '0.625rem',
                borderRadius: '6px',
                border: '1px solid rgba(220, 38, 38, 0.15)',
              }}
            >
              <AlertCircle size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
              <span>
                Processing this refund will automatically adjust the customer invoice balance and post a revenue adjustment entry in your
                General Ledger.
              </span>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
