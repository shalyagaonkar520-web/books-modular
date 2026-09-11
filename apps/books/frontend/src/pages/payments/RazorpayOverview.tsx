import { ArrowDownRight, ArrowUpRight, CalendarDays, CreditCard, Percent, RotateCcw, Wallet, XCircle } from 'lucide-react';

import { razorpaySyncApi, type PaymentsOverview } from '@/api/razorpay';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatNumber } from '@/utils/format';

interface MethodRow {
  method: string;
  count: number;
  amount: number;
}

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
  emi: 'EMI',
  other: 'Other',
};

export function RazorpayOverview() {
  const { data, loading, error, reload } = useAsync<PaymentsOverview>(() => razorpaySyncApi.getOverview(), []);

  if (loading) return <LoadingBlock label="Loading Razorpay figures…" />;
  if (error || !data) return <ErrorBlock message={error ?? 'Could not load the overview.'} onRetry={reload} />;

  const methodColumns: Array<Column<MethodRow>> = [
    {
      key: 'method',
      header: 'Payment method',
      render: (row) => METHOD_LABELS[row.method] ?? row.method,
    },
    { key: 'count', header: 'Transactions', align: 'right', render: (row) => formatNumber(row.count, 0) },
    { key: 'amount', header: 'Value', align: 'right', render: (row) => formatCurrency(row.amount) },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      render: (row) =>
        data.successful_payments > 0
          ? `${((row.amount / data.successful_payments) * 100).toFixed(1)}%`
          : '—',
    },
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile
          label="Total payments"
          value={formatCurrency(data.total_payments)}
          sublabel={`${formatNumber(data.total_payments_count, 0)} transactions`}
          icon={<Wallet size={16} />}
        />
        <StatTile
          label="Successful"
          value={formatCurrency(data.successful_payments)}
          sublabel={`${formatNumber(data.successful_count, 0)} captured`}
          tone="positive"
          icon={<ArrowUpRight size={16} />}
        />
        <StatTile
          label="Failed"
          value={formatCurrency(data.failed_payments)}
          sublabel={`${formatNumber(data.failed_count, 0)} failed`}
          tone={data.failed_count > 0 ? 'negative' : 'neutral'}
          icon={<XCircle size={16} />}
        />
        <StatTile
          label="Refunds"
          value={formatCurrency(data.refunds)}
          tone={data.refunds > 0 ? 'warning' : 'neutral'}
          icon={<RotateCcw size={16} />}
        />
        <StatTile
          label="Gateway fees"
          value={formatCurrency(data.gateway_fees)}
          sublabel="Fee plus GST"
          tone="negative"
          icon={<Percent size={16} />}
        />
        <StatTile
          label="Net revenue"
          value={formatCurrency(data.net_revenue)}
          sublabel="Successful less refunds and fees"
          tone={data.net_revenue >= 0 ? 'positive' : 'negative'}
          icon={<ArrowDownRight size={16} />}
        />
        <StatTile
          label="Today"
          value={formatCurrency(data.todays_payments)}
          icon={<CalendarDays size={16} />}
        />
        <StatTile
          label="This month"
          value={formatCurrency(data.this_month_payments)}
          icon={<CreditCard size={16} />}
        />
      </div>

      <Card title="By payment method" subtitle="Captured payments only">
        {data.by_method.length ? (
          <DataTable
            columns={methodColumns}
            rows={data.by_method}
            rowKey={(row) => row.method}
            caption="Captured Razorpay payments broken down by payment method"
          />
        ) : (
          <EmptyState
            title="No payments yet"
            description="Run a synchronisation from Settings → Integrations → Razorpay to import your transactions."
          />
        )}
      </Card>
    </div>
  );
}
