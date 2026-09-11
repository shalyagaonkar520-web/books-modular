import { useCallback, useState } from 'react';
import { EyeOff, FileText, Link2 } from 'lucide-react';

import {
  razorpaySyncApi,
  type CategoryOption,
  type PagedResult,
  type RazorpayTransaction,
} from '@/api/razorpay';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { Tabs } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate } from '@/utils/format';

import { RazorpayTransactionDetail } from './RazorpayTransactionDetail';
import { reconciliationTone, statusToneFor } from './razorpayStatus';

const PAGE_SIZE = 25;

const FILTERS = [
  { id: 'needs_review', label: 'Needs review' },
  { id: 'unmatched', label: 'Unmatched' },
  { id: 'partially_matched', label: 'Partially matched' },
  { id: 'matched', label: 'Matched' },
  { id: 'ignored', label: 'Ignored' },
];

export function RazorpayReconciliation({ categories }: { categories: CategoryOption[] }) {
  const toast = useToast();
  const [filter, setFilter] = useState('needs_review');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync<PagedResult<RazorpayTransaction>>(
    () =>
      razorpaySyncApi.listTransactions({
        page,
        page_size: PAGE_SIZE,
        reconciliation_status: filter,
      }),
    [filter, page],
  );

  const overview = useAsync(() => razorpaySyncApi.getOverview(), []);

  const ignore = useCallback(
    async (row: RazorpayTransaction) => {
      setBusyId(row.id);
      try {
        await razorpaySyncApi.setReconciliation(row.id, 'ignored', 'Ignored during reconciliation');
        toast.success(`${row.razorpay_payment_id} ignored.`);
        reload();
        overview.reload();
      } catch {
        toast.error('Could not update this transaction.');
      } finally {
        setBusyId(null);
      }
    },
    [overview, reload, toast],
  );

  const counts = overview.data?.by_reconciliation ?? {};

  const columns: Array<Column<RazorpayTransaction>> = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.transaction_date ?? row.created_at) },
    {
      key: 'payment',
      header: 'Razorpay transaction',
      render: (row) => (
        <div className="cell-stack">
          <span>{row.description || row.customer_name || 'Payment'}</span>
          <span className="small mono">{row.razorpay_payment_id}</span>
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', render: (row) => row.customer_name ?? '—' },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount, row.currency) },
    {
      key: 'invoice',
      header: 'Rooman Books invoice',
      render: (row) =>
        row.invoice_number ? (
          <span>{row.invoice_number}</span>
        ) : (
          <span className="small">
            {row.invoice_match_confidence != null
              ? `Suggested at ${Math.round(row.invoice_match_confidence * 100)}% confidence`
              : 'No candidate'}
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Payment status',
      render: (row) => <Badge tone={statusToneFor(row.payment_status)}>{row.payment_status.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'reconciliation',
      header: 'State',
      render: (row) => (
        <Badge tone={reconciliationTone(row.reconciliation_status)}>
          {row.reconciliation_status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <Button
            size="sm"
            variant="secondary"
            icon={<Link2 size={14} />}
            onClick={() => setSelected(row.id)}
          >
            {row.invoice_id ? 'View' : 'Match'}
          </Button>
          {row.invoice_id ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<FileText size={14} />}
              onClick={() => setSelected(row.id)}
            >
              Entry
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              icon={<EyeOff size={14} />}
              loading={busyId === row.id}
              onClick={() => ignore(row)}
            >
              Ignore
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        {FILTERS.map((entry) => (
          <StatTile
            key={entry.id}
            label={entry.label}
            value={String(counts[entry.id] ?? 0)}
            sublabel="transactions"
            tone={entry.id === 'needs_review' && (counts[entry.id] ?? 0) > 0 ? 'warning' : 'neutral'}
          />
        ))}
      </div>

      <Card
        title="Reconciliation"
        subtitle="Compare Razorpay transactions against Rooman Books invoices and accounting entries."
      >
        <Tabs
          tabs={FILTERS.map((entry) => ({ ...entry, count: counts[entry.id] ?? 0 }))}
          active={filter}
          onChange={(id) => {
            setPage(1);
            setFilter(id);
          }}
        />

        {loading ? (
          <SkeletonRows rows={6} columns={8} />
        ) : error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="Nothing in this state" description="There are no transactions to review here." />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data.items}
              rowKey={(row) => row.id}
              onRowClick={(row) => setSelected(row.id)}
              caption="Razorpay reconciliation queue"
            />
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {selected ? (
        <RazorpayTransactionDetail
          paymentId={selected}
          categories={categories}
          onClose={() => setSelected(null)}
          onChanged={() => {
            reload();
            overview.reload();
          }}
        />
      ) : null}
    </div>
  );
}
