/** Sales > Invoices: searchable, filterable list with inline status and payment actions. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, Eye, FileText, IndianRupee, Pencil, Plus, Send, Trash2 } from 'lucide-react';

import { contactsApi, invoicesApi } from '@/api/endpoints';
import type { Invoice, InvoiceListItem, Message } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Tabs, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { daysBetween, formatCurrency, formatDate, todayIso } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

import { RecordPaymentModal, type PaymentInvoiceContext } from './RecordPaymentModal';

const PAGE_SIZE = 25;

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
];

type PendingAction = { kind: 'void' | 'delete' | 'send'; invoice: InvoiceListItem };

/** Sent/partially-paid invoices with nothing paid yet may still be edited. */
function canEdit(invoice: InvoiceListItem): boolean {
  if (invoice.status === 'draft') return true;
  return (invoice.status === 'sent' || invoice.status === 'overdue') && invoice.amountPaid === 0;
}

function canTakePayment(invoice: InvoiceListItem): boolean {
  return ['sent', 'partially_paid', 'overdue'].includes(invoice.status) && invoice.balanceDue > 0;
}

export function InvoicesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { submitting, error: actionError, run, reset } = useSubmit();

  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [paymentFor, setPaymentFor] = useState<PaymentInvoiceContext | null>(null);
  const debouncedSearch = useDebounced(search);

  const customers = useAsync((signal) => contactsApi.list({ type: 'customer', page_size: 200 }, signal), []);
  const stats = useAsync(() => invoicesApi.stats(), []);
  const invoices = useAsync(
    (signal) =>
      invoicesApi.list(
        {
          status: status === 'all' ? undefined : status,
          customer_id: customerId || undefined,
          search: debouncedSearch.trim() || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
      ),
    [status, customerId, debouncedSearch, startDate, endDate, page],
  );

  const refresh = () => {
    invoices.reload();
    stats.reload();
  };

  const customerOptions = useMemo(
    () => [
      { value: '', label: 'All customers' },
      ...(customers.data?.items ?? []).map((customer) => ({ value: customer.id, label: customer.displayName })),
    ],
    [customers.data],
  );

  const runPending = async () => {
    if (!pending) return;
    const { kind, invoice } = pending;
    const result = await run<Message | Invoice>(() =>
      kind === 'delete' ? invoicesApi.remove(invoice.id) : invoicesApi.setStatus(invoice.id, kind === 'send' ? 'sent' : 'void'),
    );
    if (result) {
      toast.success(
        kind === 'delete'
          ? `Invoice ${invoice.invoiceNumber} deleted`
          : kind === 'send'
            ? `Invoice ${invoice.invoiceNumber} marked as sent`
            : `Invoice ${invoice.invoiceNumber} voided`,
      );
      setPending(null);
      refresh();
    }
  };

  const today = todayIso();

  const columns: Array<Column<InvoiceListItem>> = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (row) => (
        <span className="cell-stack">
          <Link to={`/invoices/${row.id}`} className="strong">
            {row.invoiceNumber}
          </Link>
          {row.reference ? <small>Ref {row.reference}</small> : null}
        </span>
      ),
    },
    { key: 'customerName', header: 'Customer', render: (row) => row.customerName },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    {
      key: 'dueDate',
      header: 'Due date',
      render: (row) => {
        const overdueBy = daysBetween(row.dueDate, today);
        return (
          <span className="cell-stack">
            <span>{formatDate(row.dueDate)}</span>
            {row.status === 'overdue' && overdueBy > 0 ? (
              <small className="text-danger">
                {overdueBy} {overdueBy === 1 ? 'day' : 'days'} overdue
              </small>
            ) : null}
          </span>
        );
      },
    },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge> },
    { key: 'total', header: 'Total', align: 'right', render: (row) => <span className="num">{formatCurrency(row.total)}</span> },
    {
      key: 'balanceDue',
      header: 'Balance due',
      align: 'right',
      render: (row) => <span className={`num ${row.balanceDue > 0 ? 'strong' : 'text-subtle'}`}>{formatCurrency(row.balanceDue)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <span className="row-actions">
          <button type="button" className="action-btn" aria-label={`View invoice ${row.invoiceNumber}`} onClick={() => navigate(`/invoices/${row.id}`)}>
            <Eye size={15} />
          </button>
          <IfCanWrite>
            <>
              {canEdit(row) ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={`Edit invoice ${row.invoiceNumber}`}
                  onClick={() => navigate(`/invoices/${row.id}/edit`)}
                >
                  <Pencil size={15} />
                </button>
              ) : null}
              {canTakePayment(row) ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={`Record payment for invoice ${row.invoiceNumber}`}
                  onClick={() =>
                    setPaymentFor({ id: row.id, invoiceNumber: row.invoiceNumber, customerId: row.customerId, balanceDue: row.balanceDue })
                  }
                >
                  <IndianRupee size={15} />
                </button>
              ) : null}
              {row.status === 'draft' ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={`Mark invoice ${row.invoiceNumber} as sent`}
                  onClick={() => {
                    reset();
                    setPending({ kind: 'send', invoice: row });
                  }}
                >
                  <Send size={15} />
                </button>
              ) : null}
              {row.status !== 'void' ? (
                <button
                  type="button"
                  className="action-btn is-danger"
                  aria-label={`Void invoice ${row.invoiceNumber}`}
                  onClick={() => {
                    reset();
                    setPending({ kind: 'void', invoice: row });
                  }}
                >
                  <Ban size={15} />
                </button>
              ) : null}
              {row.status === 'draft' || row.status === 'void' ? (
                <button
                  type="button"
                  className="action-btn is-danger"
                  aria-label={`Delete invoice ${row.invoiceNumber}`}
                  onClick={() => {
                    reset();
                    setPending({ kind: 'delete', invoice: row });
                  }}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </>
          </IfCanWrite>
        </span>
      ),
    },
  ];

  const rows = invoices.data?.items ?? [];
  const hasFilters = Boolean(debouncedSearch || customerId || startDate || endDate || status !== 'all');

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Everything you have billed your customers."
        actions={
          <IfCanWrite>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/invoices/new')}>
              New invoice
            </Button>
          </IfCanWrite>
        }
      />

      {stats.error ? (
        <ErrorBlock message={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="stat-grid">
          <StatTile label="Total outstanding" value={formatCurrency(stats.data?.totalOutstanding ?? 0)} sublabel={`${stats.data?.unpaidCount ?? 0} open invoices`} />
          <StatTile label="Overdue" value={formatCurrency(stats.data?.overdue ?? 0)} tone="negative" sublabel={`${stats.data?.overdueCount ?? 0} past due`} />
          <StatTile label="Due within 30 days" value={formatCurrency(stats.data?.dueWithin30Days ?? 0)} tone="warning" />
          <StatTile label="Drafts" value={String(stats.data?.draftCount ?? 0)} sublabel="Not yet sent" icon={<FileText size={15} />} />
        </div>
      )}

      <Tabs
        tabs={TABS}
        active={status}
        onChange={(id) => {
          setStatus(id);
          setPage(1);
        }}
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search invoice number, customer or reference…"
        />
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
        {invoices.loading ? (
          <SkeletonRows rows={6} columns={8} />
        ) : invoices.error ? (
          <ErrorBlock message={invoices.error} onRetry={invoices.reload} />
        ) : !rows.length ? (
          <EmptyState
            title={hasFilters ? 'No invoices match these filters' : 'No invoices yet'}
            description={hasFilters ? 'Try a different status, customer or date range.' : 'Create your first invoice to start billing customers.'}
            action={
              hasFilters ? null : (
                <IfCanWrite>
                  <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/invoices/new')}>
                    New invoice
                  </Button>
                </IfCanWrite>
              )
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Invoices" />
            <Pagination page={page} pageSize={invoices.data?.pageSize ?? PAGE_SIZE} total={invoices.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>

      <RecordPaymentModal
        open={!!paymentFor}
        invoice={paymentFor ?? undefined}
        onClose={() => setPaymentFor(null)}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === 'delete' ? 'Delete invoice' : pending?.kind === 'send' ? 'Mark invoice as sent' : 'Void invoice'}
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : pending?.kind === 'send' ? 'Mark as sent' : 'Void invoice'}
        tone={pending?.kind === 'send' ? 'primary' : 'danger'}
        busy={submitting}
        onCancel={() => setPending(null)}
        onConfirm={runPending}
        message={
          <>
            <FormError message={actionError} />
            {pending?.kind === 'delete' ? (
              <p>
                Invoice {pending.invoice.invoiceNumber} will be permanently removed. This cannot be undone.
              </p>
            ) : pending?.kind === 'send' ? (
              <p>
                Invoice {pending.invoice.invoiceNumber} will be posted to your books and can no longer be deleted.
              </p>
            ) : pending ? (
              <p>
                Voiding invoice {pending.invoice.invoiceNumber} reverses its ledger entries. Recorded payments must be deleted first.
              </p>
            ) : null}
          </>
        }
      />
    </>
  );
}
