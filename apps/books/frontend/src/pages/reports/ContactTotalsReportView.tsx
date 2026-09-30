import { useAppContent } from '@/app/AppContentContext';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import type { ContactTotalsReport } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate, formatNumber } from '@/utils/format';

type TotalsRow = ContactTotalsReport['rows'][number];

interface ContactTotalsReportViewProps {
  kind: 'sales' | 'purchases';
  startDate: string;
  endDate: string;
}

export function ContactTotalsReportView({ kind, startDate, endDate }: ContactTotalsReportViewProps) {
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const query = { start_date: startDate, end_date: endDate };
  const { data, loading, error, reload } = useAsync(
    () => (kind === 'sales' ? reportsApi.salesByCustomer(query) : reportsApi.purchasesByVendor(query)),
    [kind, startDate, endDate],
  );

  if (loading) return <LoadingBlock label={t('reports.contactTotals.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const isSales = kind === 'sales';
  if (!data.rows.length) {
    return (
      <EmptyState
        title={isSales ? t('reports.contactTotals.empty.salesTitle') : t('reports.contactTotals.empty.purchasesTitle')}
        description={isSales ? t('reports.contactTotals.empty.salesBody') : t('reports.contactTotals.empty.purchasesBody')}
      />
    );
  }

  const totals = data.rows.reduce(
    (sum, row) => ({
      documentCount: sum.documentCount + row.documentCount,
      amount: sum.amount + row.amount,
      amountPaid: sum.amountPaid + row.amountPaid,
      balance: sum.balance + row.balance,
    }),
    { documentCount: 0, amount: 0, amountPaid: 0, balance: 0 },
  );

  const columns: Array<Column<TotalsRow>> = [
    {
      key: 'contact',
      header: isSales ? t('reports.contactTotals.col.customer') : t('reports.contactTotals.col.vendor'),
      render: (row) => <span className="strong">{row.contactName}</span>,
    },
    {
      key: 'count',
      header: isSales ? t('reports.contactTotals.col.invoices') : t('reports.contactTotals.col.bills'),
      align: 'right',
      render: (row) => <span className="num">{formatNumber(row.documentCount, 0)}</span>,
    },
    { key: 'amount', header: t('reports.contactTotals.col.amount'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.amount, currency)}</span> },
    { key: 'paid', header: t('reports.contactTotals.col.paid'), align: 'right', render: (row) => <span className="num text-success">{formatCurrency(row.amountPaid, currency)}</span> },
    {
      key: 'balance',
      header: t('reports.contactTotals.col.balance'),
      align: 'right',
      render: (row) => <span className={row.balance > 0 ? 'num strong text-warning' : 'num strong'}>{formatCurrency(row.balance, currency)}</span>,
    },
  ];

  return (
    <Card
      title={isSales ? t('reports.contactTotals.salesTitle') : t('reports.contactTotals.purchasesTitle')}
      subtitle={t('reports.contactTotals.cardSubtitle', {
        start: formatDate(data.startDate),
        end: formatDate(data.endDate),
        amount: formatCurrency(data.total, currency),
      })}
    >
      <DataTable
        columns={columns}
        rows={data.rows}
        rowKey={(row) => row.contactId}
        caption={isSales ? t('reports.contactTotals.salesCaption') : t('reports.contactTotals.purchasesCaption')}
        footer={
          <tr>
            <td>{t('reports.contactTotals.footer.total')}</td>
            <td className="align-right num">{formatNumber(totals.documentCount, 0)}</td>
            <td className="align-right num">{formatCurrency(totals.amount, currency)}</td>
            <td className="align-right num">{formatCurrency(totals.amountPaid, currency)}</td>
            <td className="align-right num">{formatCurrency(totals.balance, currency)}</td>
          </tr>
        }
      />
    </Card>
  );
}
