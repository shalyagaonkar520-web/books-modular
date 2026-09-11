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
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(
    () => (kind === 'receivables' ? reportsApi.receivablesAging({ as_of: asOf }) : reportsApi.payablesAging({ as_of: asOf })),
    [kind, asOf],
  );

  if (loading) return <LoadingBlock label="Building the ageing report…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const isReceivables = kind === 'receivables';
  const contactHeader = isReceivables ? 'Customer' : 'Vendor';

  if (!data.rows.length) {
    return (
      <EmptyState
        title={isReceivables ? 'Nothing outstanding from customers' : 'Nothing outstanding to vendors'}
        description={
          isReceivables
            ? 'Every sent invoice has been paid as of this date.'
            : 'Every open bill has been paid as of this date.'
        }
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
    { key: 'current', header: 'Current', align: 'right', render: (row) => money(row.current) },
    { key: 'd1', header: '1–30 days', align: 'right', render: (row) => money(row.days1To30) },
    { key: 'd2', header: '31–60 days', align: 'right', render: (row) => money(row.days31To60) },
    { key: 'd3', header: '61–90 days', align: 'right', render: (row) => money(row.days61To90) },
    { key: 'd4', header: '> 90 days', align: 'right', render: (row) => <span className={row.daysOver90 > 0 ? 'num text-danger' : 'num'}>{formatCurrency(row.daysOver90, currency)}</span> },
    { key: 'total', header: 'Total', align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.total, currency)}</span> },
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        {data.buckets.map((bucket) => (
          <StatTile
            key={bucket.label}
            label={bucket.label}
            value={formatCurrency(bucket.amount, currency)}
            sublabel={`${bucket.count} ${bucket.count === 1 ? 'document' : 'documents'}`}
            tone={bucket.label === 'Current' ? 'neutral' : bucket.amount > 0 ? 'negative' : 'neutral'}
          />
        ))}
      </div>
      <Card
        title={isReceivables ? 'Receivables ageing' : 'Payables ageing'}
        subtitle={`As of ${formatDate(data.asOf)} · ${formatCurrency(data.total, currency)} outstanding`}
      >
        <DataTable
          columns={columns}
          rows={data.rows}
          rowKey={(row) => row.contactId}
          caption={isReceivables ? 'Receivables ageing by customer' : 'Payables ageing by vendor'}
          footer={
            <tr>
              <td>Total</td>
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
