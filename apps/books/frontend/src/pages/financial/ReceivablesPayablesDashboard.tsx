/**
 * Receivables & Payables Executive Dashboard:
 * Real-time monitoring of Accounts Receivable (AR) and Accounts Payable (AP),
 * ageing buckets, working capital gap, and key debtor/creditor lists.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CreditCard,
  FileText,
  Layers,
  Receipt,
  Search,
  Wallet,
} from 'lucide-react';

import { dashboardApi, reportsApi } from '@/api/endpoints';
import type { AgingReport } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Card, StatTile } from '@/components/ui/Card';
import {
  ChartType,
  ComparisonBar,
  DonutChart,
  HorizontalBarChart,
  InteractiveSeriesChart,
  SeriesPoint,
  Sparkline,
  SplitBar,
} from '@/components/ui/Charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, todayIso } from '@/utils/format';

type ActiveView = 'all' | 'receivables' | 'payables';

type AgeingRow = AgingReport['rows'][number];

export function ReceivablesPayablesDashboard() {
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const [asOf, setAsOf] = useState<string>(todayIso);
  const [activeView, setActiveView] = useState<ActiveView>('all');
  const [customerSearch, setCustomerSearch] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [graphChartType, setGraphChartType] = useState<ChartType>('line');
  const [arChartMode, setArChartMode] = useState<'split' | 'donut'>('split');
  const [apChartMode, setApChartMode] = useState<'split' | 'donut'>('split');
  const [customerView, setCustomerView] = useState<'table' | 'chart'>('table');
  const [vendorView, setVendorView] = useState<'table' | 'chart'>('table');

  // Fetch AR Ageing, AP Ageing, and Dashboard overview summary concurrently
  const {
    data: reportsData,
    loading,
    error,
    reload,
  } = useAsync(async () => {
    const [arReport, apReport, summary] = await Promise.all([
      reportsApi.receivablesAging({ as_of: asOf }),
      reportsApi.payablesAging({ as_of: asOf }),
      dashboardApi.summary('this_fiscal_year').catch(() => null),
    ]);
    return { arReport, apReport, summary };
  }, [asOf]);

  const ar = reportsData?.arReport;
  const ap = reportsData?.apReport;
  const summary = reportsData?.summary;

  // Compute AR Ageing Aggregates
  const arTotals = useMemo(() => {
    if (!ar?.rows) return { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, daysOver90: 0, total: 0, overdue: 0 };
    return ar.rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        days1To30: acc.days1To30 + r.days1To30,
        days31To60: acc.days31To60 + r.days31To60,
        days61To90: acc.days61To90 + r.days61To90,
        daysOver90: acc.daysOver90 + r.daysOver90,
        total: acc.total + r.total,
        overdue: acc.overdue + (r.days1To30 + r.days31To60 + r.days61To90 + r.daysOver90),
      }),
      { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, daysOver90: 0, total: 0, overdue: 0 },
    );
  }, [ar]);

  // Compute AP Ageing Aggregates
  const apTotals = useMemo(() => {
    if (!ap?.rows) return { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, daysOver90: 0, total: 0, overdue: 0 };
    return ap.rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        days1To30: acc.days1To30 + r.days1To30,
        days31To60: acc.days31To60 + r.days31To60,
        days61To90: acc.days61To90 + r.days61To90,
        daysOver90: acc.daysOver90 + r.daysOver90,
        total: acc.total + r.total,
        overdue: acc.overdue + (r.days1To30 + r.days31To60 + r.days61To90 + r.daysOver90),
      }),
      { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, daysOver90: 0, total: 0, overdue: 0 },
    );
  }, [ap]);

  // Working capital gap: AR - AP
  const workingCapitalGap = arTotals.total - apTotals.total;

  // Filtered customer debtor rows
  const filteredCustomers = useMemo(() => {
    if (!ar?.rows) return [];
    const query = customerSearch.trim().toLowerCase();
    const list = query ? ar.rows.filter((r) => r.contactName.toLowerCase().includes(query)) : ar.rows;
    return [...list].sort((a, b) => b.total - a.total);
  }, [ar, customerSearch]);

  // Filtered vendor creditor rows
  const filteredVendors = useMemo(() => {
    if (!ap?.rows) return [];
    const query = vendorSearch.trim().toLowerCase();
    const list = query ? ap.rows.filter((r) => r.contactName.toLowerCase().includes(query)) : ap.rows;
    return [...list].sort((a, b) => b.total - a.total);
  }, [ap, vendorSearch]);

  // Multi-bucket series for AR vs AP Ageing Graph
  const ageingComparisonSeries: SeriesPoint[] = useMemo(() => [
    { label: t('receivablesPayables.bucket.current'), incoming: arTotals.current, outgoing: apTotals.current },
    { label: t('receivablesPayables.bucket.d1'), incoming: arTotals.days1To30, outgoing: apTotals.days1To30 },
    { label: t('receivablesPayables.bucket.d2'), incoming: arTotals.days31To60, outgoing: apTotals.days31To60 },
    { label: t('receivablesPayables.bucket.d3'), incoming: arTotals.days61To90, outgoing: apTotals.days61To90 },
    { label: t('receivablesPayables.bucket.d4'), incoming: arTotals.daysOver90, outgoing: apTotals.daysOver90 },
  ], [arTotals, apTotals, t]);

  // Mini sparkline data sequences for KPI cards
  const arSparkline = [
    arTotals.current,
    arTotals.days1To30,
    arTotals.days31To60,
    arTotals.days61To90,
    arTotals.daysOver90,
  ];

  const apSparkline = [
    apTotals.current,
    apTotals.days1To30,
    apTotals.days31To60,
    apTotals.days61To90,
    apTotals.daysOver90,
  ];

  const gapSparkline = [
    arTotals.current - apTotals.current,
    arTotals.days1To30 - apTotals.days1To30,
    arTotals.days31To60 - apTotals.days31To60,
    arTotals.days61To90 - apTotals.days61To90,
    arTotals.daysOver90 - apTotals.daysOver90,
  ];

  const cashSparkline = [
    summary?.cashFlow?.openingBalance ?? 0,
    summary?.totalCash ?? 0,
  ];

  const money = (val: number) => <span className="num">{formatCurrency(val, currency)}</span>;

  const customerColumns: Array<Column<AgeingRow>> = [
    {
      key: 'contactName',
      header: t('receivablesPayables.col.customer'),
      render: (r) => (
        <Link to={`/invoices?customer=${encodeURIComponent(r.contactId)}&status=unpaid`} className="cell-stack">
          <span className="strong">{r.contactName}</span>
          <small className="text-muted">{t('receivablesPayables.col.customerHint')}</small>
        </Link>
      ),
    },
    { key: 'current', header: t('receivablesPayables.bucket.current'), align: 'right', render: (r) => money(r.current) },
    { key: 'd1', header: t('receivablesPayables.bucket.d1'), align: 'right', render: (r) => money(r.days1To30) },
    { key: 'd2', header: t('receivablesPayables.bucket.d2'), align: 'right', render: (r) => money(r.days31To60) },
    { key: 'd3', header: t('receivablesPayables.bucket.d3'), align: 'right', render: (r) => money(r.days61To90) },
    {
      key: 'd4',
      header: t('receivablesPayables.bucket.d4'),
      align: 'right',
      render: (r) => (
        <span className={r.daysOver90 > 0 ? 'num text-danger strong' : 'num'}>
          {formatCurrency(r.daysOver90, currency)}
        </span>
      ),
    },
    {
      key: 'total',
      header: t('receivablesPayables.col.totalDue'),
      align: 'right',
      render: (r) => <span className="num strong">{formatCurrency(r.total, currency)}</span>,
    },
  ];

  const vendorColumns: Array<Column<AgeingRow>> = [
    {
      key: 'contactName',
      header: t('receivablesPayables.col.vendor'),
      render: (r) => (
        <Link to={`/bills?vendor=${encodeURIComponent(r.contactId)}&status=unpaid`} className="cell-stack">
          <span className="strong">{r.contactName}</span>
          <small className="text-muted">{t('receivablesPayables.col.vendorHint')}</small>
        </Link>
      ),
    },
    { key: 'current', header: t('receivablesPayables.bucket.current'), align: 'right', render: (r) => money(r.current) },
    { key: 'd1', header: t('receivablesPayables.bucket.d1'), align: 'right', render: (r) => money(r.days1To30) },
    { key: 'd2', header: t('receivablesPayables.bucket.d2'), align: 'right', render: (r) => money(r.days31To60) },
    { key: 'd3', header: t('receivablesPayables.bucket.d3'), align: 'right', render: (r) => money(r.days61To90) },
    {
      key: 'd4',
      header: t('receivablesPayables.bucket.d4'),
      align: 'right',
      render: (r) => (
        <span className={r.daysOver90 > 0 ? 'num text-warning strong' : 'num'}>
          {formatCurrency(r.daysOver90, currency)}
        </span>
      ),
    },
    {
      key: 'total',
      header: t('receivablesPayables.col.totalPayable'),
      align: 'right',
      render: (r) => <span className="num strong">{formatCurrency(r.total, currency)}</span>,
    },
  ];

  if (loading && !reportsData) return <LoadingBlock label={t('receivablesPayables.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title={t('receivablesPayables.title')}
        subtitle={t('receivablesPayables.subtitle', { date: formatDate(asOf) })}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={15} style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="date"
                className="input input-sm"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value || todayIso())}
                style={{ width: '145px' }}
                title={t('receivablesPayables.asOfTooltip')}
              />
            </div>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', padding: '5px 12px' }}
                onClick={() => setActiveView('all')}
              >
                {t('receivablesPayables.view.combined')}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'receivables' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', padding: '5px 12px' }}
                onClick={() => setActiveView('receivables')}
              >
                {t('receivablesPayables.view.receivables')}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'payables' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', padding: '5px 12px' }}
                onClick={() => setActiveView('payables')}
              >
                {t('receivablesPayables.view.payables')}
              </button>
            </div>
          </div>
        }
      />

      {/* Top Level Metric KPIs */}
      <div className="stat-grid">
        <StatTile
          label={t('receivablesPayables.kpi.ar')}
          value={formatCurrency(arTotals.total, currency)}
          sublabel={t('receivablesPayables.kpi.arSub', { count: ar?.rows.length ?? 0, overdue: formatCurrency(arTotals.overdue, currency) })}
          tone={arTotals.overdue > 0 ? 'warning' : 'positive'}
          icon={<ArrowUpRight size={16} />}
          chart={<Sparkline values={arSparkline} tone={arTotals.overdue > 0 ? 'warning' : 'positive'} />}
        />
        <StatTile
          label={t('receivablesPayables.kpi.ap')}
          value={formatCurrency(apTotals.total, currency)}
          sublabel={t('receivablesPayables.kpi.apSub', { count: ap?.rows.length ?? 0, overdue: formatCurrency(apTotals.overdue, currency) })}
          tone={apTotals.overdue > 0 ? 'warning' : 'neutral'}
          icon={<ArrowDownRight size={16} />}
          chart={<Sparkline values={apSparkline} tone={apTotals.overdue > 0 ? 'warning' : 'neutral'} />}
        />
        <StatTile
          label={t('receivablesPayables.kpi.gap')}
          value={formatCurrency(Math.abs(workingCapitalGap), currency)}
          sublabel={
            workingCapitalGap >= 0
              ? t('receivablesPayables.kpi.gapSurplus')
              : t('receivablesPayables.kpi.gapDeficit')
          }
          tone={workingCapitalGap >= 0 ? 'positive' : 'negative'}
          icon={<ArrowLeftRight size={16} />}
          chart={<Sparkline values={gapSparkline} tone={workingCapitalGap >= 0 ? 'positive' : 'negative'} />}
        />
        <StatTile
          label={t('receivablesPayables.kpi.cash')}
          value={formatCurrency(summary?.totalCash ?? 0, currency)}
          sublabel={t('receivablesPayables.kpi.cashSub', { count: summary?.bankBalances?.length ?? 0 })}
          tone={(summary?.totalCash ?? 0) >= apTotals.total ? 'positive' : 'warning'}
          icon={<Wallet size={16} />}
          chart={<Sparkline values={cashSparkline} tone={(summary?.totalCash ?? 0) >= apTotals.total ? 'positive' : 'warning'} />}
        />
      </div>

      {/* Prominent Receivables vs Payables Ageing Graph */}
      <Card
        title={t('receivablesPayables.graph.title')}
        subtitle={t('receivablesPayables.graph.subtitle')}
      >
        <InteractiveSeriesChart
          data={ageingComparisonSeries}
          incomingLabel={t('receivablesPayables.graph.incoming')}
          outgoingLabel={t('receivablesPayables.graph.outgoing')}
          netLabel={t('receivablesPayables.graph.net')}
          currency={currency}
          selectedType={graphChartType}
          onTypeChange={setGraphChartType}
          allowedTypes={['line', 'bar', 'area', 'net']}
        />
        <ComparisonBar
          receivables={arTotals.total}
          payables={apTotals.total}
          currency={currency}
        />
      </Card>

      {/* Comparison & Ageing Split Bar Cards */}
      <div className="grid-2">
        {(activeView === 'all' || activeView === 'receivables') && (
          <Card
            title={t('receivablesPayables.ar.title')}
            subtitle={t('receivablesPayables.ar.subtitle', { total: formatCurrency(arTotals.total, currency), count: ar?.rows.length ?? 0 })}
            actions={
              <div className="row" style={{ gap: 8 }}>
                <div className="chart-type-picker" role="group">
                  <button
                    type="button"
                    className={`chart-pill ${arChartMode === 'split' ? 'active' : ''}`}
                    onClick={() => setArChartMode('split')}
                    title={t('receivablesPayables.chart.splitBar')}
                  >
                    <span>{t('receivablesPayables.chart.bar')}</span>
                  </button>
                  <button
                    type="button"
                    className={`chart-pill ${arChartMode === 'donut' ? 'active' : ''}`}
                    onClick={() => setArChartMode('donut')}
                    title={t('receivablesPayables.chart.donutView')}
                  >
                    <span>{t('receivablesPayables.chart.donut')}</span>
                  </button>
                </div>
                <Link to="/invoices?status=unpaid" className="btn btn-link btn-sm">
                  <span>{t('receivablesPayables.ar.viewInvoices')}</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            }
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <div className="stat-value num">{formatCurrency(arTotals.total, currency)}</div>
              <Badge tone={arTotals.overdue > 0 ? 'warning' : 'success'}>
                {t('receivablesPayables.overduePercent', { percent: arTotals.total > 0 ? ((arTotals.overdue / arTotals.total) * 100).toFixed(0) : '0' })}
              </Badge>
            </div>

            {arChartMode === 'donut' ? (
              <div style={{ margin: '14px 0' }}>
                <DonutChart
                  slices={[
                    { label: t('receivablesPayables.bucket.currentNotDue'), value: arTotals.current },
                    { label: t('receivablesPayables.ar.slice.d1'), value: arTotals.days1To30 },
                    { label: t('receivablesPayables.ar.slice.d2'), value: arTotals.days31To60 },
                    { label: t('receivablesPayables.ar.slice.d3'), value: arTotals.days61To90 },
                    { label: t('receivablesPayables.ar.slice.d4'), value: arTotals.daysOver90 },
                  ].filter((s) => s.value > 0)}
                  currency={currency}
                />
              </div>
            ) : (
              <SplitBar
                total={arTotals.total}
                segments={[
                  { label: t('receivablesPayables.bucket.current'), value: arTotals.current, tone: 'current' },
                  { label: t('receivablesPayables.split.overdue'), value: arTotals.overdue, tone: 'overdue' },
                ]}
              />
            )}

            <dl className="detail-grid" style={{ marginTop: '16px' }}>
              <div className="detail-item">
                <dt>{t('receivablesPayables.bucket.currentNotDue')}</dt>
                <dd className="num">{formatCurrency(arTotals.current, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ar.detail.d1')}</dt>
                <dd className="num">{formatCurrency(arTotals.days1To30, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ar.detail.d2')}</dt>
                <dd className="num">{formatCurrency(arTotals.days31To60, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ar.detail.d3')}</dt>
                <dd className="num">{formatCurrency(arTotals.days61To90, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ar.detail.d4')}</dt>
                <dd className={`num ${arTotals.daysOver90 > 0 ? 'text-danger strong' : ''}`}>
                  {formatCurrency(arTotals.daysOver90, currency)}
                </dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ar.detail.unpaid')}</dt>
                <dd className="num">{summary?.receivables.totalUnpaidInvoices ?? '—'}</dd>
              </div>
            </dl>
          </Card>
        )}

        {(activeView === 'all' || activeView === 'payables') && (
          <Card
            title={t('receivablesPayables.ap.title')}
            subtitle={t('receivablesPayables.ap.subtitle', { total: formatCurrency(apTotals.total, currency), count: ap?.rows.length ?? 0 })}
            actions={
              <div className="row" style={{ gap: 8 }}>
                <div className="chart-type-picker" role="group">
                  <button
                    type="button"
                    className={`chart-pill ${apChartMode === 'split' ? 'active' : ''}`}
                    onClick={() => setApChartMode('split')}
                    title={t('receivablesPayables.chart.splitBar')}
                  >
                    <span>{t('receivablesPayables.chart.bar')}</span>
                  </button>
                  <button
                    type="button"
                    className={`chart-pill ${apChartMode === 'donut' ? 'active' : ''}`}
                    onClick={() => setApChartMode('donut')}
                    title={t('receivablesPayables.chart.donutView')}
                  >
                    <span>{t('receivablesPayables.chart.donut')}</span>
                  </button>
                </div>
                <Link to="/bills?status=unpaid" className="btn btn-link btn-sm">
                  <span>{t('receivablesPayables.ap.viewBills')}</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            }
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <div className="stat-value num">{formatCurrency(apTotals.total, currency)}</div>
              <Badge tone={apTotals.overdue > 0 ? 'warning' : 'neutral'}>
                {t('receivablesPayables.overduePercent', { percent: apTotals.total > 0 ? ((apTotals.overdue / apTotals.total) * 100).toFixed(0) : '0' })}
              </Badge>
            </div>

            {apChartMode === 'donut' ? (
              <div style={{ margin: '14px 0' }}>
                <DonutChart
                  slices={[
                    { label: t('receivablesPayables.bucket.currentNotDue'), value: apTotals.current },
                    { label: t('receivablesPayables.ap.slice.d1'), value: apTotals.days1To30 },
                    { label: t('receivablesPayables.ap.slice.d2'), value: apTotals.days31To60 },
                    { label: t('receivablesPayables.ap.slice.d3'), value: apTotals.days61To90 },
                    { label: t('receivablesPayables.ap.slice.d4'), value: apTotals.daysOver90 },
                  ].filter((s) => s.value > 0)}
                  currency={currency}
                />
              </div>
            ) : (
              <SplitBar
                total={apTotals.total}
                segments={[
                  { label: t('receivablesPayables.bucket.current'), value: apTotals.current, tone: 'current' },
                  { label: t('receivablesPayables.split.overdue'), value: apTotals.overdue, tone: 'overdue' },
                ]}
              />
            )}

            <dl className="detail-grid" style={{ marginTop: '16px' }}>
              <div className="detail-item">
                <dt>{t('receivablesPayables.bucket.currentNotDue')}</dt>
                <dd className="num">{formatCurrency(apTotals.current, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ap.detail.d1')}</dt>
                <dd className="num">{formatCurrency(apTotals.days1To30, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ap.detail.d2')}</dt>
                <dd className="num">{formatCurrency(apTotals.days31To60, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ap.detail.d3')}</dt>
                <dd className="num">{formatCurrency(apTotals.days61To90, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ap.detail.d4')}</dt>
                <dd className={`num ${apTotals.daysOver90 > 0 ? 'text-warning strong' : ''}`}>
                  {formatCurrency(apTotals.daysOver90, currency)}
                </dd>
              </div>
              <div className="detail-item">
                <dt>{t('receivablesPayables.ap.detail.unpaid')}</dt>
                <dd className="num">{summary?.payables.totalUnpaidBills ?? '—'}</dd>
              </div>
            </dl>
          </Card>
        )}
      </div>

      {/* Quick Action Dock */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'var(--surface, #ffffff)',
          padding: '14px 20px',
          borderRadius: 'var(--radius-lg, 12px)',
          border: '1px solid var(--border, #e2e8f0)',
          boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text, #1e293b)' }}>
          <Layers size={16} style={{ color: '#0284c7' }} />
          <span>{t('receivablesPayables.quick.title')}</span>
        </div>
        <Link to="/invoices/new" className="btn btn-primary btn-sm">
          <FileText size={14} />
          <span>{t('receivablesPayables.quick.newInvoice')}</span>
        </Link>
        <Link to="/payments-received" className="btn btn-secondary btn-sm">
          <Wallet size={14} />
          <span>{t('receivablesPayables.quick.customerPayment')}</span>
        </Link>
        <Link to="/bills/new" className="btn btn-secondary btn-sm">
          <Receipt size={14} />
          <span>{t('receivablesPayables.quick.newBill')}</span>
        </Link>
        <Link to="/payments-made" className="btn btn-secondary btn-sm">
          <CreditCard size={14} />
          <span>{t('receivablesPayables.quick.vendorPayment')}</span>
        </Link>
        <Link to="/reports" className="btn btn-link btn-sm" style={{ marginLeft: 'auto' }}>
          <span>{t('receivablesPayables.quick.reports')}</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Customer Receivables Section */}
      {(activeView === 'all' || activeView === 'receivables') && (
        <Card
          title={t('receivablesPayables.customers.title')}
          subtitle={t('receivablesPayables.customers.subtitle')}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${customerView === 'table' ? 'active' : ''}`}
                  onClick={() => setCustomerView('table')}
                  title={t('receivablesPayables.chart.tableView')}
                >
                  <span>{t('receivablesPayables.chart.table')}</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${customerView === 'chart' ? 'active' : ''}`}
                  onClick={() => setCustomerView('chart')}
                  title={t('receivablesPayables.chart.barRanking')}
                >
                  <span>{t('receivablesPayables.chart.bar')}</span>
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder={t('receivablesPayables.customers.filter')}
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="input input-sm"
                  style={{ paddingLeft: '28px', width: '180px' }}
                />
              </div>
              <Link to="/customers" className="btn btn-link btn-sm">
                <span>{t('receivablesPayables.customers.viewAll')}</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          }
        >
          {filteredCustomers.length === 0 ? (
            <EmptyState
              title={t('receivablesPayables.empty.receivablesTitle')}
              description={customerSearch ? t('receivablesPayables.customers.emptySearch') : t('receivablesPayables.customers.emptyBody')}
            />
          ) : customerView === 'chart' ? (
            <HorizontalBarChart
              items={filteredCustomers.map((r) => ({
                label: r.contactName,
                value: r.total,
                sublabel:
                  r.daysOver90 > 0
                    ? t('receivablesPayables.ranking.over90', { amount: formatCurrency(r.daysOver90, currency) })
                    : t('receivablesPayables.ranking.current', { amount: formatCurrency(r.current, currency) }),
              }))}
              currency={currency}
              maxItems={10}
            />
          ) : (
            <DataTable
              columns={customerColumns}
              rows={filteredCustomers}
              rowKey={(r) => r.contactId}
              caption={t('receivablesPayables.customers.caption')}
              footer={
                <tr>
                  <td>{t('receivablesPayables.customers.total', { count: filteredCustomers.length })}</td>
                  <td className="align-right num">{formatCurrency(arTotals.current, currency)}</td>
                  <td className="align-right num">{formatCurrency(arTotals.days1To30, currency)}</td>
                  <td className="align-right num">{formatCurrency(arTotals.days31To60, currency)}</td>
                  <td className="align-right num">{formatCurrency(arTotals.days61To90, currency)}</td>
                  <td className="align-right num text-danger strong">{formatCurrency(arTotals.daysOver90, currency)}</td>
                  <td className="align-right num strong">{formatCurrency(arTotals.total, currency)}</td>
                </tr>
              }
            />
          )}
        </Card>
      )}

      {/* Vendor Payables Section */}
      {(activeView === 'all' || activeView === 'payables') && (
        <Card
          title={t('receivablesPayables.vendors.title')}
          subtitle={t('receivablesPayables.vendors.subtitle')}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${vendorView === 'table' ? 'active' : ''}`}
                  onClick={() => setVendorView('table')}
                  title={t('receivablesPayables.chart.tableView')}
                >
                  <span>{t('receivablesPayables.chart.table')}</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${vendorView === 'chart' ? 'active' : ''}`}
                  onClick={() => setVendorView('chart')}
                  title={t('receivablesPayables.chart.barRanking')}
                >
                  <span>{t('receivablesPayables.chart.bar')}</span>
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder={t('receivablesPayables.vendors.filter')}
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  className="input input-sm"
                  style={{ paddingLeft: '28px', width: '180px' }}
                />
              </div>
              <Link to="/vendors" className="btn btn-link btn-sm">
                <span>{t('receivablesPayables.vendors.viewAll')}</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          }
        >
          {filteredVendors.length === 0 ? (
            <EmptyState
              title={t('receivablesPayables.empty.payablesTitle')}
              description={vendorSearch ? t('receivablesPayables.vendors.emptySearch') : t('receivablesPayables.vendors.emptyBody')}
            />
          ) : vendorView === 'chart' ? (
            <HorizontalBarChart
              items={filteredVendors.map((r) => ({
                label: r.contactName,
                value: r.total,
                sublabel:
                  r.daysOver90 > 0
                    ? t('receivablesPayables.ranking.over90', { amount: formatCurrency(r.daysOver90, currency) })
                    : t('receivablesPayables.ranking.current', { amount: formatCurrency(r.current, currency) }),
              }))}
              currency={currency}
              maxItems={10}
            />
          ) : (
            <DataTable
              columns={vendorColumns}
              rows={filteredVendors}
              rowKey={(r) => r.contactId}
              caption={t('receivablesPayables.vendors.caption')}
              footer={
                <tr>
                  <td>{t('receivablesPayables.vendors.total', { count: filteredVendors.length })}</td>
                  <td className="align-right num">{formatCurrency(apTotals.current, currency)}</td>
                  <td className="align-right num">{formatCurrency(apTotals.days1To30, currency)}</td>
                  <td className="align-right num">{formatCurrency(apTotals.days31To60, currency)}</td>
                  <td className="align-right num">{formatCurrency(apTotals.days61To90, currency)}</td>
                  <td className="align-right num text-warning strong">{formatCurrency(apTotals.daysOver90, currency)}</td>
                  <td className="align-right num strong">{formatCurrency(apTotals.total, currency)}</td>
                </tr>
              }
            />
          )}
        </Card>
      )}
    </>
  );
}
