/** Sales > Payments received: every customer payment, with filters and recording. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Wallet } from 'lucide-react';

import { contactsApi, customerPaymentsApi } from '@/api/endpoints';
import type { CustomerPayment } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatNumber, round2 } from '@/utils/format';
import { PAYMENT_MODES } from '@/utils/status';

import { RecordPaymentModal } from './RecordPaymentModal';

const PAGE_SIZE = 25;
const TOTALS_PAGE_SIZE = 200;
const MAX_TOTALS_PAGES = 20;

const modeLabel = (mode: string): string => PAYMENT_MODES.find((option) => option.value === mode)?.label ?? mode;

interface RangeTotals {
  received: number;
  count: number;
  unapplied: number;
  /** True when the range holds more payments than we were willing to fetch. */
  truncated: boolean;
}

/** Sum the whole filtered range by walking the paginated endpoint. */
async function loadRangeTotals(query: { customer_id?: string; start_date?: string; end_date?: string }): Promise<RangeTotals> {
  let received = 0;
  let unapplied = 0;
  let count = 0;
  let page = 1;
  let total = 0;
  for (;;) {
    const result = await customerPaymentsApi.list({ ...query, page, page_size: TOTALS_PAGE_SIZE });
    total = result.total;
    for (const payment of result.items) {
      received += payment.amount;
      if (!payment.invoiceId) unapplied += payment.amount;
    }
    count += result.items.length;
    if (count >= total || !result.items.length) break;
    page += 1;
    if (page > MAX_TOTALS_PAGES) return { received: round2(received), count: total, unapplied: round2(unapplied), truncated: true };
  }
  return { received: round2(received), count: total, unapplied: round2(unapplied), truncated: false };
}

export function PaymentsReceivedPage() {
  const toast = useToast();
  const { submitting, error: actionError, run, reset } = useSubmit();

  const [customerId, setCustomerId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomerPayment | null>(null);

  const filters = useMemo(
    () => ({ customer_id: customerId || undefined, start_date: startDate || undefined, end_date: endDate || undefined }),
    [customerId, startDate, endDate],
  );

  const customers = useAsync((signal) => contactsApi.list({ type: 'customer', page_size: 200 }, signal), []);
  const payments = useAsync(() => customerPaymentsApi.list({ ...filters, page, page_size: PAGE_SIZE }), [filters, page]);
  const totals = useAsync(() => loadRangeTotals(filters), [filters]);

  const refresh = () => {
    payments.reload();
    totals.reload();
  };

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'All customers' },
      ...(customers.data?.items ?? []).map((customer) => ({ value: customer.id, label: customer.displayName })),
    ],
    [customers.data],
  );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const result = await run(() => customerPaymentsApi.remove(pendingDelete.id));
    if (result) {
      toast.success(result.message);
      setPendingDelete(null);
      refresh();
    }
  };

  const columns: Array<Column<CustomerPayment>> = [
    { key: 'paymentNumber', header: 'Payment #', render: (row) => <span className="mono">{row.paymentNumber}</span> },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'customerName', header: 'Customer', render: (row) => row.customerName },
    {
      key: 'invoiceNumber',
      header: 'Invoice',
      render: (row) =>
        row.invoiceId && row.invoiceNumber ? (
          <Link to={`/invoices/${row.invoiceId}`}>{row.invoiceNumber}</Link>
        ) : (
          <span className="text-subtle">Unapplied advance</span>
        ),
    },
    {
      key: 'mode',
      header: 'Mode',
      render: (row) => (
        <span className="cell-stack">
          <span>{modeLabel(row.mode)}</span>
          <small>{row.bankAccountName}</small>
        </span>
      ),
    },
    { key: 'reference', header: 'Reference', render: (row) => (row.reference ? <span className="code-tag">{row.reference}</span> : '—') },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.amount)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <IfCanWrite>
          <span className="row-actions">
            <button
              type="button"
              className="action-btn is-danger"
              aria-label={`Delete payment ${row.paymentNumber}`}
              onClick={() => {
                reset();
                setPendingDelete(row);
              }}
            >
              <Trash2 size={15} />
            </button>
          </span>
        </IfCanWrite>
      ),
    },
  ];

  const rows = payments.data?.items ?? [];
  const hasFilters = Boolean(customerId || startDate || endDate);
  const rangeLabel = startDate || endDate ? `${startDate ? formatDate(startDate) : 'the beginning'} – ${endDate ? formatDate(endDate) : 'today'}` : 'All time';

  return (
    <>
      <PageHeader
        title="Payments received"
        subtitle="Money collected from your customers."
        breadcrumb={['Sales', 'Payments received']}
        actions={
          <IfCanWrite>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setRecording(true)}>
              Record payment
            </Button>
          </IfCanWrite>
        }
      />

      {totals.error ? (
        <ErrorBlock message={totals.error} onRetry={totals.reload} />
      ) : (
        <div className="stat-grid">
          <StatTile
            label="Total received"
            value={formatCurrency(totals.data?.received ?? 0)}
            sublabel={totals.data?.truncated ? `${rangeLabel} (first ${formatNumber(TOTALS_PAGE_SIZE * MAX_TOTALS_PAGES, 0)} payments)` : rangeLabel}
            tone="positive"
            icon={<Wallet size={15} />}
          />
          <StatTile label="Payments" value={formatNumber(totals.data?.count ?? 0, 0)} sublabel="Records in this range" />
          <StatTile
            label="Unapplied advances"
            value={formatCurrency(totals.data?.unapplied ?? 0)}
            sublabel="Not linked to an invoice"
            tone={totals.data && totals.data.unapplied > 0 ? 'warning' : 'neutral'}
          />
        </div>
      )}

      <Toolbar>
        <FilterSelect
          label="Customer"
          value={customerId}
          options={customerOptions}
          onChange={(value) => {
            setCustomerId(value);
            setPage(1);
          }}
        />
        <label className="filter-select">
          <span>From</span>
          <input
            type="date"
            className="input select-sm"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="filter-select">
          <span>To</span>
          <input
            type="date"
            className="input select-sm"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </Toolbar>

      <div className="card">
        {payments.loading ? (
          <SkeletonRows rows={6} columns={8} />
        ) : payments.error ? (
          <ErrorBlock message={payments.error} onRetry={payments.reload} />
        ) : !rows.length ? (
          <EmptyState
            title={hasFilters ? 'No payments match these filters' : 'No payments recorded yet'}
            description={hasFilters ? 'Try a different customer or date range.' : 'Record a payment when a customer settles an invoice or pays in advance.'}
            action={
              hasFilters ? null : (
                <IfCanWrite>
                  <Button variant="primary" icon={<Plus size={15} />} onClick={() => setRecording(true)}>
                    Record payment
                  </Button>
                </IfCanWrite>
              )
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Payments received" />
            <Pagination page={page} pageSize={payments.data?.pageSize ?? PAGE_SIZE} total={payments.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>

      <RecordPaymentModal
        open={recording}
        customers={customers.data?.items ?? []}
        onClose={() => setRecording(false)}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete payment"
        confirmLabel="Delete payment"
        busy={submitting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        message={
          <>
            <FormError message={actionError} />
            {pendingDelete ? (
              <p>
                Payment {pendingDelete.paymentNumber} of {formatCurrency(pendingDelete.amount)} from {pendingDelete.customerName} will be deleted and its
                ledger entries reversed.
              </p>
            ) : null}
          </>
        }
      />
    </>
  );
}
