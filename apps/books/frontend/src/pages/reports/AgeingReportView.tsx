import { useAppContent } from '@/app/AppContentContext';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import type { AgingReport } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate } from '@/utils/format';

type AgeingRow = AgingReport['rows'][number];

interface AgeingReportViewProps {
  kind: 'receivables' | 'payables';
  asOf: string;
}

export function AgeingReportView({ kind, asOf }: AgeingReportViewProps) {
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(
    () => (kind === 'receivables' ? reportsApi.receivablesAging({ as_of: asOf }) : reportsApi.payablesAging({ as_of: asOf })),
    [kind, asOf],
  );

  if (loading) return <LoadingBlock label={t('reports.ageing.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const isReceivables = kind === 'receivables';
  const contactHeader = isReceivables ? t('reports.ageing.col.customer') : t('reports.ageing.col.vendor');

  if (!data.rows.length) {
    return (
      <EmptyState
        title={isReceivables ? t('reports.ageing.empty.receivablesTitle') : t('reports.ageing.empty.payablesTitle')}
        description={isReceivables ? t('reports.ageing.empty.receivablesBody') : t('reports.ageing.empty.payablesBody')}
      />
    );
  }

  const totals = data.rows.reduce(
    (sum, row) => ({
      current: sum.current + row.current,
      days1To30: sum.days1To30 + row.days1To30,
      days31To60: sum.days31To60 + row.days31To60,
      days61To90: sum.days61To90 + row.days61To90,
      daysOver90: sum.daysOver90 + row.daysOver90,
      total: sum.total + row.total,
    }),
    { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, daysOver90: 0, total: 0 },
  );

  const money = (value: number) => <span className="num">{formatCurrency(value, currency)}</span>;

  const columns: Array<Column<AgeingRow>> = [
    { key: 'contact', header: contactHeader, render: (row) => <span className="strong">{row.contactName}</span> },
    { key: 'current', header: t('reports.ageing.col.current'), align: 'right', render: (row) => money(row.current) },
    { key: 'd1', header: t('reports.ageing.col.days1To30'), align: 'right', render: (row) => money(row.days1To30) },
    { key: 'd2', header: t('reports.ageing.col.days31To60'), align: 'right', render: (row) => money(row.days31To60) },
    { key: 'd3', header: t('reports.ageing.col.days61To90'), align: 'right', render: (row) => money(row.days61To90) },
    {
      key: 'd4',
      header: t('reports.ageing.col.daysOver90'),
      align: 'right',
      render: (row) => <span className={row.daysOver90 > 0 ? 'num text-danger' : 'num'}>{formatCurrency(row.daysOver90, currency)}</span>,
    },
    { key: 'total', header: t('reports.ageing.col.total'), align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.total, currency)}</span> },
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        {data.buckets.map((bucket) => (
          <StatTile
            key={bucket.label}
            label={bucket.label}
            value={formatCurrency(bucket.amount, currency)}
            sublabel={t(bucket.count === 1 ? 'reports.ageing.bucket.documentCountOne' : 'reports.ageing.bucket.documentCountMany', { count: bucket.count })}
            tone={bucket.label === 'Current' ? 'neutral' : bucket.amount > 0 ? 'negative' : 'neutral'}
          />
        ))}
      </div>
      <Card
        title={isReceivables ? t('reports.ageing.receivablesTitle') : t('reports.ageing.payablesTitle')}
        subtitle={t('reports.ageing.cardSubtitle', { date: formatDate(data.asOf), amount: formatCurrency(data.total, currency) })}
      >
        <DataTable
          columns={columns}
          rows={data.rows}
          rowKey={(row) => row.contactId}
          caption={isReceivables ? t('reports.ageing.receivablesCaption') : t('reports.ageing.payablesCaption')}
          footer={
            <tr>
              <td>{t('reports.ageing.footer.total')}</td>
              <td className="align-right num">{formatCurrency(totals.current, currency)}</td>
              <td className="align-right num">{formatCurrency(totals.days1To30, currency)}</td>
              <td className="align-right num">{formatCurrency(totals.days31To60, currency)}</td>
              <td className="align-right num">{formatCurrency(totals.days61To90, currency)}</td>
              <td className="align-right num">{formatCurrency(totals.daysOver90, currency)}</td>
              <td className="align-right num">{formatCurrency(totals.total, currency)}</td>
            </tr>
          }
        />
      </Card>
    </div>
  );
}
