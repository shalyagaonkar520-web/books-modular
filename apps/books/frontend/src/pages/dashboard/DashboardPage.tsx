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

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'this_fiscal_year', label: 'This fiscal year' },
  { value: 'last_fiscal_year', label: 'Last fiscal year' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
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
  const [period, setPeriod] = useState<DashboardPeriod>('this_fiscal_year');
  const [cashFlowChartType, setCashFlowChartType] = useState<ChartType>('line');
  const [incomeChartType, setIncomeChartType] = useState<ChartType>('line');
  const [receivablesView, setReceivablesView] = useState<'bar' | 'donut'>('bar');
  const [payablesView, setPayablesView] = useState<'bar' | 'donut'>('bar');
  const [topCustomersChartType, setTopCustomersChartType] = useState<'donut' | 'hbar'>('donut');
  const [inventoryView, setInventoryView] = useState<'overview' | 'donut'>('overview');
  const [activityView, setActivityView] = useState<'table' | 'chart' | 'donut'>('table');
  const currency = organization?.currency ?? 'INR';

  const { data, loading, error, reload } = useAsync(() => dashboardApi.summary(period), [period]);

  if (loading && !data) return <LoadingBlock label="Building your dashboard…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const { receivables, payables, cashFlow, incomeExpense, inventory, bankBalances, topCustomers, recentActivity } = data;
  const hasAnyActivity =
    receivables.totalReceivables > 0 ||
    payables.totalPayables > 0 ||
    data.totalCash !== 0 ||
    recentActivity.length > 0 ||
    inventory.totalItemsCount > 0;

  // Trend sparklines for top KPI cards
  const cashSparkline =
    cashFlow.breakdown.length >= 2
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
      header: 'Document',
      render: (row) => (
        <Link to={activityRoute(row)} className="cell-stack">
          <span className="strong">{row.number}</span>
          <small>{titleCase(row.type)}</small>
        </Link>
      ),
    },
    { key: 'contact', header: 'Contact', render: (row) => row.contactName ?? '—' },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (row.status ? <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge> : <span className="text-subtle">—</span>),
    },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="num">{formatCurrency(row.amount, currency)}</span> },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={`Live position for ${organization?.name ?? 'your organization'}. Every figure below comes from your posted transactions.`}
        actions={
          <div className="row" style={{ gap: 12 }}>
            <FilterSelect label="Period" value={period} onChange={(value) => setPeriod(value as DashboardPeriod)} options={PERIOD_OPTIONS} />
          </div>
        }
      />

      {!hasAnyActivity ? (
        <Card>
          <EmptyState
            title="Your books are empty"
            description="Add a customer and raise your first invoice, or record a bill or expense. The dashboard fills in from real transactions as you go."
            action={
              <div className="row">
                <Link to="/customers?new=1" className="btn btn-primary btn-md">
                  <span>Add a customer</span>
                </Link>
                <Link to="/items?new=1" className="btn btn-secondary btn-md">
                  <span>Add an item</span>
                </Link>
              </div>
            }
          />
        </Card>
      ) : null}

      <div className="stat-grid">
        <StatTile
          label="Cash on hand"
          value={formatCurrency(data.totalCash, currency)}
          sublabel={`${bankBalances.length} account(s)`}
          icon={<Landmark size={16} />}
          chart={<Sparkline values={cashSparkline} tone={data.totalCash >= 0 ? 'positive' : 'negative'} />}
        />
        <StatTile
          label="Receivables"
          value={formatCurrency(receivables.totalReceivables, currency)}
          sublabel={`${receivables.totalUnpaidInvoices} unpaid invoice(s)`}
          tone={receivables.overdueAmount > 0 ? 'warning' : 'neutral'}
          icon={<ArrowUpRight size={16} />}
          chart={<Sparkline values={receivablesSparkline} tone={receivables.overdueAmount > 0 ? 'warning' : 'positive'} />}
        />
        <StatTile
          label="Payables"
          value={formatCurrency(payables.totalPayables, currency)}
          sublabel={`${payables.totalUnpaidBills} unpaid bill(s)`}
          icon={<ArrowDownRight size={16} />}
          chart={<Sparkline values={payablesSparkline} tone={payables.overdueAmount > 0 ? 'warning' : 'neutral'} />}
        />
        <StatTile
          label={`Net ${incomeExpense.totalIncome >= incomeExpense.totalExpense ? 'profit' : 'loss'}`}
          value={formatCurrency(Math.abs(incomeExpense.net), currency)}
          sublabel={`${formatDate(incomeExpense.startDate)} – ${formatDate(incomeExpense.endDate)}`}
          tone={incomeExpense.net >= 0 ? 'positive' : 'negative'}
          icon={<Wallet size={16} />}
          chart={<Sparkline values={profitSparkline} tone={incomeExpense.net >= 0 ? 'positive' : 'negative'} />}
        />
      </div>

      <div className="grid-2">
        <Card
          title="Receivables"
          subtitle="What your customers owe you"
          actions={
            <div className="row" style={{ gap: 8 }}>
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${receivablesView === 'bar' ? 'active' : ''}`}
                  onClick={() => setReceivablesView('bar')}
                  title="Bar split"
                >
                  <span>Bar</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${receivablesView === 'donut' ? 'active' : ''}`}
                  onClick={() => setReceivablesView('donut')}
                  title="Donut chart"
                >
                  <span>Donut</span>
                </button>
              </div>
              <Link to="/invoices?status=unpaid" className="btn btn-link btn-sm">
                <span>Invoices</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          }
        >
          <div className="stat-value num">{formatCurrency(receivables.totalReceivables, currency)}</div>
          {receivablesView === 'donut' ? (
            <div style={{ margin: '12px 0' }}>
              <DonutChart
                slices={[
                  { label: 'Current', value: receivables.currentAmount },
                  { label: 'Overdue', value: receivables.overdueAmount },
                ]}
                currency={currency}
              />
            </div>
          ) : (
            <SplitBar
              total={receivables.totalReceivables}
              segments={[
                { label: 'Current', value: receivables.currentAmount, tone: 'current' },
                { label: 'Overdue', value: receivables.overdueAmount, tone: 'overdue' },
              ]}
            />
          )}
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Current</dt>
              <dd className="num">{formatCurrency(receivables.currentAmount, currency)}</dd>
            </div>
            <div className="detail-item">
              <dt>Overdue</dt>
              <dd className={`num ${receivables.overdueAmount > 0 ? 'text-danger' : ''}`}>{formatCurrency(receivables.overdueAmount, currency)}</dd>
            </div>
            <div className="detail-item">
              <dt>Unpaid invoices</dt>
              <dd className="num">{receivables.totalUnpaidInvoices}</dd>
            </div>
          </dl>
        </Card>

        <Card
          title="Payables"
          subtitle="What you owe your vendors"
          actions={
            <div className="row" style={{ gap: 8 }}>
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${payablesView === 'bar' ? 'active' : ''}`}
                  onClick={() => setPayablesView('bar')}
                  title="Bar split"
                >
                  <span>Bar</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${payablesView === 'donut' ? 'active' : ''}`}
                  onClick={() => setPayablesView('donut')}
                  title="Donut chart"
                >
                  <span>Donut</span>
                </button>
              </div>
              <Link to="/bills?status=unpaid" className="btn btn-link btn-sm">
                <span>Bills</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          }
        >
          <div className="stat-value num">{formatCurrency(payables.totalPayables, currency)}</div>
          {payablesView === 'donut' ? (
            <div style={{ margin: '12px 0' }}>
              <DonutChart
                slices={[
                  { label: 'Current', value: payables.currentAmount },
                  { label: 'Overdue', value: payables.overdueAmount },
                ]}
                currency={currency}
              />
            </div>
          ) : (
            <SplitBar
              total={payables.totalPayables}
              segments={[
                { label: 'Current', value: payables.currentAmount, tone: 'current' },
                { label: 'Overdue', value: payables.overdueAmount, tone: 'overdue' },
              ]}
            />
          )}
          <dl className="detail-grid">
            <div className="detail-item">
              <dt>Current</dt>
              <dd className="num">{formatCurrency(payables.currentAmount, currency)}</dd>
            </div>
            <div className="detail-item">
              <dt>Overdue</dt>
              <dd className={`num ${payables.overdueAmount > 0 ? 'text-warning' : ''}`}>{formatCurrency(payables.overdueAmount, currency)}</dd>
            </div>
            <div className="detail-item">
              <dt>Unpaid bills</dt>
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

      <Card title="Cash flow" subtitle={`Bank movement from ${formatDate(cashFlow.startDate)} to ${formatDate(cashFlow.endDate)}`}>
        <div className="stat-grid">
          <StatTile label="Opening balance" value={formatCurrency(cashFlow.openingBalance, currency)} />
          <StatTile label="Money in" value={formatCurrency(cashFlow.incomingAmount, currency)} tone="positive" />
          <StatTile label="Money out" value={formatCurrency(cashFlow.outgoingAmount, currency)} tone="negative" />
          <StatTile label="Closing balance" value={formatCurrency(cashFlow.closingBalance, currency)} tone={cashFlow.netCashFlow >= 0 ? 'positive' : 'negative'} />
        </div>
        <InteractiveSeriesChart
          data={cashFlow.breakdown.map((point) => ({ label: point.label, incoming: point.incoming, outgoing: point.outgoing }))}
          incomingLabel="Money in"
          outgoingLabel="Money out"
          netLabel="Net Cash Flow"
          currency={currency}
          selectedType={cashFlowChartType}
          onTypeChange={setCashFlowChartType}
          allowedTypes={['line', 'bar', 'area', 'net']}
        />
      </Card>

      <Card title="Income and expense" subtitle="Accrual view from your ledger, by period">
        <InteractiveSeriesChart
          data={incomeExpense.breakdown.map((point) => ({ label: point.label, incoming: point.incoming, outgoing: point.outgoing }))}
          incomingLabel="Income"
          outgoingLabel="Expense"
          netLabel="Net Profit"
          currency={currency}
          selectedType={incomeChartType}
          onTypeChange={setIncomeChartType}
          allowedTypes={['line', 'bar', 'area', 'net']}
        />
        <div className="row-between" style={{ marginTop: 8 }}>
          <span className="text-muted small">
            Income {formatCurrency(incomeExpense.totalIncome, currency)} · Expense {formatCurrency(incomeExpense.totalExpense, currency)}
          </span>
          <Link to="/reports" className="btn btn-link btn-sm">
            <span>Open profit and loss</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </Card>

      <div className="grid-2">
        <Card
          title="Top customers"
          subtitle="By invoiced value in this period"
          actions={
            topCustomers.length > 0 ? (
              <div className="chart-type-picker" role="group">
                <button
                  type="button"
                  className={`chart-pill ${topCustomersChartType === 'donut' ? 'active' : ''}`}
                  onClick={() => setTopCustomersChartType('donut')}
                  title="Donut chart"
                >
                  <span>Donut</span>
                </button>
                <button
                  type="button"
                  className={`chart-pill ${topCustomersChartType === 'hbar' ? 'active' : ''}`}
                  onClick={() => setTopCustomersChartType('hbar')}
                  title="Bar chart"
                >
                  <span>Bar</span>
                </button>
              </div>
            ) : null
          }
        >
          {topCustomers.length === 0 ? (
            <p className="chart-empty">No invoices in this period yet.</p>
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
          title="Inventory"
          subtitle="Stock position across tracked items"
          actions={
            <div className="row" style={{ gap: 8 }}>
              {inventory.totalItemsCount > 0 && (
                <div className="chart-type-picker" role="group">
                  <button
                    type="button"
                    className={`chart-pill ${inventoryView === 'overview' ? 'active' : ''}`}
                    onClick={() => setInventoryView('overview')}
                    title="Overview & Stat Tiles"
                  >
                    <span>Tiles</span>
                  </button>
                  <button
                    type="button"
                    className={`chart-pill ${inventoryView === 'donut' ? 'active' : ''}`}
                    onClick={() => setInventoryView('donut')}
                    title="Category Donut Chart"
                  >
                    <span>Donut</span>
                  </button>
                </div>
              )}
              <Link to="/items" className="btn btn-link btn-sm"><span>Items</span><ArrowRight size={13} /></Link>
            </div>
          }
        >
          <div className="stat-grid">
            <StatTile label="Items" value={formatNumber(inventory.totalItemsCount, 0)} sublabel={`${inventory.goodsCount} goods · ${inventory.serviceCount} services`} icon={<Package size={16} />} />
            <StatTile label="Tracked" value={formatNumber(inventory.trackedCount, 0)} />
            <StatTile label="Stock value" value={formatCurrencyCompact(inventory.totalInventoryValuation, currency)} />
            <StatTile
              label="Low stock"
              value={formatNumber(inventory.lowStockItemsCount, 0)}
              tone={inventory.lowStockItemsCount > 0 ? 'warning' : 'neutral'}
              icon={<AlertTriangle size={16} />}
            />
          </div>
          {inventoryView === 'donut' && inventory.totalItemsCount > 0 ? (
            <div style={{ marginTop: 12 }}>
              <DonutChart
                slices={[
                  { label: 'Goods', value: inventory.goodsCount },
                  { label: 'Services', value: inventory.serviceCount },
                ]}
                currency=""
              />
            </div>
          ) : inventory.totalItemsCount > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div className="row-between small text-muted" style={{ marginBottom: 4 }}>
                <span>Goods ({inventory.goodsCount})</span>
                <span>Services ({inventory.serviceCount})</span>
              </div>
              <SplitBar
                total={inventory.totalItemsCount}
                segments={[
                  { label: 'Goods', value: inventory.goodsCount, tone: 'current' },
                  { label: 'Services', value: inventory.serviceCount, tone: 'neutral' },
                ]}
              />
            </div>
          ) : null}
        </Card>

        <Card
          title="Unbilled time"
          subtitle="Billable hours logged but not yet invoiced"
          actions={<Link to="/time-tracking" className="btn btn-link btn-sm"><span>Time tracking</span><ArrowRight size={13} /></Link>}
        >
          <div className="stat-grid">
            <StatTile label="Unbilled hours" value={formatNumber(data.unbilledHours, 2)} icon={<Clock size={16} />} />
            <StatTile label="Value at project rates" value={formatCurrency(data.unbilledAmount, currency)} tone={data.unbilledAmount > 0 ? 'warning' : 'neutral'} />
          </div>

          <div className="row" style={{ gap: 20, alignItems: 'center', marginTop: 14 }}>
            <RadialProgress
              value={data.unbilledHours}
              max={40}
              size={96}
              strokeWidth={8}
              centerText={`${formatNumber(data.unbilledHours, 1)}h`}
              label="Capacity"
              sublabel="Logged billable"
              tone={data.unbilledHours > 0 ? 'positive' : 'neutral'}
            />
            <div style={{ flex: 1 }}>
              <div className="row-between small" style={{ marginBottom: 4 }}>
                <span className="text-muted">Unbilled value pipeline</span>
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
                {data.unbilledHours > 0 ? `${formatNumber(data.unbilledHours, 2)} hours ready to convert to client invoice` : 'No open unbilled hours in this period'}
              </small>
            </div>
          </div>
        </Card>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Recent activity</h2>
            <p className="card-subtitle">Latest invoices, bills, payments and expenses</p>
          </div>
          {recentActivity.length > 0 && (
            <div className="chart-type-picker" role="group">
              <button
                type="button"
                className={`chart-pill ${activityView === 'table' ? 'active' : ''}`}
                onClick={() => setActivityView('table')}
                title="Table view"
              >
                <span>Table</span>
              </button>
              <button
                type="button"
                className={`chart-pill ${activityView === 'chart' ? 'active' : ''}`}
                onClick={() => setActivityView('chart')}
                title="Activity breakdown bar chart"
              >
                <span>Bar</span>
              </button>
              <button
                type="button"
                className={`chart-pill ${activityView === 'donut' ? 'active' : ''}`}
                onClick={() => setActivityView('donut')}
                title="Activity volume donut"
              >
                <span>Donut</span>
              </button>
            </div>
          )}
        </div>
        {recentActivity.length === 0 ? (
          <div className="card-body">
            <p className="text-muted small">Nothing recorded yet.</p>
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
                sublabel: `${stats.count} transaction(s)`,
              }))}
              currency={currency}
            />
          </div>
        ) : activityView === 'donut' ? (
          <div className="card-body">
            <DonutChart
              slices={Object.entries(
                recentActivity.reduce<Record<string, number>>((acc, item) => {
                  const key = titleCase(item.type);
                  acc[key] = (acc[key] ?? 0) + 1;
                  return acc;
                }, {})
              ).map(([type, count]) => ({
                label: type,
                value: count,
              }))}
              currency=""
            />
          </div>
        ) : (
          <DataTable<Activity> columns={activityColumns} rows={recentActivity} rowKey={(row) => `${row.type}-${row.id}`} caption="Recent activity" />
        )}
      </div>
    </>
  );
}
