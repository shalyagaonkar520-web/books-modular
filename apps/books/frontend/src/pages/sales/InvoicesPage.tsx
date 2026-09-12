import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, BellRing, CreditCard, Eye, FileDown, FileSpreadsheet, FileText, IndianRupee, Mail, Pencil, Plus, Send, Trash2 } from 'lucide-react';

import { ApiError } from '@/api/client';
import { contactsApi, invoicesApi } from '@/api/endpoints';
import type { Invoice, InvoiceListItem, Message } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Tabs, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useDownload } from '@/hooks/useDownload';
import { useSubmit } from '@/hooks/useSubmit';
import { daysBetween, formatCurrency, formatDate, todayIso } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

import { RecordPaymentModal, type PaymentInvoiceContext } from './RecordPaymentModal';
import { PayOnlineModal } from './PayOnlineModal';

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
  const { download } = useDownload();
  const { submitting, error: actionError, run, reset } = useSubmit();

  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [paymentFor, setPaymentFor] = useState<PaymentInvoiceContext | null>(null);
  const [payOnlineInvoice, setPayOnlineInvoice] = useState<InvoiceListItem | null>(null);
  const [mailInvoice, setMailInvoice] = useState<InvoiceListItem | null>(null);
  const [autoReminding, setAutoReminding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const debouncedSearch = useDebounced(search);

  async function confirmBulkDelete() {
    setBulkDeleteConfirmOpen(false);
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    let count = 0;
    const failedIds = new Set<string>();
    let lastError: string | null = null;
    for (const id of selectedIds) {
      try {
        await invoicesApi.remove(id);
        count++;
      } catch (err) {
        failedIds.add(id);
        lastError = err instanceof ApiError ? err.message : lastError;
      }
    }
    setBulkDeleting(false);
    if (failedIds.size > 0) {
      const reason = lastError ? ` ${lastError}` : '';
      toast.error(`Deleted ${count} of ${selectedIds.size} invoice(s); ${failedIds.size} could not be deleted.${reason}`);
    } else {
      toast.success(`Deleted ${count} invoice(s)`);
    }
    setSelectedIds(failedIds);
    refresh();
  }

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

  const handleAutoRemindOverdue = async () => {
    try {
      setAutoReminding(true);
      const res = await invoicesApi.autoRemindOverdue();
      if (res.reminders_sent > 0) {
        toast.success(`Successfully dispatched ${res.reminders_sent} overdue reminders via Gmail SMTP!`);
      } else {
        toast.notify(res.total_overdue > 0 ? 'Overdue invoices found, but no client emails on file.' : 'No overdue invoices found.', 'info');
      }
      refresh();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to trigger overdue reminders');
    } finally {
      setAutoReminding(false);
    }
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

  // Anything with no payments against it can be deleted; the API reverses
  // the ledger entries for a posted invoice on the way out.
  const isInvoiceDeletable = (invoice: InvoiceListItem) => invoice.amountPaid <= 0;

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
              {row.balanceDue > 0 && row.status !== 'void' ? (
                <button
                  type="button"
                  className="action-btn"
                  style={{ color: '#16a34a' }}
                  aria-label={`Pay invoice ${row.invoiceNumber} online via Razorpay`}
                  title="Pay Online via Razorpay"
                  onClick={() => setPayOnlineInvoice(row)}
                >
                  <CreditCard size={15} />
                </button>
              ) : null}
              <button
                type="button"
                className="action-btn"
                style={{ color: '#ea4335' }}
                aria-label={`Send invoice ${row.invoiceNumber} via Gmail`}
                title="Send invoice via Gmail"
                onClick={() => setMailInvoice(row)}
              >
                <Mail size={15} />
              </button>
              <button
                type="button"
                className="action-btn"
                style={{ color: '#dc2626' }}
                aria-label={`Download PDF for invoice ${row.invoiceNumber}`}
                title="Full PDF Extract"
                onClick={() => invoicesApi.downloadPdf(row.id, row.invoiceNumber)}
              >
                <FileDown size={15} />
              </button>
              <button
                type="button"
                className="action-btn"
                style={{ color: '#15803d' }}
                aria-label={`Download Excel for invoice ${row.invoiceNumber}`}
                title="Excel Extract"
                onClick={() => invoicesApi.downloadExcel(row.id, row.invoiceNumber)}
              >
                <FileSpreadsheet size={15} />
              </button>
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
              {isInvoiceDeletable(row) ? (
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
  const deletableRows = rows.filter(isInvoiceDeletable);
  const hasFilters = Boolean(debouncedSearch || customerId || startDate || endDate || status !== 'all');

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Everything you have billed your customers."
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<FileDown size={15} />}
              onClick={() =>
                void download(() => invoicesApi.exportPdf({
                  status: status === 'all' ? undefined : status,
                  customer_id: customerId || undefined,
                  search: debouncedSearch.trim() || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                }))
              }
            >
              Extract PDF
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={15} />}
              onClick={() =>
                void download(() => invoicesApi.exportExcel({
                  status: status === 'all' ? undefined : status,
                  customer_id: customerId || undefined,
                  search: debouncedSearch.trim() || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                }))
              }
            >
              Extract Excel
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/invoices/new')}>
                New invoice
              </Button>
            </IfCanWrite>
          </div>
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

      {status === 'overdue' ? (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ color: '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
              <BellRing size={16} /> Automated Overdue Reminders via Gmail SMTP
            </div>
            <div style={{ color: '#7f1d1d', fontSize: '13px', marginTop: '2px' }}>
              Scan and immediately send official overdue payment notices with attached PDF invoices to all customers with past-due balances.
            </div>
          </div>
          <Button
            variant="primary"
            loading={autoReminding}
            icon={<Mail size={15} />}
            style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' }}
            onClick={handleAutoRemindOverdue}
          >
            Auto-Send Overdue Reminders
          </Button>
        </div>
      ) : null}

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
            <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-subtle, #f8fafc)', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deletableRows.length === 0}
                  onClick={() => {
                    if (selectedIds.size === deletableRows.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(deletableRows.map((r) => r.id)));
                    }
                  }}
                >
                  {selectedIds.size === deletableRows.length && deletableRows.length > 0
                    ? 'Deselect All'
                    : `Select All on Page (${deletableRows.length})`}
                </Button>
                {selectedIds.size > 0 ? (
                  <span className="small text-muted">{selectedIds.size} selected</span>
                ) : null}
              </div>
              {selectedIds.size > 0 ? (
                <IfCanWrite>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={bulkDeleting}
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                    icon={<Trash2 size={13} />}
                  >
                    Delete Selected ({selectedIds.size})
                  </Button>
                </IfCanWrite>
              ) : null}
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              caption="Invoices"
              selectedKeys={selectedIds}
              onSelectRow={(id) => {
                const next = new Set(selectedIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelectedIds(next);
              }}
              onSelectAll={() => {
                if (selectedIds.size === deletableRows.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(deletableRows.map((r) => r.id)));
              }}
              isAllSelected={deletableRows.length > 0 && selectedIds.size === deletableRows.length}
              isRowSelectable={isInvoiceDeletable}
              rowNotSelectableReason={() => 'This invoice has payments recorded against it. Delete those payments first.'}
            />
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

      {mailInvoice ? (
        <SendInvoiceModal
          invoice={mailInvoice}
          onClose={() => setMailInvoice(null)}
          onSent={(message) => {
            toast.success(message);
            setMailInvoice(null);
            refresh();
          }}
        />
      ) : null}

      {payOnlineInvoice ? (
        <PayOnlineModal
          open
          invoice={{
            id: payOnlineInvoice.id,
            invoiceNumber: payOnlineInvoice.invoiceNumber,
            customerName: payOnlineInvoice.customerName,
            total: payOnlineInvoice.total,
            balanceDue: payOnlineInvoice.balanceDue,
          }}
          onClose={() => setPayOnlineInvoice(null)}
          onPaymentSuccess={() => {
            setPayOnlineInvoice(null);
            refresh();
          }}
        />
      ) : null}

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

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="Delete selected invoices"
        message={<p>{selectedIds.size} selected invoice(s) will be permanently removed. This cannot be undone.</p>}
        confirmLabel="Delete"
        busy={bulkDeleting}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => void confirmBulkDelete()}
      />
    </>
  );
}

interface SendInvoiceModalProps {
  invoice: InvoiceListItem;
  onClose: () => void;
  onSent: (message: string) => void;
}

function SendInvoiceModal({ invoice, onClose, onSent }: SendInvoiceModalProps) {
  const [email, setEmail] = useState('');
  const [loadingContact, setLoadingContact] = useState(true);
  const [sendAsOverdue, setSendAsOverdue] = useState(invoice.status === 'overdue');
  const [attachPdf, setAttachPdf] = useState(true);
  const [customNotes, setCustomNotes] = useState('');
  const { submitting, error, run } = useSubmit();

  useEffect(() => {
    let active = true;
    contactsApi
      .get(invoice.customerId)
      .then((c) => {
        if (active && c.email) setEmail(c.email);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingContact(false);
      });
    return () => {
      active = false;
    };
  }, [invoice.customerId]);

  async function handleSend() {
    if (!email.trim()) return;
    const result = await run(() =>
      invoicesApi.sendGmail(invoice.id, {
        to_email: email.trim(),
        send_as_overdue: sendAsOverdue,
        attach_pdf: attachPdf,
        custom_notes: customNotes.trim() || undefined,
      })
    );
    if (result) {
      onSent(
        sendAsOverdue
          ? `Overdue Payment Reminder for ${invoice.invoiceNumber} sent to ${email.trim()} via Gmail SMTP`
          : `Tax Invoice ${invoice.invoiceNumber} sent to ${email.trim()} via Gmail SMTP`
      );
    }
  }


  return (
    <Modal
      open
      size="md"
      title={`Gmail Send Options: ${invoice.invoiceNumber}`}
      subtitle={`Customer: ${invoice.customerName} · Total: ${formatCurrency(invoice.total)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!email.trim()}
            icon={<Mail size={15} />}
            style={sendAsOverdue ? { backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' } : undefined}
            onClick={handleSend}
          >
            {sendAsOverdue ? 'Send Overdue Reminder' : 'Send Tax Invoice'}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="stack" style={{ gap: '14px' }}>
        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>
            Email Mode:
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="emailMode"
                checked={!sendAsOverdue}
                onChange={() => setSendAsOverdue(false)}
              />
              <span>Standard Tax Invoice Dispatch</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer', color: '#b91c1c', fontWeight: 600 }}>
              <input
                type="radio"
                name="emailMode"
                checked={sendAsOverdue}
                onChange={() => setSendAsOverdue(true)}
              />
              <span>Overdue Payment Reminder</span>
            </label>
          </div>
        </div>

        <div className="form-grid">
          <TextField
            label="Customer"
            value={invoice.customerName}
            disabled
          />
          <TextField
            label="Recipient Email (Gmail)"
            type="email"
            required
            placeholder={loadingContact ? 'Loading contact email…' : 'e.g. customer@example.com'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Invoice Total"
            value={formatCurrency(invoice.total)}
            disabled
          />
          <TextField
            label={sendAsOverdue ? 'Balance Due (Overdue)' : 'Due Date'}
            value={sendAsOverdue ? formatCurrency(invoice.balanceDue) : formatDate(invoice.dueDate)}
            disabled
          />
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', cursor: 'pointer', padding: '4px 0' }}>
          <input
            type="checkbox"
            checked={attachPdf}
            onChange={(e) => setAttachPdf(e.target.checked)}
          />
          <span style={{ fontWeight: 500 }}>Attach generated official GST Tax Invoice PDF to email</span>
        </label>

        <TextAreaField
          label="Custom Note / Remittance Instructions (Optional)"
          value={customNotes}
          placeholder="e.g. Kindly share transaction UTR once processed..."
          rows={2}
          onChange={(e) => setCustomNotes(e.target.value)}
        />
      </div>
      <p className="small text-muted" style={{ marginTop: '12px' }}>
        Dispatched automatically via authenticated Gmail SMTP server (shalya@rooman.com).
      </p>
    </Modal>
  );
}
