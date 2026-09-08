/** Purchases > Expense Tracker Dashboard: Dedicated executive view of operating expenses. */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Calendar,
  Layers,
  PieChart,
  Plus,
  Receipt,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { accountingApi, bankingApi, contactsApi, expensesApi } from '@/api/endpoints';
import type { Expense } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, round2, todayIso } from '@/utils/format';

import { ExpenseFormModal, type ExpenseRefs } from '../purchases/ExpenseFormModal';

type PeriodKey = 'this_month' | 'last_month' | 'this_quarter' | 'this_fiscal_year' | 'all';

function getPeriodDates(period: PeriodKey): { startDate?: string; endDate?: string } {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (period) {
    case 'this_month': {
      const start = new Date(year, month, 1).toISOString().slice(0, 10);
      return { startDate: start, endDate: todayIso() };
    }
    case 'last_month': {
      const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const end = new Date(year, month, 0).toISOString().slice(0, 10);
      return { startDate: start, endDate: end };
    }
    case 'this_quarter': {
      const quarterMonth = Math.floor(month / 3) * 3;
      const start = new Date(year, quarterMonth, 1).toISOString().slice(0, 10);
      return { startDate: start, endDate: todayIso() };
    }
    case 'this_fiscal_year': {
      // April 1st of current fiscal year (Indian fiscal year)
      const fyStartYear = month >= 3 ? year : year - 1;
      const start = new Date(fyStartYear, 3, 1).toISOString().slice(0, 10);
      return { startDate: start, endDate: todayIso() };
    }
    case 'all':
    default:
      return {};
  }
}

export function ExpenseDashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [creating, setCreating] = useState(false);

  const dates = useMemo(() => getPeriodDates(period), [period]);

  const refs = useAsync(async (): Promise<ExpenseRefs> => {
    const [expenseAccounts, bankAccounts, vendorPage, customerPage] = await Promise.all([
      accountingApi.accounts({ type: 'expense' }),
      bankingApi.accounts(),
      contactsApi.list({ type: 'vendor', page_size: 200 }),
      contactsApi.list({ type: 'customer', page_size: 200 }),
    ]);
    return { expenseAccounts, bankAccounts, vendors: vendorPage.items, customers: customerPage.items };
  }, []);

  const expensesQuery = useAsync(async () => {
    // Fetch up to 200 items for detailed dashboard calculations
    const res = await expensesApi.list({
      start_date: dates.startDate,
      end_date: dates.endDate,
      page: 1,
      page_size: 200,
    });
    return res.items;
  }, [dates.startDate, dates.endDate]);

  const items = useMemo(() => expensesQuery.data ?? [], [expensesQuery.data]);

  // Aggregations
  const stats = useMemo(() => {
    const totalSpend = round2(items.reduce((acc, e) => acc + (e.total || 0), 0));
    const billableSpend = round2(items.reduce((acc, e) => acc + (e.isBillable ? e.total : 0), 0));
    const nonBillableSpend = round2(totalSpend - billableSpend);
    const avgSpend = items.length > 0 ? round2(totalSpend / items.length) : 0;
    const billablePct = totalSpend > 0 ? round2((billableSpend / totalSpend) * 100) : 0;

    // By Category
    const catMap: Record<string, { total: number; count: number }> = {};
    // By Payment Method / Account
    const methodMap: Record<string, { total: number; count: number }> = {};
    // By Vendor
    const vendorMap: Record<string, { name: string; total: number; count: number }> = {};

    items.forEach((e) => {
      const eRec = e as unknown as Record<string, unknown>;
      const cat = (eRec.category as string | undefined) || e.accountName || 'Other';
      if (!catMap[cat]) catMap[cat] = { total: 0, count: 0 };
      catMap[cat].total = round2(catMap[cat].total + e.total);
      catMap[cat].count += 1;

      const method = (eRec.paymentMethod as string | undefined) || e.paidThroughName || 'Bank Transfer';
      if (!methodMap[method]) methodMap[method] = { total: 0, count: 0 };
      methodMap[method].total = round2(methodMap[method].total + e.total);
      methodMap[method].count += 1;

      if (e.vendorName) {
        const vKey = e.vendorId || e.vendorName;
        if (!vendorMap[vKey]) vendorMap[vKey] = { name: e.vendorName, total: 0, count: 0 };
        vendorMap[vKey].total = round2(vendorMap[vKey].total + e.total);
        vendorMap[vKey].count += 1;
      }
    });

    const categories = Object.entries(catMap)
      .map(([name, data]) => ({
        name,
        total: data.total,
        count: data.count,
        percent: totalSpend > 0 ? round2((data.total / totalSpend) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const methods = Object.entries(methodMap)
      .map(([name, data]) => ({
        name,
        total: data.total,
        count: data.count,
        percent: totalSpend > 0 ? round2((data.total / totalSpend) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const topVendors = Object.values(vendorMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const topCategory = categories[0]?.name || 'N/A';

    return {
      totalSpend,
      billableSpend,
      nonBillableSpend,
      avgSpend,
      billablePct,
      categories,
      methods,
      topVendors,
      topCategory,
      count: items.length,
    };
  }, [items]);

  const recentColumns: Column<Expense>[] = [
    {
      key: 'expenseNumber',
      header: 'Expense #',
      render: (row) => <span className="font-mono text-bold">{row.expenseNumber}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (row) => formatDate(row.date),
    },
    {
      key: 'category',
      header: 'Category / Account',
      render: (row) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Tag size={13} className="text-muted" />
          <span>{((row as unknown as Record<string, unknown>).category as string | undefined) || row.accountName}</span>
        </span>
      ),
    },
    {
      key: 'vendorName',
      header: 'Vendor / Payee',
      render: (row) => (
        row.vendorName ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={13} className="text-muted" />
            <span>{row.vendorName}</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        )
      ),
    },
    {
      key: 'isBillable',
      header: 'Billable',
      render: (row) => (
        <Badge tone={row.isBillable ? 'success' : 'neutral'}>
          {row.isBillable ? 'Billable' : 'Overhead'}
        </Badge>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Paid Through',
      render: (row) => row.paidThroughName || (((row as unknown as Record<string, unknown>).paymentMethod as string | undefined)) || 'Bank',
    },
    {
      key: 'total',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="font-bold text-red-600">{formatCurrency(row.total)}</span>,
    },
  ];

  return (
    <div className="page-container" style={{ paddingBottom: '40px' }}>
      <PageHeader
        title="Expense Tracker Dashboard"
        subtitle="Comprehensive visibility into operating costs, vendor allocations, and spending distribution"
        breadcrumb={['Purchases', 'Expense Tracker']}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button
              variant="secondary"
              icon={<ArrowRight size={15} />}
              onClick={() => navigate('/expenses')}
            >
              All Expenses
            </Button>
            <IfCanWrite>
              <Button
                variant="primary"
                icon={<Plus size={15} />}
                onClick={() => setCreating(true)}
              >
                Record Expense
              </Button>
            </IfCanWrite>
          </div>
        }
      />

      <div style={{ marginBottom: '20px' }}>
        <Toolbar>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span className="text-muted small font-medium" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} /> Time Horizon:
            </span>
            <FilterSelect
              label=""
              value={period}
              options={[
                { value: 'this_month', label: 'This Month' },
                { value: 'last_month', label: 'Last Month' },
                { value: 'this_quarter', label: 'This Quarter' },
                { value: 'this_fiscal_year', label: 'This Fiscal Year' },
                { value: 'all', label: 'All Records' },
              ]}
              onChange={(val) => setPeriod(val as PeriodKey)}
            />
            {dates.startDate && dates.endDate ? (
              <span className="text-muted small" style={{ marginLeft: '4px' }}>
                ({formatDate(dates.startDate)} to {formatDate(dates.endDate)})
              </span>
            ) : null}
          </div>
        </Toolbar>
      </div>

      {expensesQuery.loading && !expensesQuery.data ? (
        <LoadingBlock label="Loading expense metrics…" />
      ) : expensesQuery.error ? (
        <ErrorBlock message={expensesQuery.error} onRetry={expensesQuery.reload} />
      ) : (
        <>
          {/* Top KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <StatTile
              label="Total Spend"
              value={formatCurrency(stats.totalSpend)}
              sublabel={`${stats.count} recorded transaction${stats.count === 1 ? '' : 's'}`}
              icon={<Receipt size={20} />}
            />
            <StatTile
              label="Billable to Clients"
              value={formatCurrency(stats.billableSpend)}
              sublabel={`${stats.billablePct}% of total expenditures`}
              icon={<TrendingUp size={20} style={{ color: '#16a34a' }} />}
            />
            <StatTile
              label="Non-Billable Overhead"
              value={formatCurrency(stats.nonBillableSpend)}
              sublabel="Internal operating costs"
              icon={<TrendingDown size={20} style={{ color: '#f59e0b' }} />}
            />
            <StatTile
              label="Average Transaction"
              value={formatCurrency(stats.avgSpend)}
              sublabel={`Top category: ${stats.topCategory}`}
              icon={<Wallet size={20} />}
            />
          </div>

          {/* Breakdown Section: Categories & Payment Methods */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '20px',
              marginBottom: '24px',
            }}
          >
            {/* Category Breakdown */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PieChart size={18} className="text-primary" />
                  Expenses by Category
                </h3>
                <span className="text-muted small">{stats.categories.length} Categories</span>
              </div>

              {stats.categories.length === 0 ? (
                <p className="text-muted small">No category data recorded for this period.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {stats.categories.slice(0, 6).map((cat) => (
                    <div key={cat.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '4px' }}>
                        <span className="font-medium">{cat.name}</span>
                        <span className="text-muted">
                          {formatCurrency(cat.total)} ({cat.percent}%)
                        </span>
                      </div>
                      <div style={{ height: '7px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.min(cat.percent, 100)}%`,
                            backgroundColor: '#2563eb',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Vendors Spend */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building2 size={18} className="text-primary" />
                  Top Payees & Vendors
                </h3>
                <span className="text-muted small">Top 5 by volume</span>
              </div>

              {stats.topVendors.length === 0 ? (
                <p className="text-muted small">No vendor expenses recorded in this period.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {stats.topVendors.map((v, i) => (
                    <div
                      key={v.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: '#e0e7ff',
                            color: '#4338ca',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          {i + 1}
                        </span>
                        <div>
                          <div className="font-medium" style={{ fontSize: '0.9rem' }}>{v.name}</div>
                          <div className="text-muted small">{v.count} invoice{v.count === 1 ? '' : 's'}</div>
                        </div>
                      </div>
                      <div className="font-bold text-right" style={{ fontSize: '0.95rem' }}>
                        {formatCurrency(v.total)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Expenses List */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} className="text-primary" />
                Recent Expense Entries
              </h3>
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowRight size={13} />}
                onClick={() => navigate('/expenses')}
              >
                Open Full Table
              </Button>
            </div>

            {items.length === 0 ? (
              <EmptyState
                icon={<Receipt size={32} />}
                title="No expenses found"
                description="No operational expenses match your current horizon filter."
                action={
                  <IfCanWrite>
                    <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                      Record Expense
                    </Button>
                  </IfCanWrite>
                }
              />
            ) : (
              <DataTable
                columns={recentColumns}
                rows={items.slice(0, 10)}
                rowKey={(e) => e.id}
              />
            )}
          </div>
        </>
      )}

      {/* Record Expense Modal */}
      {creating && refs.data ? (
        <ExpenseFormModal
          refs={refs.data}
          expense={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            expensesQuery.reload();
          }}
        />
      ) : null}
    </div>
  );
}
