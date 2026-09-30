import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Clock,
  Landmark,
  Package,
  Wallet,
} from 'lucide-react';

import { dashboardApi } from '@/api/endpoints';
import type { DashboardPeriod } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Card, StatTile } from '@/components/ui/Card';
import {
  ChartType,
  ComparisonBar,
  DonutChart,
  HorizontalBarChart,
  InteractiveSeriesChart,
  RadialProgress,
  Sparkline,
  SplitBar,
} from '@/components/ui/Charts';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect } from '@/components/ui/Toolbar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber, titleCase } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

// Labels are app-content keys, resolved with t() at render.
const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; labelKey: string }> = [
  { value: 'this_fiscal_year', labelKey: 'dashboard.period.thisFiscalYear' },
  { value: 'last_fiscal_year', labelKey: 'dashboard.period.lastFiscalYear' },
  { value: 'this_quarter', labelKey: 'dashboard.period.thisQuarter' },
  { value: 'this_month', labelKey: 'dashboard.period.thisMonth' },
  { value: 'last_month', labelKey: 'dashboard.period.lastMonth' },
];

// Where clicking a Recent activity row should go. Invoices, bills and expenses
// have a dedicated single-record view, so link straight to that record rather
// than dumping the visitor on the (often filtered) list page; payments have no
// per-record view yet, so those still just go to their list.
function activityRoute(row: Activity): string {
  switch (row.type) {
    case 'invoice':
      return `/invoices/${row.id}`;
    case 'bill':
      return `/bills?bill=${row.id}`;
    case 'expense':
      return `/expenses?expense=${row.id}`;
    case 'customer_payment':
      return '/payments-received';
    case 'vendor_payment':
      return '/payments-made';
    default:
      return '/';
  }
}

type Activity = { id: string; type: string; number: string; contactName?: string | null; date: string; amount: number; status?: string | null };

export function DashboardPage() {
  const { organization, user } = useAuth();
  const { t, isModuleEnabled } = useAppContent();
  const [period, setPeriod] = useState<DashboardPeriod>('this_fiscal_year');
  const [cashFlowChartType, setCashFlowChartType] = useState<ChartType>('line');
  const [incomeChartType, setIncomeChartType] = useState<ChartType>('line');
  const [receivablesView, setReceivablesView] = useState<'bar' | 'donut'>('bar');
  const [payablesView, setPayablesView] = useState<'bar' | 'donut'>('bar');
  const [topCustomersChartType, setTopCustomersChartType] = useState<'donut' | 'hbar'>('donut');
  const [inventoryView, setInventoryView] = useState<'overview' | 'donut'>('overview');
  const [activityView, setActivityView] = useState<'table' | 'chart'>('table');
  const currency = organization?.currency ?? 'INR';

  const { data, loading, error, reload } = useAsync(() => dashboardApi.summary(period), [period]);

  if (loading && !data) return <LoadingBlock label={t('dashboard.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const { receivables, payables, cashFlow, incomeExpense, inventory, bankBalances, topCustomers, recentActivity } = data;
  // The API omits cash/bank figures for staff (no banking access); render the
  // cash widgets only when they are present.
  const showCash = cashFlow != null && bankBalances != null && data.totalCash != null;
  const hasAnyActivity =
    receivables.totalReceivables > 0 ||
    payables.totalPayables > 0 ||
    (data.totalCash ?? 0) !== 0 ||
    recentActivity.length > 0 ||
    inventory.totalItemsCount > 0;

  // Trend sparklines for top KPI cards
  const cashSparkline = !cashFlow
    ? []
    : cashFlow.breakdown.length >= 2
      ? cashFlow.breakdown.map((p) => p.incoming - p.outgoing)
      : [cashFlow.openingBalance, cashFlow.closingBalance];

  const receivablesSparkline = [
    Math.max(0, receivables.totalReceivables - receivables.overdueAmount),
    receivables.totalReceivables,
  ];

  const payablesSparkline = [
    Math.max(0, payables.totalPayables - payables.overdueAmount),
    payables.totalPayables,
  ];

  const profitSparkline =
    incomeExpense.breakdown.length >= 2
      ? incomeExpense.breakdown.map((p) => p.incoming - p.outgoing)
      : [0, incomeExpense.net];

  const activityColumns: Array<Column<Activity>> = [
    {
      key: 'document',
      header: t('dashboard.activity.col.document'),
      render: (row) => (
        <Link to={activityRoute(row)} className="cell-stack">
          <span className="strong">{row.number}</span>
          <small>{titleCase(row.type)}</small>
        </Link>
      ),
    },
    { key: 'contact', header: t('dashboard.activity.col.contact'), render: (row) => row.contactName ?? '—' },
    { key: 'date', header: t('dashboard.activity.col.date'), render: (row) => formatDate(row.date) },
    {
      key: 'status',
      header: t('dashboard.activity.col.status'),
      render: (row) => (row.status ? <Badge tone={statusTone(row.status)}>{statusLabel(row.status, t)}</Badge> : <span className="text-subtle">—</span>),
    },
    { key: 'amount', header: t('dashboard.activity.col.amount'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.amount, currency)}</span> },
  ];

  return (
    <>
      <PageHeader
        title={t('dashboard.welcome', { name: user?.name?.split(' ')[0] ?? t('dashboard.welcomeFallbackName') })}
        subtitle={t('dashboard.subtitle', { org: organization?.name ?? t('dashboard.orgFallback') })}
        actions={
          <div className="row" style={{ gap: 12 }}>
            <FilterSelect
              label={t('dashboard.period.label')}
              value={period}
              onChange={(value) => setPeriod(value as DashboardPeriod)}
              options={PERIOD_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            />
          </div>
        }
      />

      {!hasAnyActivity ? (
        <Card>
          <EmptyState
            title={t('dashboard.empty.title')}
            description={t('dashboard.empty.body')}
            action={
              <div className="row">
                {isModuleEnabled('customers') ? (
                  <Link to="/customers?new=1" className="btn btn-primary btn-md">
                    <span>{t('dashboard.empty.addCustomer')}</span>
                  </Link>
                ) : null}
                {isModuleEnabled('items') ? (
                  <Link to="/items?new=1" className="btn btn-secondary btn-md">
                    <span>{t('dashboard.empty.addItem')}</span>
                  </Link>
                ) : null}
              </div>
            }
          />
        </Card>
      ) : null}

      <div className="stat-grid">
        {showCash ? (
          <StatTile
            label={t('dashboard.kpi.cash')}
            value={formatCurrency(data.totalCash ?? 0, currency)}
            sublabel={t('dashboard.kpi.cashSub', { count: bankBalances?.length ?? 0 })}
            icon={<Landmark size={16} />}
            chart={<Sparkline values={cashSparkline} tone={(data.totalCash ?? 0) >= 0 ? 'positive' : 'negative'} />}
          />
        ) : null}
        <StatTile
          label={t('dashboard.kpi.receivables')}
          value={formatCurrency(receivables.totalReceivables, currency)}
          sublabel={t('dashboard.kpi.receivablesSub', { count: receivables.totalUnpaidInvoices })}
          tone={receivables.overdueAmount > 0 ? 'warning' : 'neutral'}
          icon={<ArrowUpRight size={16} />}
          chart={<Sparkline values={receivablesSparkline} tone={receivables.overdueAmount > 0 ? 'warning' : 'positive'} />}
        />
        <StatTile
          label={t('dashboard.kpi.payables')}
          value={formatCurrency(payables.totalPayables, currency)}
          sublabel={t('dashboard.kpi.payablesSub', { count: payables.totalUnpaidBills })}
          icon={<ArrowDownRight size={16} />}
          chart={<Sparkline values={payablesSparkline} tone={payables.overdueAmount > 0 ? 'warning' : 'neutral'} />}
        />
        <StatTile
          label={incomeExpense.totalIncome >= incomeExpense.totalExpense ? t('dashboard.kpi.netProfit') : t('dashboard.kpi.netLoss')}
          value={formatCurrency(Math.abs(incomeExpense.net), currency)}
          sublabel={t('dashboard.kpi.netSub', { start: formatDate(incomeExpense.startDate), end: formatDate(incomeExpense.endDate) })}
          tone={incomeExpense.net >= 0 ? 'positive' : 'negative'}
          icon={<Wallet size={16} />}
          chart={<Sparkline values={profitSparkline} tone={incomeExpense.net >= 0 ? 'positive' : 'negative'} />}
        />
      </div>

      <div className="grid-2">
        <Card
          title={t('dashboard.receivables.title')}
          subtitle={t('dashboard.receivables.subtitle')}
          actions={
            <div className="row" style={{ gap: 8 }}>
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${receivablesView === 'bar' ? 'active' : ''}`}
                  onClick={() => setReceivablesView('bar')}
                  title={t('dashboard.chart.barSplit')}
                >
                  <span>{t('dashboard.chart.bar')}</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${receivablesView === 'donut' ? 'active' : ''}`}
                  onClick={() => setReceivablesView('donut')}
                  title={t('dashboard.chart.donutChart')}
                >
                  <span>{t('dashboard.chart.donut')}</span>
                </button>
              </div>
              {isModuleEnabled('invoices') ? (
                <Link to="/invoices?status=unpaid" className="btn btn-link btn-sm">
                  <span>{t('dashboard.receivables.link')}</span>
                  <ArrowRight size={13} />
                </Link>
              ) : null}
            </div>
          }
        >
          <div className="stat-value num">{formatCurrency(receivables.totalReceivables, currency)}</div>
          {receivablesView === 'donut' ? (
            <div style={{ margin: '12px 0' }}>
              <DonutChart
                slices={[
                  { label: t('dashboard.split.current'), value: receivables.currentAmount },
                  { label: t('dashboard.split.overdue'), value: receivables.overdueAmount },
                ]}
                currency={currency}
              />
            </div>
          ) : (
            <SplitBar
              total={receivables.totalReceivables}
              segments={[
                { label: t('dashboard.split.current'), value: receivables.currentAmount, tone: 'current' },
                { label: t('dashboard.split.overdue'), value: receivables.overdueAmount, tone: 'overdue' },
              ]}
            />
          )}
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>{t('dashboard.split.current')}</dt>
              <dd className="num">{formatCurrency(receivables.currentAmount, currency)}</dd>
            </div>
            <div className="detail-item">
              <dt>{t('dashboard.split.overdue')}</dt>
              <dd className={`num ${receivables.overdueAmount > 0 ? 'text-danger' : ''}`}>{formatCurrency(receivables.overdueAmount, currency)}</dd>
            </div>
            <div className="detail-item">
              <dt>{t('dashboard.receivables.unpaidInvoices')}</dt>
              <dd className="num">{receivables.totalUnpaidInvoices}</dd>
            </div>
          </dl>
        </Card>

        <Card
          title={t('dashboard.payables.title')}
          subtitle={t('dashboard.payables.subtitle')}
          actions={
            <div className="row" style={{ gap: 8 }}>
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${payablesView === 'bar' ? 'active' : ''}`}
                  onClick={() => setPayablesView('bar')}
                  title={t('dashboard.chart.barSplit')}
                >
                  <span>{t('dashboard.chart.bar')}</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${payablesView === 'donut' ? 'active' : ''}`}
                  onClick={() => setPayablesView('donut')}
                  title={t('dashboard.chart.donutChart')}
                >
                  <span>{t('dashboard.chart.donut')}</span>
                </button>
              </div>
              {isModuleEnabled('bills') ? (
                <Link to="/bills?status=unpaid" className="btn btn-link btn-sm">
                  <span>{t('dashboard.payables.link')}</span>
                  <ArrowRight size={13} />
                </Link>
              ) : null}
            </div>
          }
        >
          <div className="stat-value num">{formatCurrency(payables.totalPayables, currency)}</div>
          {payablesView === 'donut' ? (
            <div style={{ margin: '12px 0' }}>
              <DonutChart
                slices={[
                  { label: t('dashboard.split.current'), value: payables.currentAmount },
                  { label: t('dashboard.split.overdue'), value: payables.overdueAmount },
                ]}
                currency={currency}
              />
            </div>
          ) : (
            <SplitBar
              total={payables.totalPayables}
              segments={[
                { label: t('dashboard.split.current'), value: payables.currentAmount, tone: 'current' },
                { label: t('dashboard.split.overdue'), value: payables.overdueAmount, tone: 'overdue' },
              ]}
            />
          )}
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>{t('dashboard.split.current')}</dt>
              <dd className="num">{formatCurrency(payables.currentAmount, currency)}</dd>
            </div>
            <div className="detail-item">
              <dt>{t('dashboard.split.overdue')}</dt>
              <dd className={`num ${payables.overdueAmount > 0 ? 'text-warning' : ''}`}>{formatCurrency(payables.overdueAmount, currency)}</dd>
            </div>
            <div className="detail-item">
              <dt>{t('dashboard.payables.unpaidBills')}</dt>
              <dd className="num">{payables.totalUnpaidBills}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <ComparisonBar
        receivables={receivables.totalReceivables}
        payables={payables.totalPayables}
        currency={currency}
      />

      {cashFlow ? (
        <Card title={t('dashboard.cashFlow.title')} subtitle={t('dashboard.cashFlow.subtitle', { start: formatDate(cashFlow.startDate), end: formatDate(cashFlow.endDate) })}>
          <div className="stat-grid">
            <StatTile label={t('dashboard.cashFlow.opening')} value={formatCurrency(cashFlow.openingBalance, currency)} />
            <StatTile label={t('dashboard.cashFlow.moneyIn')} value={formatCurrency(cashFlow.incomingAmount, currency)} tone="positive" />
            <StatTile label={t('dashboard.cashFlow.moneyOut')} value={formatCurrency(cashFlow.outgoingAmount, currency)} tone="negative" />
            <StatTile label={t('dashboard.cashFlow.closing')} value={formatCurrency(cashFlow.closingBalance, currency)} tone={cashFlow.netCashFlow >= 0 ? 'positive' : 'negative'} />
          </div>
          <InteractiveSeriesChart
            data={cashFlow.breakdown.map((point) => ({ label: point.label, incoming: point.incoming, outgoing: point.outgoing }))}
            incomingLabel={t('dashboard.cashFlow.moneyIn')}
            outgoingLabel={t('dashboard.cashFlow.moneyOut')}
            netLabel={t('dashboard.cashFlow.net')}
            currency={currency}
            selectedType={cashFlowChartType}
            onTypeChange={setCashFlowChartType}
            allowedTypes={['line', 'bar', 'area', 'net']}
          />
        </Card>
      ) : null}

      <Card title={t('dashboard.incomeExpense.title')} subtitle={t('dashboard.incomeExpense.subtitle')}>
        <InteractiveSeriesChart
          data={incomeExpense.breakdown.map((point) => ({ label: point.label, incoming: point.incoming, outgoing: point.outgoing }))}
          incomingLabel={t('dashboard.incomeExpense.income')}
          outgoingLabel={t('dashboard.incomeExpense.expense')}
          netLabel={t('dashboard.incomeExpense.net')}
          currency={currency}
          selectedType={incomeChartType}
          onTypeChange={setIncomeChartType}
          allowedTypes={['line', 'bar', 'area', 'net']}
        />
        <div className="row-between" style={{ marginTop: 8 }}>
          <span className="text-muted small">
            {t('dashboard.incomeExpense.summary', {
              income: formatCurrency(incomeExpense.totalIncome, currency),
              expense: formatCurrency(incomeExpense.totalExpense, currency),
            })}
          </span>
          {isModuleEnabled('reports') ? (
            <Link to="/reports" className="btn btn-link btn-sm">
              <span>{t('dashboard.incomeExpense.link')}</span>
              <ArrowRight size={13} />
            </Link>
          ) : null}
        </div>
      </Card>

      <div className="grid-2">
        <Card
          title={t('dashboard.topCustomers.title')}
          subtitle={t('dashboard.topCustomers.subtitle')}
          actions={
            topCustomers.length > 0 ? (
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${topCustomersChartType === 'donut' ? 'active' : ''}`}
                  onClick={() => setTopCustomersChartType('donut')}
                  title={t('dashboard.chart.donutChart')}
                >
                  <span>{t('dashboard.chart.donut')}</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${topCustomersChartType === 'hbar' ? 'active' : ''}`}
                  onClick={() => setTopCustomersChartType('hbar')}
                  title={t('dashboard.chart.barChart')}
                >
                  <span>{t('dashboard.chart.bar')}</span>
                </button>
              </div>
            ) : null
          }
        >
          {topCustomers.length === 0 ? (
            <p className="chart-empty">{t('dashboard.topCustomers.empty')}</p>
          ) : topCustomersChartType === 'donut' ? (
            <DonutChart slices={topCustomers.map((customer) => ({ label: customer.contactName, value: customer.amount }))} currency={currency} />
          ) : (
            <HorizontalBarChart
              items={topCustomers.map((customer) => ({ label: customer.contactName, value: customer.amount }))}
              currency={currency}
            />
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card
          title={t('dashboard.inventory.title')}
          subtitle={t('dashboard.inventory.subtitle')}
          actions={
            <div className="row" style={{ gap: 8 }}>
              {inventory.totalItemsCount > 0 && (
                <div className="chart-type-picker" role="group">
                  <button
                    type="button"
                    className={`chart-pill ${inventoryView === 'overview' ? 'active' : ''}`}
                    onClick={() => setInventoryView('overview')}
                    title={t('dashboard.chart.overviewTiles')}
                  >
                    <span>{t('dashboard.chart.tiles')}</span>
                  </button>
                  <button
                    type="button"
                    className={`chart-pill ${inventoryView === 'donut' ? 'active' : ''}`}
                    onClick={() => setInventoryView('donut')}
                    title={t('dashboard.chart.categoryDonut')}
                  >
                    <span>{t('dashboard.chart.donut')}</span>
                  </button>
                </div>
              )}
              {isModuleEnabled('items') ? (
                <Link to="/items" className="btn btn-link btn-sm"><span>{t('dashboard.inventory.link')}</span><ArrowRight size={13} /></Link>
              ) : null}
            </div>
          }
        >
          <div className="stat-grid">
            <StatTile
              label={t('dashboard.inventory.items')}
              value={formatNumber(inventory.totalItemsCount, 0)}
              sublabel={t('dashboard.inventory.itemsSub', { goods: inventory.goodsCount, services: inventory.serviceCount })} icon={<Package size={16} />} />
            <StatTile label={t('dashboard.inventory.tracked')} value={formatNumber(inventory.trackedCount, 0)} />
            <StatTile label={t('dashboard.inventory.stockValue')} value={formatCurrencyCompact(inventory.totalInventoryValuation, currency)} />
            <StatTile
              label={t('dashboard.inventory.lowStock')}
              value={formatNumber(inventory.lowStockItemsCount, 0)}
              tone={inventory.lowStockItemsCount > 0 ? 'warning' : 'neutral'}
              icon={<AlertTriangle size={16} />}
            />
          </div>
          {inventoryView === 'donut' && inventory.totalItemsCount > 0 ? (
            <div style={{ marginTop: 12 }}>
              <DonutChart
                slices={[
                  { label: t('dashboard.inventory.goods'), value: inventory.goodsCount },
                  { label: t('dashboard.inventory.services'), value: inventory.serviceCount },
                ]}
                currency=""
              />
            </div>
          ) : inventory.totalItemsCount > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div className="row-between small text-muted" style={{ marginBottom: 4 }}>
                <span>{t('dashboard.inventory.goodsCount', { count: inventory.goodsCount })}</span>
                <span>{t('dashboard.inventory.servicesCount', { count: inventory.serviceCount })}</span>
              </div>
              <SplitBar
                total={inventory.totalItemsCount}
                segments={[
                  { label: t('dashboard.inventory.goods'), value: inventory.goodsCount, tone: 'current' },
                  { label: t('dashboard.inventory.services'), value: inventory.serviceCount, tone: 'neutral' },
                ]}
              />
            </div>
          ) : null}
        </Card>

        <Card
          title={t('dashboard.unbilled.title')}
          subtitle={t('dashboard.unbilled.subtitle')}
          actions={
            isModuleEnabled('timeTracking') ? (
              <Link to="/time-tracking" className="btn btn-link btn-sm"><span>{t('dashboard.unbilled.link')}</span><ArrowRight size={13} /></Link>
            ) : undefined
          }
        >
          <div className="stat-grid">
            <StatTile label={t('dashboard.unbilled.hours')} value={formatNumber(data.unbilledHours, 2)} icon={<Clock size={16} />} />
            <StatTile label={t('dashboard.unbilled.value')} value={formatCurrency(data.unbilledAmount, currency)} tone={data.unbilledAmount > 0 ? 'warning' : 'neutral'} />
          </div>

          <div className="row" style={{ gap: 20, alignItems: 'center', marginTop: 14 }}>
            <RadialProgress
              value={data.unbilledHours}
              max={40}
              size={96}
              strokeWidth={8}
              centerText={t('dashboard.unbilled.hoursShort', { hours: formatNumber(data.unbilledHours, 1) })}
              label={t('dashboard.unbilled.capacity')}
              sublabel={t('dashboard.unbilled.loggedBillable')}
              tone={data.unbilledHours > 0 ? 'positive' : 'neutral'}
            />
            <div style={{ flex: 1 }}>
              <div className="row-between small" style={{ marginBottom: 4 }}>
                <span className="text-muted">{t('dashboard.unbilled.pipeline')}</span>
                <span className="num strong text-primary">{formatCurrency(data.unbilledAmount, currency)}</span>
              </div>
              <div className="hbar-track" style={{ height: 8 }}>
                <div
                  className="hbar-fill"
                  style={{
                    width: `${Math.min(100, Math.max(data.unbilledAmount > 0 ? 8 : 0, (data.unbilledAmount / (data.unbilledAmount > 0 ? data.unbilledAmount * 1.5 : 10000)) * 100))}%`,
                    background: '#059669',
                  }}
                />
              </div>
              <small className="text-muted" style={{ display: 'block', marginTop: 6 }}>
                {data.unbilledHours > 0
                  ? t('dashboard.unbilled.ready', { hours: formatNumber(data.unbilledHours, 2) })
                  : t('dashboard.unbilled.none')}
              </small>
            </div>
          </div>
        </Card>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('dashboard.activity.title')}</h2>
            <p className="card-subtitle">{t('dashboard.activity.subtitle')}</p>
          </div>
          {recentActivity.length > 0 && (
            <div className="chart-type-picker" role="group">
              <button
                type="button"
                className={`chart-pill ${activityView === 'table' ? 'active' : ''}`}
                onClick={() => setActivityView('table')}
                title={t('dashboard.chart.tableView')}
              >
                <span>{t('dashboard.chart.table')}</span>
              </button>
              <button
                type="button"
                className={`chart-pill ${activityView === 'chart' ? 'active' : ''}`}
                onClick={() => setActivityView('chart')}
                title={t('dashboard.chart.activityBar')}
              >
                <span>{t('dashboard.chart.bar')}</span>
              </button>
            </div>
          )}
        </div>
        {recentActivity.length === 0 ? (
          <div className="card-body">
            <p className="text-muted small">{t('dashboard.activity.empty')}</p>
          </div>
        ) : activityView === 'chart' ? (
          <div className="card-body">
            <HorizontalBarChart
              items={Object.entries(
                recentActivity.reduce<Record<string, { count: number; total: number }>>((acc, item) => {
                  const key = titleCase(item.type);
                  if (!acc[key]) acc[key] = { count: 0, total: 0 };
                  acc[key].count += 1;
                  acc[key].total += item.amount;
                  return acc;
                }, {})
              ).map(([type, stats]) => ({
                label: type,
                value: stats.total,
                sublabel: t('dashboard.activity.transactions', { count: stats.count }),
              }))}
              currency={currency}
            />
          </div>
        ) : (
          <DataTable<Activity> columns={activityColumns} rows={recentActivity} rowKey={(row) => `${row.type}-${row.id}`} caption={t('dashboard.activity.title')} />
        )}
      </div>
    </>
  );
}
