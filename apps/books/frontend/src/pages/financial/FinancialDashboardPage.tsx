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
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate } from '@/utils/format';

// Labels are app-content keys, resolved with t() at render.
const PERIOD_OPTIONS = [
  { value: 'today', labelKey: 'financialHub.period.today' },
  { value: 'this_week', labelKey: 'financialHub.period.thisWeek' },
  { value: 'this_month', labelKey: 'financialHub.period.thisMonth' },
  { value: 'last_month', labelKey: 'financialHub.period.lastMonth' },
  { value: 'this_quarter', labelKey: 'financialHub.period.thisQuarter' },
  { value: 'this_year', labelKey: 'financialHub.period.thisYear' },
  { value: 'custom', labelKey: 'financialHub.period.custom' },
];

export function FinancialDashboardPage() {
  const { t } = useAppContent();
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
  const [refundReason, setRefundReason] = useState<string>(() => t('financialHub.refund.defaultReason'));
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
      toast.success(t('financialHub.toast.reconciled', { message: res.message, count: res.total_evaluated, discrepancies: res.discrepancies }));
      reconciliations.reload();
      settlements.reload();
      dashboard.reload();
    } catch (err: unknown) {
      toast.error((err as Error)?.message ?? t('financialHub.toast.reconcileFailed'));
    } finally {
      setReconciling(false);
    }
  };

  // Open Refund Modal for a Payment
  const openRefund = (payment: PaymentRecordItem) => {
    setSelectedPaymentForRefund(payment);
    const maxRefundable = Math.max(0, payment.amount - payment.refund_amount);
    setRefundAmount(String(maxRefundable));
    setRefundReason(t('financialHub.refund.defaultReason'));
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
      setRefundError(t('financialHub.refund.error.invalidAmount', { max: maxRefundable.toFixed(2) }));
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
      toast.success(t('financialHub.toast.refundIssued', { amount: formatCurrency(res.refund_amount) }));
      setRefundModalOpen(false);
      reloadAll();
    } catch (err: unknown) {
      setRefundError((err as Error)?.message ?? t('financialHub.refund.error.failed'));
    } finally {
      setRefundSubmitting(false);
    }
  };

  // Export CSV Handler
  const handleExport = (type: string) => {
    try {
      razorpayApi.exportReport(type, startDate || undefined, endDate || undefined);
      toast.success(t('financialHub.toast.downloading', { type }));
    } catch {
      toast.error(t('financialHub.toast.exportFailed'));
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
        title={t('financialHub.title')}
        subtitle={t('financialHub.subtitle')}
        breadcrumb={[t('financialHub.breadcrumb.finance'), t('financialHub.breadcrumb.hub')]}
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
              <span>{t('financialHub.testMode')}</span>
            </div>

            <Button icon={<RefreshCw size={14} />} onClick={reloadAll} variant="secondary">
              {t('financialHub.refresh')}
            </Button>

            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Button icon={<Download size={14} />} variant="secondary" onClick={() => handleExport('payments')}>
                {t('financialHub.export')}
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
                {t('financialHub.period.label')}
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
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {period === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <TextField label={t('financialHub.period.start')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <TextField label={t('financialHub.period.end')} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
        </Card>

        {dashboard.loading && !dashboard.data ? (
          <LoadingBlock label={t('financialHub.loading')} />
        ) : dashboard.error ? (
          <ErrorBlock message={dashboard.error} onRetry={dashboard.reload} />
        ) : cards && cashFlow ? (
          <>
            {/* Top 6 KPI Cards */}
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">{t('financialHub.kpi.revenue')}</span>
                  <ArrowUpRight size={18} style={{ color: '#16a34a' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.total_revenue)}</div>
                <div className="stat-tile-footer">{t('financialHub.kpi.revenueSub')}</div>
              </div>

              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">{t('financialHub.kpi.expenses')}</span>
                  <ArrowDownRight size={18} style={{ color: '#d97706' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.total_expenses)}</div>
                <div className="stat-tile-footer">{t('financialHub.kpi.expensesSub')}</div>
              </div>

              <div className="stat-tile" style={{ borderLeft: `3px solid ${cards.net_profit >= 0 ? '#16a34a' : '#dc2626'}` }}>
                <div className="stat-tile-header">
                  <span className="stat-tile-label">{t('financialHub.kpi.profit')}</span>
                  {cards.net_profit >= 0 ? <TrendingUp size={18} style={{ color: '#16a34a' }} /> : <TrendingDown size={18} style={{ color: '#dc2626' }} />}
                </div>
                <div className="stat-tile-value" style={{ color: cards.net_profit >= 0 ? '#16a34a' : '#dc2626' }}>
                  {formatCurrency(cards.net_profit)}
                </div>
                <div className="stat-tile-footer">{t('financialHub.kpi.profitSub')}</div>
              </div>

              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">{t('financialHub.kpi.fees')}</span>
                  <CreditCard size={18} style={{ color: '#6366f1' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.payment_gateway_fees)}</div>
                <div className="stat-tile-footer">{t('financialHub.kpi.feesSub')}</div>
              </div>

              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">{t('financialHub.kpi.refunds')}</span>
                  <RotateCcw size={18} style={{ color: '#9333ea' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.total_refunds)}</div>
                <div className="stat-tile-footer">{t('financialHub.kpi.refundsSub')}</div>
              </div>

              <div className="stat-tile">
                <div className="stat-tile-header">
                  <span className="stat-tile-label">{t('financialHub.kpi.settlements')}</span>
                  <Landmark size={18} style={{ color: '#0284c7' }} />
                </div>
                <div className="stat-tile-value">{formatCurrency(cards.total_settlements)}</div>
                <div className="stat-tile-footer">{t('financialHub.kpi.settlementsSub')}</div>
              </div>
            </div>

            {/* Cash Flow Analysis Bar */}
            <Card title={t('financialHub.cashFlow.title')} subtitle={t('financialHub.cashFlow.subtitle')}>
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
                    {t('financialHub.cashFlow.in')}
                  </span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#16a34a' }}>{formatCurrency(cashFlow.money_in)}</div>
                  <span className="small text-muted">{t('financialHub.cashFlow.inSub')}</span>
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
                    {t('financialHub.cashFlow.out')}
                  </span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(cashFlow.money_out)}</div>
                  <span className="small text-muted">{t('financialHub.cashFlow.outSub')}</span>
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
                    {t('financialHub.cashFlow.net')}
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
                  <span className="small text-muted">{t('financialHub.cashFlow.netSub')}</span>
                </div>
              </div>

              {/* Visual Performance Progression */}
              {dashboard.data?.chart_data && dashboard.data.chart_data.length > 0 && (
                <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color, #e2e8f0)', paddingTop: '1.25rem' }}>
                  <span className="detail-label">{t('financialHub.timeline.title')}</span>
                  <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
                    <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th>{t('financialHub.timeline.col.interval')}</th>
                          <th style={{ textAlign: 'right' }}>{t('financialHub.timeline.col.revenue')}</th>
                          <th style={{ textAlign: 'right' }}>{t('financialHub.timeline.col.expenses')}</th>
                          <th style={{ textAlign: 'right' }}>{t('financialHub.timeline.col.refunds')}</th>
                          <th style={{ textAlign: 'right' }}>{t('financialHub.timeline.col.margin')}</th>
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
            {t('financialHub.tab.overview')}
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
            {t('financialHub.tab.payments', { count: payments.data?.total ?? 0 })}
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
            {t('financialHub.tab.refunds', { count: refunds.data?.total ?? 0 })}
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
            {t('financialHub.tab.reconciliation')}
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
            {t('financialHub.tab.ledger')}
          </button>
        </div>

        {/* TAB 1: Analytics & Methods */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            <Card title={t('financialHub.analytics.title')}>
              {analytics.loading && !analytics.data ? (
                <LoadingBlock />
              ) : analytics.data ? (
                <div className="stack" style={{ gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                    <div style={{ padding: '1rem', background: 'rgba(22, 163, 74, 0.08)', borderRadius: '8px', textAlign: 'center' }}>
                      <span className="small text-muted">{t('financialHub.analytics.successRate')}</span>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a' }}>{analytics.data.success_rate}%</div>
                      <span className="small">{t('financialHub.analytics.captured', { count: analytics.data.successful_count })}</span>
                    </div>
                    <div style={{ padding: '1rem', background: 'rgba(220, 38, 38, 0.08)', borderRadius: '8px', textAlign: 'center' }}>
                      <span className="small text-muted">{t('financialHub.analytics.failureRate')}</span>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#dc2626' }}>{analytics.data.failure_rate}%</div>
                      <span className="small">{t('financialHub.analytics.declined', { count: analytics.data.failed_count })}</span>
                    </div>
                  </div>

                  <div>
                    <span className="detail-label">{t('financialHub.analytics.volume')}</span>
                    <div className="detail-grid" style={{ marginTop: '0.5rem' }}>
                      <div className="detail-item">
                        <dt>{t('financialHub.analytics.totalCaptured')}</dt>
                        <dd className="strong" style={{ color: '#16a34a' }}>
                          {formatCurrency(analytics.data.total_captured_value)}
                        </dd>
                      </div>
                      <div className="detail-item">
                        <dt>{t('financialHub.analytics.totalRefunded')}</dt>
                        <dd className="strong" style={{ color: '#9333ea' }}>
                          {formatCurrency(analytics.data.total_refunded_value)}
                        </dd>
                      </div>
                      <div className="detail-item">
                        <dt>{t('financialHub.analytics.totalFees')}</dt>
                        <dd className="strong" style={{ color: '#6366f1' }}>
                          {formatCurrency(analytics.data.total_fees_paid)}
                        </dd>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>

            <Card title={t('financialHub.methods.title')}>
              {analytics.data?.methods_breakdown && analytics.data.methods_breakdown.length > 0 ? (
                <div className="stack" style={{ gap: '1rem' }}>
                  {analytics.data.methods_breakdown.map((m) => (
                    <div key={m.method} className="stack" style={{ gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span className="strong" style={{ textTransform: 'uppercase' }}>
                          {m.method}
                        </span>
                        <span>
                          {t('financialHub.methods.row', { value: formatCurrency(m.value), count: m.count, percent: m.percentage })}
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
                <EmptyState title={t('financialHub.methods.empty.title')} description={t('financialHub.methods.empty.body')} />
              )}
            </Card>
          </div>
        )}

        {/* TAB 2: Payments Hub */}
        {activeTab === 'payments' && (
          <Card
            title={t('financialHub.payments.title')}
            subtitle={t('financialHub.payments.subtitle')}
            actions={
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder={t('financialHub.payments.search')}
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
                  <option value="">{t('financialHub.payments.filter.all')}</option>
                  <option value="captured">{t('financialHub.payments.filter.captured')}</option>
                  <option value="partially_refunded">{t('financialHub.payments.filter.partiallyRefunded')}</option>
                  <option value="refunded">{t('financialHub.payments.filter.refunded')}</option>
                  <option value="failed">{t('financialHub.payments.filter.failed')}</option>
                </select>
              </div>
            }
          >
            {payments.loading && !payments.data ? (
              <LoadingBlock />
            ) : !filteredPayments.length ? (
              <EmptyState title={t('financialHub.payments.empty.title')} description={t('financialHub.payments.empty.body')} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>{t('financialHub.col.paymentId')}</th>
                      <th>{t('financialHub.col.date')}</th>
                      <th>{t('financialHub.payments.col.customerInvoice')}</th>
                      <th>{t('financialHub.payments.col.method')}</th>
                      <th style={{ textAlign: 'right' }}>{t('financialHub.payments.col.gross')}</th>
                      <th style={{ textAlign: 'right' }}>{t('financialHub.payments.col.fee')}</th>
                      <th style={{ textAlign: 'right' }}>{t('financialHub.payments.col.net')}</th>
                      <th>{t('financialHub.col.status')}</th>
                      <th style={{ textAlign: 'right' }}>{t('financialHub.payments.col.actions')}</th>
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
                              <span>{p.customer_name || t('financialHub.payments.customerFallback')}</span>
                              <small className="mono">{p.invoice_number || '—'}</small>
                            </span>
                          </td>
                          <td>
                            <Badge tone="neutral">{p.payment_method?.toUpperCase() || t('financialHub.payments.methodFallback')}</Badge>
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
                                {t('financialHub.payments.refund')}
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
            title={t('financialHub.refunds.title')}
            subtitle={t('financialHub.refunds.subtitle')}
            actions={
              <Button icon={<Download size={14} />} variant="secondary" onClick={() => handleExport('refunds')}>
                {t('financialHub.refunds.export')}
              </Button>
            }
          >
            {refunds.loading && !refunds.data ? (
              <LoadingBlock />
            ) : !refunds.data?.items.length ? (
              <EmptyState title={t('financialHub.refunds.empty.title')} description={t('financialHub.refunds.empty.body')} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>{t('financialHub.refunds.col.id')}</th>
                      <th>{t('financialHub.col.paymentId')}</th>
                      <th>{t('financialHub.refunds.col.date')}</th>
                      <th style={{ textAlign: 'right' }}>{t('financialHub.refunds.col.amount')}</th>
                      <th>{t('financialHub.refunds.col.reason')}</th>
                      <th>{t('financialHub.refunds.col.speed')}</th>
                      <th>{t('financialHub.col.status')}</th>
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
              title={t('financialHub.recon.title')}
              subtitle={t('financialHub.recon.subtitle')}
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
                    <option value="">{t('financialHub.recon.filter.all')}</option>
                    <option value="matched">{t('financialHub.recon.filter.matched')}</option>
                    <option value="mismatch">{t('financialHub.recon.filter.mismatch')}</option>
                    <option value="missing_settlement">{t('financialHub.recon.filter.missing')}</option>
                    <option value="duplicate">{t('financialHub.recon.filter.duplicate')}</option>
                  </select>
                  <Button
                    variant="primary"
                    icon={<RefreshCw size={14} className={reconciling ? 'spin' : ''} />}
                    onClick={handleRunReconciliation}
                    disabled={reconciling}
                  >
                    {reconciling ? t('financialHub.recon.running') : t('financialHub.recon.run')}
                  </Button>
                </div>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ padding: '0.875rem', background: 'rgba(22, 163, 74, 0.08)', borderRadius: '6px' }}>
                  <span className="small text-muted">{t('financialHub.recon.matched')}</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#16a34a' }}>
                    {reconciliations.data?.items.filter((r) => r.status === 'matched').length ?? 0}
                  </div>
                  <span className="small text-muted">{t('financialHub.recon.matchedSub')}</span>
                </div>
                <div style={{ padding: '0.875rem', background: 'rgba(220, 38, 38, 0.08)', borderRadius: '6px' }}>
                  <span className="small text-muted">{t('financialHub.recon.discrepancies')}</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#dc2626' }}>
                    {reconciliations.data?.items.filter((r) => r.status !== 'matched').length ?? 0}
                  </div>
                  <span className="small text-muted">{t('financialHub.recon.discrepanciesSub')}</span>
                </div>
              </div>

              {reconciliations.loading && !reconciliations.data ? (
                <LoadingBlock />
              ) : !reconciliations.data?.items.length ? (
                <EmptyState
                  title={t('financialHub.recon.empty.title')}
                  description={t('financialHub.recon.empty.body')}
                />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>{t('financialHub.col.date')}</th>
                        <th>{t('financialHub.col.paymentId')}</th>
                        <th>{t('financialHub.col.status')}</th>
                        <th style={{ textAlign: 'right' }}>{t('financialHub.recon.col.expected')}</th>
                        <th style={{ textAlign: 'right' }}>{t('financialHub.recon.col.actual')}</th>
                        <th style={{ textAlign: 'right' }}>{t('financialHub.recon.col.diff')}</th>
                        <th>{t('financialHub.recon.col.details')}</th>
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
              title={t('financialHub.settlements.title')}
              subtitle={t('financialHub.settlements.subtitle')}
              actions={
                <Button icon={<Download size={14} />} variant="secondary" onClick={() => handleExport('settlements')}>
                  {t('financialHub.settlements.export')}
                </Button>
              }
            >
              {settlements.loading && !settlements.data ? (
                <LoadingBlock />
              ) : !settlements.data?.items.length ? (
                <EmptyState title={t('financialHub.settlements.empty.title')} description={t('financialHub.settlements.empty.body')} />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>{t('financialHub.settlements.col.id')}</th>
                        <th>{t('financialHub.col.date')}</th>
                        <th style={{ textAlign: 'right' }}>{t('financialHub.settlements.col.gross')}</th>
                        <th style={{ textAlign: 'right' }}>{t('financialHub.settlements.col.fee')}</th>
                        <th style={{ textAlign: 'right' }}>{t('financialHub.settlements.col.net')}</th>
                        <th>{t('financialHub.settlements.col.utr')}</th>
                        <th>{t('financialHub.col.status')}</th>
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
            title={t('financialHub.ledger.title')}
            subtitle={t('financialHub.ledger.subtitle')}
            actions={
              <Button icon={<Download size={14} />} variant="secondary" onClick={() => handleExport('ledger')}>
                {t('financialHub.ledger.export')}
              </Button>
            }
          >
            {transactions.loading && !transactions.data ? (
              <LoadingBlock />
            ) : !transactions.data?.items.length ? (
              <EmptyState title={t('financialHub.ledger.empty.title')} description={t('financialHub.ledger.empty.body')} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>{t('financialHub.ledger.col.id')}</th>
                      <th>{t('financialHub.col.date')}</th>
                      <th>{t('financialHub.ledger.col.type')}</th>
                      <th>{t('financialHub.ledger.col.account')}</th>
                      <th style={{ textAlign: 'right' }}>{t('financialHub.ledger.col.debit')}</th>
                      <th style={{ textAlign: 'right' }}>{t('financialHub.ledger.col.credit')}</th>
                      <th style={{ textAlign: 'right' }}>{t('financialHub.ledger.col.net')}</th>
                      <th>{t('financialHub.ledger.col.description')}</th>
                      <th>{t('financialHub.col.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.data.items.map((txn) => (
                      <tr key={txn.id}>
                        <td className="mono strong">{txn.transaction_id}</td>
                        <td>{formatDate(txn.date)}</td>
                        <td>
                          <Badge tone="neutral">{txn.transaction_type.toUpperCase()}</Badge>
                        </td>
                        <td>{txn.account}</td>
                        <td style={{ textAlign: 'right' }}>{txn.debit > 0 ? formatCurrency(txn.debit) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{txn.credit > 0 ? formatCurrency(txn.credit) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(txn.amount)}</td>
                        <td className="small text-muted">{txn.description}</td>
                        <td>
                          <Badge tone="success">{txn.status.toUpperCase()}</Badge>
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
          title={t('financialHub.refund.title')}
          subtitle={t('financialHub.refund.subtitle', { id: selectedPaymentForRefund.razorpay_payment_id })}
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setRefundModalOpen(false)} disabled={refundSubmitting}>
                {t('financialHub.refund.cancel')}
              </Button>
              <Button variant="danger" icon={<RotateCcw size={14} />} onClick={handleProcessRefund} disabled={refundSubmitting}>
                {refundSubmitting
                  ? t('financialHub.refund.submitting')
                  : t('financialHub.refund.confirm', { amount: refundAmount ? formatCurrency(parseFloat(refundAmount) || 0) : '' })}
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
                  {t('financialHub.refund.originalPaid')}
                </span>
                <span className="strong">{formatCurrency(selectedPaymentForRefund.amount)}</span>
              </div>
              <div>
                <span className="small text-muted" style={{ display: 'block' }}>
                  {t('financialHub.refund.remaining')}
                </span>
                <span className="strong" style={{ color: '#16a34a' }}>
                  {formatCurrency(selectedPaymentForRefund.amount - selectedPaymentForRefund.refund_amount)}
                </span>
              </div>
              <div>
                <span className="small text-muted" style={{ display: 'block' }}>
                  {t('financialHub.refund.customer')}
                </span>
                <span>{selectedPaymentForRefund.customer_name || '—'}</span>
              </div>
              <div>
                <span className="small text-muted" style={{ display: 'block' }}>
                  {t('financialHub.refund.invoice')}
                </span>
                <span className="mono">{selectedPaymentForRefund.invoice_number || '—'}</span>
              </div>
            </div>

            <TextField
              label={t('financialHub.refund.amount')}
              type="number"
              step="0.01"
              min="1"
              max={selectedPaymentForRefund.amount - selectedPaymentForRefund.refund_amount}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              hint={t('financialHub.refund.amountHint')}
              required
            />

            <TextField
              label={t('financialHub.refund.reason')}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder={t('financialHub.refund.reasonPlaceholder')}
              required
            />

            <SelectField
              label={t('financialHub.refund.speed')}
              value={refundSpeed}
              onChange={(e) => setRefundSpeed(e.target.value)}
              options={[
                { value: 'normal', label: t('financialHub.refund.speed.normal') },
                { value: 'optimum', label: t('financialHub.refund.speed.optimum') },
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
                {t('financialHub.refund.notice')}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
