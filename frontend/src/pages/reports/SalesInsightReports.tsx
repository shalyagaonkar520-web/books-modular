/** Two sales reports: how quickly each customer pays, and which items sell best. */
import { reportsApi, type CustomerPaymentRow, type ItemSalesRow } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, formatNumber } from '@/utils/format';

interface RangeProps {
  startDate: string;
  endDate: string;
}

export function CustomerPaymentBehaviourReport({ startDate, endDate }: RangeProps) {
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(() => reportsApi.customerPaymentBehaviour({ startDate, endDate }), [startDate, endDate]);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.rows.length) return <EmptyState title={t('reports.paymentBehaviour.empty')} />;

  const columns: Array<Column<CustomerPaymentRow>> = [
    { key: 'customer', header: t('reports.contactTotals.col.customer'), render: (row) => <span className="strong">{row.customerName}</span> },
    { key: 'invoices', header: t('reports.contactTotals.col.invoices'), align: 'right', render: (row) => <span className="num">{formatNumber(row.invoices, 0)}</span> },
    { key: 'paid', header: t('reports.paymentBehaviour.col.paid'), align: 'right', render: (row) => <span className="num">{formatNumber(row.paid, 0)}</span> },
    {
      key: 'days',
      header: t('reports.paymentBehaviour.col.avgDays'),
      align: 'right',
      render: (row) => <span className="num strong">{row.avgDaysToPay === null ? '—' : formatNumber(row.avgDaysToPay, 1)}</span>,
    },
    {
      key: 'onTime',
      header: t('reports.paymentBehaviour.col.onTime'),
      align: 'right',
      render: (row) => <span className="num">{row.onTimePercent === null ? '—' : `${row.onTimePercent}%`}</span>,
    },
    { key: 'outstanding', header: t('reports.contactTotals.col.balance'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.outstanding, currency)}</span> },
    {
      key: 'overdue',
      header: t('reports.paymentBehaviour.col.overdue'),
      align: 'right',
      render: (row) => <span className={row.overdue > 0 ? 'num strong text-warning' : 'num'}>{formatCurrency(row.overdue, currency)}</span>,
    },
  ];

  return (
    <Card title={t('reports.paymentBehaviour.title')} subtitle={t('reports.paymentBehaviour.cardSubtitle', { start: formatDate(data.startDate), end: formatDate(data.endDate) })}>
      <DataTable columns={columns} rows={data.rows} rowKey={(row) => row.customerId} caption={t('reports.paymentBehaviour.title')} />
    </Card>
  );
}

export function SalesByItemReport({ startDate, endDate }: RangeProps) {
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(() => reportsApi.salesByItem({ startDate, endDate }), [startDate, endDate]);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;
  if (!data.rows.length) return <EmptyState title={t('reports.salesByItem.empty')} />;

  const columns: Array<Column<ItemSalesRow>> = [
    {
      key: 'item',
      header: t('reports.salesByItem.col.item'),
      render: (row) => (
        <>
          <span className="strong">{row.name}</span>
          {row.sku ? <div className="small text-muted">{row.sku}</div> : null}
        </>
      ),
    },
    { key: 'quantity', header: t('reports.salesByItem.col.quantity'), align: 'right', render: (row) => <span className="num">{formatNumber(row.quantity, 2)}</span> },
    { key: 'invoices', header: t('reports.contactTotals.col.invoices'), align: 'right', render: (row) => <span className="num">{formatNumber(row.invoices, 0)}</span> },
    { key: 'sales', header: t('reports.salesByItem.col.sales'), align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.sales, currency)}</span> },
    { key: 'share', header: t('reports.salesByItem.col.share'), align: 'right', render: (row) => <span className="num">{`${row.sharePercent}%`}</span> },
  ];

  return (
    <Card
      title={t('reports.salesByItem.title')}
      subtitle={t('reports.salesByItem.cardSubtitle', { start: formatDate(data.startDate), end: formatDate(data.endDate), amount: formatCurrency(data.total, currency) })}
    >
      <DataTable columns={columns} rows={data.rows} rowKey={(row) => row.itemId ?? row.name} caption={t('reports.salesByItem.title')} />
    </Card>
  );
}
