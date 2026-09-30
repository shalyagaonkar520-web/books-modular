import { useAppContent } from '@/app/AppContentContext';
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
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(
    () => reportsApi.expensesByCategory({ start_date: startDate, end_date: endDate }),
    [startDate, endDate],
  );

  if (loading) return <LoadingBlock label={t('reports.expensesByCategory.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.rows.length) {
    return <EmptyState title={t('reports.expensesByCategory.empty.title')} description={t('reports.expensesByCategory.empty.body')} />;
  }

  const columns: Array<Column<CategoryRow>> = [
    { key: 'category', header: t('reports.expensesByCategory.col.category'), render: (row) => <span className="strong">{row.accountName}</span> },
    { key: 'count', header: t('reports.expensesByCategory.col.expenses'), align: 'right', render: (row) => <span className="num">{formatNumber(row.count, 0)}</span> },
    { key: 'amount', header: t('reports.expensesByCategory.col.amount'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.amount, currency)}</span> },
    {
      key: 'share',
      header: t('reports.expensesByCategory.col.share'),
      align: 'right',
      render: (row) => <span className="num text-muted">{formatPercent(data.total > 0 ? (row.amount / data.total) * 100 : 0)}</span>,
    },
  ];

  const totalCount = data.rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="grid-2">
      <Card
        title={t('reports.expensesByCategory.cardTitle')}
        subtitle={t('reports.dateRange', { start: formatDate(data.startDate), end: formatDate(data.endDate) })}
      >
        <DataTable
          columns={columns}
          rows={data.rows}
          rowKey={(row) => row.accountId}
          caption={t('reports.expensesByCategory.tableCaption')}
          footer={
            <tr>
              <td>{t('reports.expensesByCategory.footer.total')}</td>
              <td className="align-right num">{formatNumber(totalCount, 0)}</td>
              <td className="align-right num">{formatCurrency(data.total, currency)}</td>
              <td className="align-right num">{formatPercent(data.total > 0 ? 100 : 0)}</td>
            </tr>
          }
        />
      </Card>
      <Card title={t('reports.expensesByCategory.mixTitle')} subtitle={t('reports.expensesByCategory.mixSubtitle')}>
        <DonutChart slices={data.rows.slice(0, 6).map((row) => ({ label: row.accountName, value: row.amount }))} currency={currency} />
      </Card>
    </div>
  );
}
