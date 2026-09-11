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
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const query = { start_date: startDate, end_date: endDate };
  const { data, loading, error, reload } = useAsync(
    () => (kind === 'sales' ? reportsApi.salesByCustomer(query) : reportsApi.purchasesByVendor(query)),
    [kind, startDate, endDate],
  );

  if (loading) return <LoadingBlock label="Crunching the numbers…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const isSales = kind === 'sales';
  if (!data.rows.length) {
    return (
      <EmptyState
        title={isSales ? 'No invoices in this period' : 'No bills in this period'}
        description={
          isSales
            ? 'Sales are counted once an invoice is sent. Pick a wider date range or send an invoice.'
            : 'Purchases are counted once a bill is open. Pick a wider date range or open a bill.'
        }
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
    { key: 'contact', header: isSales ? 'Customer' : 'Vendor', render: (row) => <span className="strong">{row.contactName}</span> },
    { key: 'count', header: isSales ? 'Invoices' : 'Bills', align: 'right', render: (row) => <span className="num">{formatNumber(row.documentCount, 0)}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="num">{formatCurrency(row.amount, currency)}</span> },
    { key: 'paid', header: 'Paid', align: 'right', render: (row) => <span className="num text-success">{formatCurrency(row.amountPaid, currency)}</span> },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (row) => <span className={row.balance > 0 ? 'num strong text-warning' : 'num strong'}>{formatCurrency(row.balance, currency)}</span>,
    },
  ];

  return (
    <Card
      title={isSales ? 'Sales by customer' : 'Purchases by vendor'}
      subtitle={`${formatDate(data.startDate)} to ${formatDate(data.endDate)} · ${formatCurrency(data.total, currency)} in total`}
    >
      <DataTable
        columns={columns}
        rows={data.rows}
        rowKey={(row) => row.contactId}
        caption={isSales ? 'Sales totals by customer' : 'Purchase totals by vendor'}
        footer={
          <tr>
            <td>Total</td>
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
