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
import { useAppContent } from '@/app/AppContentContext';
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
  { id: 'all', label: 'invoices.tab.all' },
  { id: 'draft', label: 'invoices.tab.draft' },
  { id: 'unpaid', label: 'invoices.tab.unpaid' },
  { id: 'overdue', label: 'invoices.tab.overdue' },
  { id: 'paid', label: 'invoices.tab.paid' },
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
  const { t } = useAppContent();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { download } = useDownload();
  const { submitting, error: actionError, run, reset } = useSubmit();

  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
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
      toast.error(t('invoices.bulk.partialFailed', { count, total: selectedIds.size, failed: failedIds.size, reason }));
    } else {
      toast.success(t('invoices.bulk.deleted', { count }));
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
        toast.success(t('invoices.remind.sent', { count: res.reminders_sent }));
      } else {
        toast.notify(res.total_overdue > 0 ? t('invoices.remind.noEmails') : t('invoices.remind.noneOverdue'), 'info');
      }
      refresh();
    } catch (err: unknown) {
      toast.error((err as Error).message || t('invoices.remind.failed'));
    } finally {
      setAutoReminding(false);
    }
  };

  const customerOptions = useMemo(
    () => [
      { value: '', label: t('invoices.filter.allCustomers') },
      ...(customers.data?.items ?? []).map((customer) => ({ value: customer.id, label: customer.displayName })),
    ],
    [customers.data, t],
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
          ? t('invoices.toast.deleted', { number: invoice.invoiceNumber })
          : kind === 'send'
            ? t('invoices.toast.markedSent', { number: invoice.invoiceNumber })
            : t('invoices.toast.voided', { number: invoice.invoiceNumber }),
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
      header: t('invoices.col.number'),
      render: (row) => (
        <span className="cell-stack">
          <Link to={`/invoices/${row.id}`} className="strong">
            {row.invoiceNumber}
          </Link>
          {row.reference ? <small>{t('invoices.col.ref', { reference: row.reference })}</small> : null}
        </span>
      ),
    },
    { key: 'customerName', header: t('invoices.col.customer'), render: (row) => row.customerName },
    { key: 'date', header: t('invoices.col.date'), render: (row) => formatDate(row.date) },
    {
      key: 'dueDate',
      header: t('invoices.col.dueDate'),
      render: (row) => {
        const overdueBy = daysBetween(row.dueDate, today);
        return (
          <span className="cell-stack">
            <span>{formatDate(row.dueDate)}</span>
            {row.status === 'overdue' && overdueBy > 0 ? (
              <small className="text-danger">
                {t(overdueBy === 1 ? 'invoices.col.overdueDay' : 'invoices.col.overdueDays', { count: overdueBy })}
              </small>
            ) : null}
          </span>
        );
      },
    },
    { key: 'status', header: t('invoices.col.status'), render: (row) => <Badge tone={statusTone(row.status)}>{statusLabel(row.status, t)}</Badge> },
    { key: 'total', header: t('invoices.col.total'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.total)}</span> },
    {
      key: 'balanceDue',
      header: t('invoices.col.balanceDue'),
      align: 'right',
      render: (row) => <span className={`num ${row.balanceDue > 0 ? 'strong' : 'text-subtle'}`}>{formatCurrency(row.balanceDue)}</span>,
    },
    {
      key: 'actions',
      header: t('invoices.col.actions'),
      align: 'right',
      render: (row) => (
        <span className="row-actions">
          <button type="button" className="action-btn" aria-label={t('invoices.action.view', { number: row.invoiceNumber })} onClick={() => navigate(`/invoices/${row.id}`)}>
            <Eye size={15} />
          </button>
          <IfCanWrite>
            <>
              {row.balanceDue > 0 && row.status !== 'void' ? (
                <button
                  type="button"
                  className="action-btn"
                  style={{ color: '#16a34a' }}
                  aria-label={t('invoices.action.payOnlineAria', { number: row.invoiceNumber })}
                  title={t('invoices.action.payOnlineTitle')}
                  onClick={() => setPayOnlineInvoice(row)}
                >
                  <CreditCard size={15} />
                </button>
              ) : null}
              <button
                type="button"
                className="action-btn"
                style={{ color: '#ea4335' }}
                aria-label={t('invoices.action.mailAria', { number: row.invoiceNumber })}
                title={t('invoices.action.mailTitle')}
                onClick={() => setMailInvoice(row)}
              >
                <Mail size={15} />
              </button>
              <button
                type="button"
                className="action-btn"
                style={{ color: '#dc2626' }}
                aria-label={t('invoices.action.pdfAria', { number: row.invoiceNumber })}
                title={t('invoices.action.pdfTitle')}
                onClick={() => invoicesApi.downloadPdf(row.id, row.invoiceNumber)}
              >
                <FileDown size={15} />
              </button>
              <button
                type="button"
                className="action-btn"
                style={{ color: '#15803d' }}
                aria-label={t('invoices.action.excelAria', { number: row.invoiceNumber })}
                title={t('invoices.action.excelTitle')}
                onClick={() => invoicesApi.downloadExcel(row.id, row.invoiceNumber)}
              >
                <FileSpreadsheet size={15} />
              </button>
              {canEdit(row) ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={t('invoices.action.edit', { number: row.invoiceNumber })}
                  onClick={() => navigate(`/invoices/${row.id}/edit`)}
                >
                  <Pencil size={15} />
                </button>
              ) : null}
              {canTakePayment(row) ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={t('invoices.action.recordPayment', { number: row.invoiceNumber })}
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
                  aria-label={t('invoices.action.markSent', { number: row.invoiceNumber })}
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
                  aria-label={t('invoices.action.void', { number: row.invoiceNumber })}
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
                  aria-label={t('invoices.action.delete', { number: row.invoiceNumber })}
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
        title={t('invoices.title')}
        subtitle={t('invoices.subtitle')}
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
              {t('common.extractPdf')}
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
              {t('common.extractExcel')}
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/invoices/new')}>
                {t('invoices.new')}
              </Button>
            </IfCanWrite>
          </div>
        }
      />

      {stats.error ? (
        <ErrorBlock message={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="stat-grid">
          <StatTile label={t('invoices.stat.outstanding')} value={formatCurrency(stats.data?.totalOutstanding ?? 0)} sublabel={t('invoices.stat.outstandingSub', { count: stats.data?.unpaidCount ?? 0 })} />
          <StatTile label={t('invoices.stat.overdue')} value={formatCurrency(stats.data?.overdue ?? 0)} tone="negative" sublabel={t('invoices.stat.overdueSub', { count: stats.data?.overdueCount ?? 0 })} />
          <StatTile label={t('invoices.stat.dueSoon')} value={formatCurrency(stats.data?.dueWithin30Days ?? 0)} tone="warning" />
          <StatTile label={t('invoices.stat.drafts')} value={String(stats.data?.draftCount ?? 0)} sublabel={t('invoices.stat.draftsSub')} icon={<FileText size={15} />} />
        </div>
      )}

      <Tabs
        tabs={TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
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
              <BellRing size={16} /> {t('invoices.remind.bannerTitle')}
            </div>
            <div style={{ color: '#7f1d1d', fontSize: '13px', marginTop: '2px' }}>
              {t('invoices.remind.bannerBody')}
            </div>
          </div>
          <Button
            variant="primary"
            loading={autoReminding}
            icon={<Mail size={15} />}
            style={{ backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' }}
            onClick={handleAutoRemindOverdue}
          >
            {t('invoices.remind.button')}
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
          placeholder={t('invoices.search.placeholder')}
        />
        <FilterSelect
          label={t('invoices.filter.customer')}
          value={customerId}
          options={customerOptions}
          onChange={(value) => {
            setCustomerId(value);
            setPage(1);
          }}
        />
        <label className="filter-select">
          <span>{t('invoices.filter.from')}</span>
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
          <span>{t('invoices.filter.to')}</span>
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
            title={hasFilters ? t('invoices.empty.filteredTitle') : t('invoices.empty.title')}
            description={hasFilters ? t('invoices.empty.filteredBody') : t('invoices.empty.body')}
            action={
              hasFilters ? null : (
                <IfCanWrite>
                  <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/invoices/new')}>
                    {t('invoices.new')}
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
                    ? t('invoices.bulk.deselectAll')
                    : t('invoices.bulk.selectAllOnPage', { count: deletableRows.length })}
                </Button>
                {selectedIds.size > 0 ? (
                  <span className="small text-muted">{t('invoices.bulk.selected', { count: selectedIds.size })}</span>
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
                    {t('invoices.bulk.deleteSelected', { count: selectedIds.size })}
                  </Button>
                </IfCanWrite>
              ) : null}
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              caption={t('invoices.table.caption')}
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
              rowNotSelectableReason={() => t('invoices.table.notSelectable')}
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
        title={pending?.kind === 'delete' ? t('invoices.confirm.deleteTitle') : pending?.kind === 'send' ? t('invoices.confirm.sendTitle') : t('invoices.confirm.voidTitle')}
        confirmLabel={pending?.kind === 'delete' ? t('invoices.confirm.deleteConfirm') : pending?.kind === 'send' ? t('invoices.confirm.sendConfirm') : t('invoices.confirm.voidConfirm')}
        tone={pending?.kind === 'send' ? 'primary' : 'danger'}
        busy={submitting}
        onCancel={() => setPending(null)}
        onConfirm={runPending}
        message={
          <>
            <FormError message={actionError} />
            {pending?.kind === 'delete' ? (
              <p>
                {t('invoices.confirm.deleteBody', { number: pending.invoice.invoiceNumber })}
              </p>
            ) : pending?.kind === 'send' ? (
              <p>
                {t('invoices.confirm.sendBody', { number: pending.invoice.invoiceNumber })}
              </p>
            ) : pending ? (
              <p>
                {t('invoices.confirm.voidBody', { number: pending.invoice.invoiceNumber })}
              </p>
            ) : null}
          </>
        }
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title={t('invoices.bulkDelete.title')}
        message={<p>{t('invoices.bulkDelete.body', { count: selectedIds.size })}</p>}
        confirmLabel={t('invoices.bulkDelete.confirm')}
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
  const { t } = useAppContent();
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
          ? t('invoices.gmail.sentOverdue', { number: invoice.invoiceNumber, email: email.trim() })
          : t('invoices.gmail.sentTax', { number: invoice.invoiceNumber, email: email.trim() })
      );
    }
  }


  return (
    <Modal
      open
      size="md"
      title={t('invoices.gmail.title', { number: invoice.invoiceNumber })}
      subtitle={t('invoices.gmail.subtitle', { customer: invoice.customerName, total: formatCurrency(invoice.total) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('invoices.gmail.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!email.trim()}
            icon={<Mail size={15} />}
            style={sendAsOverdue ? { backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' } : undefined}
            onClick={handleSend}
          >
            {sendAsOverdue ? t('invoices.gmail.sendOverdue') : t('invoices.gmail.sendTax')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="stack" style={{ gap: '14px' }}>
        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>
            {t('invoices.gmail.mode')}
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="emailMode"
                checked={!sendAsOverdue}
                onChange={() => setSendAsOverdue(false)}
              />
              <span>{t('invoices.gmail.modeStandard')}</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer', color: '#b91c1c', fontWeight: 600 }}>
              <input
                type="radio"
                name="emailMode"
                checked={sendAsOverdue}
                onChange={() => setSendAsOverdue(true)}
              />
              <span>{t('invoices.gmail.modeOverdue')}</span>
            </label>
          </div>
        </div>

        <div className="form-grid">
          <TextField
            label={t('invoices.gmail.customer')}
            value={invoice.customerName}
            disabled
          />
          <TextField
            label={t('invoices.gmail.email')}
            type="email"
            required
            placeholder={loadingContact ? t('invoices.gmail.loadingEmail') : t('invoices.gmail.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label={t('invoices.gmail.total')}
            value={formatCurrency(invoice.total)}
            disabled
          />
          <TextField
            label={sendAsOverdue ? t('invoices.gmail.balanceOverdue') : t('invoices.gmail.dueDate')}
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
          <span style={{ fontWeight: 500 }}>{t('invoices.gmail.attachPdf')}</span>
        </label>

        <TextAreaField
          label={t('invoices.gmail.notes')}
          value={customNotes}
          placeholder={t('invoices.gmail.notesPlaceholder')}
          rows={2}
          onChange={(e) => setCustomNotes(e.target.value)}
        />
      </div>
      <p className="small text-muted" style={{ marginTop: '12px' }}>
        {t('invoices.gmail.footer')}
      </p>
    </Modal>
  );
}
