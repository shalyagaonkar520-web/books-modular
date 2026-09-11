import { Card } from '@/components/ui/Card';
import { DonutChart } from '@/components/ui/Charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import type { ExpenseByCategoryReport } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/utils/format';

type CategoryRow = ExpenseByCategoryReport['rows'][number];

interface ExpensesByCategoryReportProps {
  startDate: string;
  endDate: string;
}

export function ExpensesByCategoryReport({ startDate, endDate }: ExpensesByCategoryReportProps) {
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(
    () => reportsApi.expensesByCategory({ start_date: startDate, end_date: endDate }),
    [startDate, endDate],
  );

  if (loading) return <LoadingBlock label="Grouping expenses by category…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.rows.length) {
    return <EmptyState title="No expenses in this period" description="Record an expense, or widen the date range, to see the breakdown." />;
  }

  const columns: Array<Column<CategoryRow>> = [
    { key: 'category', header: 'Category', render: (row) => <span className="strong">{row.accountName}</span> },
    { key: 'count', header: 'Expenses', align: 'right', render: (row) => <span className="num">{formatNumber(row.count, 0)}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="num">{formatCurrency(row.amount, currency)}</span> },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      render: (row) => <span className="num text-muted">{formatPercent(data.total > 0 ? (row.amount / data.total) * 100 : 0)}</span>,
    },
  ];

  const totalCount = data.rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="grid-2">
      <Card title="Expenses by category" subtitle={`${formatDate(data.startDate)} to ${formatDate(data.endDate)}`}>
        <DataTable
          columns={columns}
          rows={data.rows}
          rowKey={(row) => row.accountId}
          caption="Expenses grouped by category"
          footer={
            <tr>
              <td>Total</td>
              <td className="align-right num">{formatNumber(totalCount, 0)}</td>
              <td className="align-right num">{formatCurrency(data.total, currency)}</td>
              <td className="align-right num">{formatPercent(data.total > 0 ? 100 : 0)}</td>
            </tr>
          }
        />
      </Card>
      <Card title="Category mix" subtitle="Top categories in this period">
        <DonutChart slices={data.rows.slice(0, 6).map((row) => ({ label: row.accountName, value: row.amount }))} currency={currency} />
      </Card>
    </div>
  );
}
