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
import { DonutChart, GroupedBarChart, SplitBar } from '@/components/ui/Charts';
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

const ACTIVITY_ROUTES: Record<string, string> = {
  invoice: '/invoices',
  bill: '/bills',
  customer_payment: '/payments-received',
  vendor_payment: '/payments-made',
  expense: '/expenses',
};

type Activity = { id: string; type: string; number: string; contactName?: string | null; date: string; amount: number; status?: string | null };

export function DashboardPage() {
  const { organization, user } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>('this_fiscal_year');
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

  const activityColumns: Array<Column<Activity>> = [
    {
      key: 'document',
      header: 'Document',
      render: (row) => (
        <Link to={ACTIVITY_ROUTES[row.type] ?? '/'} className="cell-stack">
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
        actions={<FilterSelect label="Period" value={period} onChange={(value) => setPeriod(value as DashboardPeriod)} options={PERIOD_OPTIONS} />}
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
        <StatTile label="Cash on hand" value={formatCurrency(data.totalCash, currency)} sublabel={`${bankBalances.length} account(s)`} icon={<Landmark size={16} />} />
        <StatTile
          label="Receivables"
          value={formatCurrency(receivables.totalReceivables, currency)}
          sublabel={`${receivables.totalUnpaidInvoices} unpaid invoice(s)`}
          tone={receivables.overdueAmount > 0 ? 'warning' : 'neutral'}
          icon={<ArrowUpRight size={16} />}
        />
        <StatTile
          label="Payables"
          value={formatCurrency(payables.totalPayables, currency)}
          sublabel={`${payables.totalUnpaidBills} unpaid bill(s)`}
          icon={<ArrowDownRight size={16} />}
        />
        <StatTile
          label={`Net ${incomeExpense.totalIncome >= incomeExpense.totalExpense ? 'profit' : 'loss'}`}
          value={formatCurrency(Math.abs(incomeExpense.net), currency)}
          sublabel={`${formatDate(incomeExpense.startDate)} – ${formatDate(incomeExpense.endDate)}`}
          tone={incomeExpense.net >= 0 ? 'positive' : 'negative'}
          icon={<Wallet size={16} />}
        />
      </div>

      <div className="grid-2">
        <Card
          title="Receivables"
          subtitle="What your customers owe you"
          actions={
            <Link to="/invoices?status=unpaid" className="btn btn-link btn-sm">
              <span>View invoices</span>
              <ArrowRight size={13} />
            </Link>
          }
        >
          <div className="stat-value num">{formatCurrency(receivables.totalReceivables, currency)}</div>
          <SplitBar
            total={receivables.totalReceivables}
            segments={[
              { label: 'Current', value: receivables.currentAmount, tone: 'current' },
              { label: 'Overdue', value: receivables.overdueAmount, tone: 'overdue' },
            ]}
          />
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
            <Link to="/bills?status=unpaid" className="btn btn-link btn-sm">
              <span>View bills</span>
              <ArrowRight size={13} />
            </Link>
          }
        >
          <div className="stat-value num">{formatCurrency(payables.totalPayables, currency)}</div>
          <SplitBar
            total={payables.totalPayables}
            segments={[
              { label: 'Current', value: payables.currentAmount, tone: 'current' },
              { label: 'Overdue', value: payables.overdueAmount, tone: 'overdue' },
            ]}
          />
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

      <Card title="Cash flow" subtitle={`Bank movement from ${formatDate(cashFlow.startDate)} to ${formatDate(cashFlow.endDate)}`}>
        <div className="stat-grid">
          <StatTile label="Opening balance" value={formatCurrency(cashFlow.openingBalance, currency)} />
          <StatTile label="Money in" value={formatCurrency(cashFlow.incomingAmount, currency)} tone="positive" />
          <StatTile label="Money out" value={formatCurrency(cashFlow.outgoingAmount, currency)} tone="negative" />
          <StatTile label="Closing balance" value={formatCurrency(cashFlow.closingBalance, currency)} tone={cashFlow.netCashFlow >= 0 ? 'positive' : 'negative'} />
        </div>
        <GroupedBarChart data={cashFlow.breakdown.map((point) => ({ label: point.label, incoming: point.incoming, outgoing: point.outgoing }))} currency={currency} />
      </Card>

      <Card title="Income and expense" subtitle="Accrual view from your ledger, by period">
        <GroupedBarChart
          data={incomeExpense.breakdown.map((point) => ({ label: point.label, incoming: point.incoming, outgoing: point.outgoing }))}
          incomingLabel="Income"
          outgoingLabel="Expense"
          currency={currency}
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
        <Card title="Bank and cash balances" actions={<Link to="/banking" className="btn btn-link btn-sm"><span>Banking</span><ArrowRight size={13} /></Link>}>
          {bankBalances.length === 0 ? (
            <p className="text-muted small">No bank or cash accounts yet.</p>
          ) : (
            <ul className="plain-list">
              {bankBalances.map((account) => (
                <li key={account.bankAccountId}>
                  <span className="cell-stack">
                    <span className="strong">{account.name}</span>
                    <small>{titleCase(account.type)}</small>
                  </span>
                  <span className="num strong">{formatCurrency(account.balance, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Top customers" subtitle="By invoiced value in this period">
          {topCustomers.length === 0 ? (
            <p className="text-muted small">No invoices in this period yet.</p>
          ) : (
            <DonutChart slices={topCustomers.map((customer) => ({ label: customer.contactName, value: customer.amount }))} currency={currency} />
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card
          title="Inventory"
          subtitle="Stock position across tracked items"
          actions={<Link to="/items" className="btn btn-link btn-sm"><span>Items</span><ArrowRight size={13} /></Link>}
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
        </Card>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Recent activity</h2>
            <p className="card-subtitle">Latest invoices, bills, payments and expenses</p>
          </div>
        </div>
        {recentActivity.length === 0 ? (
          <div className="card-body">
            <p className="text-muted small">Nothing recorded yet.</p>
          </div>
        ) : (
          <DataTable<Activity> columns={activityColumns} rows={recentActivity} rowKey={(row) => `${row.type}-${row.id}`} caption="Recent activity" />
        )}
      </div>
    </>
  );
}
