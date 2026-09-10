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
  ChartTypeToggle,
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
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, todayIso } from '@/utils/format';

type ActiveView = 'all' | 'receivables' | 'payables';

type AgeingRow = AgingReport['rows'][number];

export function ReceivablesPayablesDashboard() {
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
    { label: 'Current', incoming: arTotals.current, outgoing: apTotals.current },
    { label: '1–30d', incoming: arTotals.days1To30, outgoing: apTotals.days1To30 },
    { label: '31–60d', incoming: arTotals.days31To60, outgoing: apTotals.days31To60 },
    { label: '61–90d', incoming: arTotals.days61To90, outgoing: apTotals.days61To90 },
    { label: '> 90d', incoming: arTotals.daysOver90, outgoing: apTotals.daysOver90 },
  ], [arTotals, apTotals]);

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
    summary?.cashFlow.openingBalance ?? 0,
    summary?.totalCash ?? 0,
  ];

  const money = (val: number) => <span className="num">{formatCurrency(val, currency)}</span>;

  const customerColumns: Array<Column<AgeingRow>> = [
    {
      key: 'contactName',
      header: 'Customer',
      render: (r) => (
        <Link to={`/invoices?search=${encodeURIComponent(r.contactName)}`} className="cell-stack">
          <span className="strong">{r.contactName}</span>
          <small className="text-muted">Click to view invoices</small>
        </Link>
      ),
    },
    { key: 'current', header: 'Current', align: 'right', render: (r) => money(r.current) },
    { key: 'd1', header: '1–30d', align: 'right', render: (r) => money(r.days1To30) },
    { key: 'd2', header: '31–60d', align: 'right', render: (r) => money(r.days31To60) },
    { key: 'd3', header: '61–90d', align: 'right', render: (r) => money(r.days61To90) },
    {
      key: 'd4',
      header: '> 90d',
      align: 'right',
      render: (r) => (
        <span className={r.daysOver90 > 0 ? 'num text-danger strong' : 'num'}>
          {formatCurrency(r.daysOver90, currency)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total Due',
      align: 'right',
      render: (r) => <span className="num strong">{formatCurrency(r.total, currency)}</span>,
    },
  ];

  const vendorColumns: Array<Column<AgeingRow>> = [
    {
      key: 'contactName',
      header: 'Vendor / Supplier',
      render: (r) => (
        <Link to={`/bills?search=${encodeURIComponent(r.contactName)}`} className="cell-stack">
          <span className="strong">{r.contactName}</span>
          <small className="text-muted">Click to view bills</small>
        </Link>
      ),
    },
    { key: 'current', header: 'Current', align: 'right', render: (r) => money(r.current) },
    { key: 'd1', header: '1–30d', align: 'right', render: (r) => money(r.days1To30) },
    { key: 'd2', header: '31–60d', align: 'right', render: (r) => money(r.days31To60) },
    { key: 'd3', header: '61–90d', align: 'right', render: (r) => money(r.days61To90) },
    {
      key: 'd4',
      header: '> 90d',
      align: 'right',
      render: (r) => (
        <span className={r.daysOver90 > 0 ? 'num text-warning strong' : 'num'}>
          {formatCurrency(r.daysOver90, currency)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total Payable',
      align: 'right',
      render: (r) => <span className="num strong">{formatCurrency(r.total, currency)}</span>,
    },
  ];

  if (loading && !reportsData) return <LoadingBlock label="Calculating receivables & payables positions…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title="Receivables & Payables Dashboard"
        subtitle={`Live position as of ${formatDate(asOf)}. Overview of customer amounts receivable versus supplier payables.`}
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
                title="Position Date (As of)"
              />
            </div>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', padding: '5px 12px' }}
                onClick={() => setActiveView('all')}
              >
                Combined
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'receivables' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', padding: '5px 12px' }}
                onClick={() => setActiveView('receivables')}
              >
                Receivables
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeView === 'payables' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ border: 'none', padding: '5px 12px' }}
                onClick={() => setActiveView('payables')}
              >
                Payables
              </button>
            </div>
          </div>
        }
      />

      {/* Top Level Metric KPIs */}
      <div className="stat-grid">
        <StatTile
          label="Total Receivables (AR)"
          value={formatCurrency(arTotals.total, currency)}
          sublabel={`${ar?.rows.length ?? 0} customer(s) with balance · ${formatCurrency(arTotals.overdue, currency)} overdue`}
          tone={arTotals.overdue > 0 ? 'warning' : 'positive'}
          icon={<ArrowUpRight size={16} />}
          chart={<Sparkline values={arSparkline} tone={arTotals.overdue > 0 ? 'warning' : 'positive'} />}
        />
        <StatTile
          label="Total Payables (AP)"
          value={formatCurrency(apTotals.total, currency)}
          sublabel={`${ap?.rows.length ?? 0} vendor(s) to pay · ${formatCurrency(apTotals.overdue, currency)} overdue`}
          tone={apTotals.overdue > 0 ? 'warning' : 'neutral'}
          icon={<ArrowDownRight size={16} />}
          chart={<Sparkline values={apSparkline} tone={apTotals.overdue > 0 ? 'warning' : 'neutral'} />}
        />
        <StatTile
          label="Net AR / AP Gap"
          value={formatCurrency(Math.abs(workingCapitalGap), currency)}
          sublabel={
            workingCapitalGap >= 0
              ? 'Net Surplus: Customers owe you more than you owe vendors'
              : 'Net Deficit: Vendor payables exceed customer receivables'
          }
          tone={workingCapitalGap >= 0 ? 'positive' : 'negative'}
          icon={<ArrowLeftRight size={16} />}
          chart={<Sparkline values={gapSparkline} tone={workingCapitalGap >= 0 ? 'positive' : 'negative'} />}
        />
        <StatTile
          label="Cash on Hand"
          value={formatCurrency(summary?.totalCash ?? 0, currency)}
          sublabel={`${summary?.bankBalances.length ?? 0} bank/cash account(s) available`}
          tone={(summary?.totalCash ?? 0) >= apTotals.total ? 'positive' : 'warning'}
          icon={<Wallet size={16} />}
          chart={<Sparkline values={cashSparkline} tone={(summary?.totalCash ?? 0) >= apTotals.total ? 'positive' : 'warning'} />}
        />
      </div>

      {/* Prominent Receivables vs Payables Ageing Graph */}
      <Card
        title="Receivables vs Payables Ageing Graph"
        subtitle="Visual comparative analysis across ageing intervals (Current, 1–30d, 31–60d, 61–90d, >90d)"
        actions={
          <ChartTypeToggle
            value={graphChartType}
            onChange={setGraphChartType}
            allowedTypes={['line', 'bar', 'area', 'net']}
          />
        }
      >
        <InteractiveSeriesChart
          data={ageingComparisonSeries}
          incomingLabel="Receivables (AR)"
          outgoingLabel="Payables (AP)"
          netLabel="Net Working Capital (AR - AP)"
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
            title="Accounts Receivable Ageing (What customers owe you)"
            subtitle={`Total: ${formatCurrency(arTotals.total, currency)} across ${ar?.rows.length ?? 0} customer account(s)`}
            actions={
              <div className="row" style={{ gap: 8 }}>
                <div className="chart-type-picker" role="group">
                  <button
                    type="button"
                    className={`chart-pill ${arChartMode === 'split' ? 'active' : ''}`}
                    onClick={() => setArChartMode('split')}
                    title="Split bar view"
                  >
                    <span>Bar</span>
                  </button>
                  <button
                    type="button"
                    className={`chart-pill ${arChartMode === 'donut' ? 'active' : ''}`}
                    onClick={() => setArChartMode('donut')}
                    title="Donut distribution view"
                  >
                    <span>Donut</span>
                  </button>
                </div>
                <Link to="/invoices?status=unpaid" className="btn btn-link btn-sm">
                  <span>View invoices</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            }
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <div className="stat-value num">{formatCurrency(arTotals.total, currency)}</div>
              <Badge tone={arTotals.overdue > 0 ? 'warning' : 'success'}>
                {arTotals.total > 0 ? `${((arTotals.overdue / arTotals.total) * 100).toFixed(0)}% Overdue` : '0% Overdue'}
              </Badge>
            </div>

            {arChartMode === 'donut' ? (
              <div style={{ margin: '14px 0' }}>
                <DonutChart
                  slices={[
                    { label: 'Current (Not Due)', value: arTotals.current },
                    { label: '1–30d Overdue', value: arTotals.days1To30 },
                    { label: '31–60d Overdue', value: arTotals.days31To60 },
                    { label: '61–90d Overdue', value: arTotals.days61To90 },
                    { label: '>90d High Risk', value: arTotals.daysOver90 },
                  ].filter((s) => s.value > 0)}
                  currency={currency}
                />
              </div>
            ) : (
              <SplitBar
                total={arTotals.total}
                segments={[
                  { label: 'Current', value: arTotals.current, tone: 'current' },
                  { label: 'Overdue', value: arTotals.overdue, tone: 'overdue' },
                ]}
              />
            )}

            <dl className="detail-grid" style={{ marginTop: '16px' }}>
              <div className="detail-item">
                <dt>Current (Not Due)</dt>
                <dd className="num">{formatCurrency(arTotals.current, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>1–30 Days Overdue</dt>
                <dd className="num">{formatCurrency(arTotals.days1To30, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>31–60 Days Overdue</dt>
                <dd className="num">{formatCurrency(arTotals.days31To60, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>61–90 Days Overdue</dt>
                <dd className="num">{formatCurrency(arTotals.days61To90, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>&gt; 90 Days High Risk</dt>
                <dd className={`num ${arTotals.daysOver90 > 0 ? 'text-danger strong' : ''}`}>
                  {formatCurrency(arTotals.daysOver90, currency)}
                </dd>
              </div>
              <div className="detail-item">
                <dt>Unpaid Invoices</dt>
                <dd className="num">{summary?.receivables.totalUnpaidInvoices ?? '—'}</dd>
              </div>
            </dl>
          </Card>
        )}

        {(activeView === 'all' || activeView === 'payables') && (
          <Card
            title="Accounts Payable Ageing (What you owe vendors)"
            subtitle={`Total: ${formatCurrency(apTotals.total, currency)} across ${ap?.rows.length ?? 0} supplier account(s)`}
            actions={
              <div className="row" style={{ gap: 8 }}>
                <div className="chart-type-picker" role="group">
                  <button
                    type="button"
                    className={`chart-pill ${apChartMode === 'split' ? 'active' : ''}`}
                    onClick={() => setApChartMode('split')}
                    title="Split bar view"
                  >
                    <span>Bar</span>
                  </button>
                  <button
                    type="button"
                    className={`chart-pill ${apChartMode === 'donut' ? 'active' : ''}`}
                    onClick={() => setApChartMode('donut')}
                    title="Donut distribution view"
                  >
                    <span>Donut</span>
                  </button>
                </div>
                <Link to="/bills?status=unpaid" className="btn btn-link btn-sm">
                  <span>View bills</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            }
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <div className="stat-value num">{formatCurrency(apTotals.total, currency)}</div>
              <Badge tone={apTotals.overdue > 0 ? 'warning' : 'neutral'}>
                {apTotals.total > 0 ? `${((apTotals.overdue / apTotals.total) * 100).toFixed(0)}% Overdue` : '0% Overdue'}
              </Badge>
            </div>

            {apChartMode === 'donut' ? (
              <div style={{ margin: '14px 0' }}>
                <DonutChart
                  slices={[
                    { label: 'Current (Not Due)', value: apTotals.current },
                    { label: '1–30d Past', value: apTotals.days1To30 },
                    { label: '31–60d Past', value: apTotals.days31To60 },
                    { label: '61–90d Past', value: apTotals.days61To90 },
                    { label: '>90d Past', value: apTotals.daysOver90 },
                  ].filter((s) => s.value > 0)}
                  currency={currency}
                />
              </div>
            ) : (
              <SplitBar
                total={apTotals.total}
                segments={[
                  { label: 'Current', value: apTotals.current, tone: 'current' },
                  { label: 'Overdue', value: apTotals.overdue, tone: 'overdue' },
                ]}
              />
            )}

            <dl className="detail-grid" style={{ marginTop: '16px' }}>
              <div className="detail-item">
                <dt>Current (Not Due)</dt>
                <dd className="num">{formatCurrency(apTotals.current, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>1–30 Days Past</dt>
                <dd className="num">{formatCurrency(apTotals.days1To30, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>31–60 Days Past</dt>
                <dd className="num">{formatCurrency(apTotals.days31To60, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>61–90 Days Past</dt>
                <dd className="num">{formatCurrency(apTotals.days61To90, currency)}</dd>
              </div>
              <div className="detail-item">
                <dt>&gt; 90 Days Past</dt>
                <dd className={`num ${apTotals.daysOver90 > 0 ? 'text-warning strong' : ''}`}>
                  {formatCurrency(apTotals.daysOver90, currency)}
                </dd>
              </div>
              <div className="detail-item">
                <dt>Unpaid Bills</dt>
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
          <span>Quick Actions:</span>
        </div>
        <Link to="/invoices/new" className="btn btn-primary btn-sm">
          <FileText size={14} />
          <span>New Invoice</span>
        </Link>
        <Link to="/payments-received" className="btn btn-secondary btn-sm">
          <Wallet size={14} />
          <span>Record Customer Payment</span>
        </Link>
        <Link to="/bills/new" className="btn btn-secondary btn-sm">
          <Receipt size={14} />
          <span>New Bill</span>
        </Link>
        <Link to="/payments-made" className="btn btn-secondary btn-sm">
          <CreditCard size={14} />
          <span>Record Vendor Payment</span>
        </Link>
        <Link to="/reports" className="btn btn-link btn-sm" style={{ marginLeft: 'auto' }}>
          <span>Open Full Ageing Reports</span>
          <ArrowRight size={13} />
        </Link>
      </div>

      {/* Customer Receivables Section */}
      {(activeView === 'all' || activeView === 'receivables') && (
        <Card
          title="Customer Receivables (Debtors Ledger)"
          subtitle="All customers with outstanding invoice balances sorted by highest total balance"
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${customerView === 'table' ? 'active' : ''}`}
                  onClick={() => setCustomerView('table')}
                  title="Table view"
                >
                  <span>Table</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${customerView === 'chart' ? 'active' : ''}`}
                  onClick={() => setCustomerView('chart')}
                  title="Bar chart ranking"
                >
                  <span>Bar</span>
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Filter customer..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="input input-sm"
                  style={{ paddingLeft: '28px', width: '180px' }}
                />
              </div>
              <Link to="/customers" className="btn btn-link btn-sm">
                <span>View all customers</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          }
        >
          {filteredCustomers.length === 0 ? (
            <EmptyState
              title="No customer receivables"
              description={customerSearch ? 'No customer matched your search query.' : 'No customer has an outstanding balance as of this date.'}
            />
          ) : customerView === 'chart' ? (
            <HorizontalBarChart
              items={filteredCustomers.map((r) => ({
                label: r.contactName,
                value: r.total,
                sublabel: r.daysOver90 > 0 ? `Overdue >90d: ${formatCurrency(r.daysOver90, currency)}` : `Current: ${formatCurrency(r.current, currency)}`,
              }))}
              currency={currency}
              maxItems={10}
            />
          ) : (
            <DataTable
              columns={customerColumns}
              rows={filteredCustomers}
              rowKey={(r) => r.contactId}
              caption="Customer receivables breakdown"
              footer={
                <tr>
                  <td>Total ({filteredCustomers.length} customers)</td>
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
          title="Supplier Payables (Creditors Ledger)"
          subtitle="All suppliers and vendors with open unpaid bills sorted by highest total balance"
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${vendorView === 'table' ? 'active' : ''}`}
                  onClick={() => setVendorView('table')}
                  title="Table view"
                >
                  <span>Table</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${vendorView === 'chart' ? 'active' : ''}`}
                  onClick={() => setVendorView('chart')}
                  title="Bar chart ranking"
                >
                  <span>Bar</span>
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Filter vendor..."
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  className="input input-sm"
                  style={{ paddingLeft: '28px', width: '180px' }}
                />
              </div>
              <Link to="/vendors" className="btn btn-link btn-sm">
                <span>View all vendors</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          }
        >
          {filteredVendors.length === 0 ? (
            <EmptyState
              title="No vendor payables"
              description={vendorSearch ? 'No vendor matched your search query.' : 'No vendor bills are open or payable as of this date.'}
            />
          ) : vendorView === 'chart' ? (
            <HorizontalBarChart
              items={filteredVendors.map((r) => ({
                label: r.contactName,
                value: r.total,
                sublabel: r.daysOver90 > 0 ? `Overdue >90d: ${formatCurrency(r.daysOver90, currency)}` : `Current: ${formatCurrency(r.current, currency)}`,
              }))}
              currency={currency}
              maxItems={10}
            />
          ) : (
            <DataTable
              columns={vendorColumns}
              rows={filteredVendors}
              rowKey={(r) => r.contactId}
              caption="Supplier payables breakdown"
              footer={
                <tr>
                  <td>Total ({filteredVendors.length} vendors)</td>
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
