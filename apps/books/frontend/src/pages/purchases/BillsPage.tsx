import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, FileDown, FileSpreadsheet, FileText, Mail, Pencil, Plus, Trash2, Wallet } from 'lucide-react';

import { ApiError } from '@/api/client';
import { billsApi, contactsApi } from '@/api/endpoints';
import type { BillListItem } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Tabs, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useDownload } from '@/hooks/useDownload';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

import { BillDetailModal, overdueDays } from './BillDetailModal';
import { RecordVendorPaymentModal, type VendorPaymentBill } from './RecordVendorPaymentModal';

const PAGE_SIZE = 25;

const TAB_IDS = ['all', 'draft', 'unpaid', 'overdue', 'paid'] as const;

function canEditBill(bill: BillListItem): boolean {
  return (bill.status === 'draft' || bill.status === 'open' || bill.status === 'overdue') && bill.amountPaid <= 0;
}

function isPayable(bill: BillListItem): boolean {
  return ['open', 'partially_paid', 'overdue'].includes(bill.status) && bill.balanceDue > 0;
}

export function BillsPage() {
  const { t } = useAppContent();
  const navigate = useNavigate();
  const toast = useToast();
  const { download } = useDownload();
  const { canWrite } = useAuth();
  const [searchParams] = useSearchParams();

  const [statusTab, setStatusTab] = useState(() => searchParams.get('status') ?? 'all');
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [vendorId, setVendorId] = useState(() => searchParams.get('vendor') ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);
  const tabs = useMemo(() => TAB_IDS.map((id) => ({ id, label: t(`bills.tabs.${id}`) })), [t]);

  const [detailId, setDetailId] = useState<string | null>(() => searchParams.get('bill'));
  const [payTarget, setPayTarget] = useState<VendorPaymentBill | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'void' | 'delete'; bill: BillListItem } | null>(null);
  const [mailBill, setMailBill] = useState<BillListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const action = useSubmit();

  const stats = useAsync(() => billsApi.stats(), []);
  const vendors = useAsync((signal) => contactsApi.list({ type: 'vendor', page_size: 200 }, signal), []);

  const list = useAsync(
    (signal) =>
      billsApi.list(
        {
          status: statusTab === 'all' ? undefined : statusTab,
          vendor_id: vendorId || undefined,
          search: debouncedSearch.trim() || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
      ),
    [statusTab, vendorId, debouncedSearch, startDate, endDate, page],
  );

  const vendorOptions = useMemo(
    () => [
      { value: '', label: t('bills.filter.allVendors') },
      ...(vendors.data?.items ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName })),
    ],
    [vendors.data, t],
  );

  const refreshAll = () => {
    list.reload();
    stats.reload();
  };

  const confirmBulkDelete = async () => {
    setBulkDeleteConfirmOpen(false);
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    let count = 0;
    const failedIds = new Set<string>();
    let lastError: string | null = null;
    for (const id of selectedIds) {
      try {
        await billsApi.remove(id);
        count++;
      } catch (err) {
        failedIds.add(id);
        lastError = err instanceof ApiError ? err.message : lastError;
      }
    }
    setBulkDeleting(false);
    if (failedIds.size > 0) {
      const reason = lastError ? ` ${lastError}` : '';
      toast.error(t('bills.toast.bulkDeletePartial', { count, total: selectedIds.size, failed: failedIds.size, reason }));
    } else {
      toast.success(t('bills.toast.bulkDeleted', { count }));
    }
    setSelectedIds(failedIds);
    refreshAll();
  };

  const perform = async (fn: () => Promise<unknown>, message: string) => {
    const result = await action.run(fn);
    if (result) {
      toast.success(message);
      setConfirm(null);
      refreshAll();
    }
  };

  const rows = list.data?.items ?? [];
  // Anything with no payments against it can be deleted; the API reverses the
  // ledger entries for a posted bill on the way out.
  const isBillDeletable = (bill: BillListItem) => bill.amountPaid <= 0;
  const deletableRows = rows.filter(isBillDeletable);

  const columns: Array<Column<BillListItem>> = [
    {
      key: 'billNumber',
      header: t('bills.col.billNumber'),
      render: (bill) => (
        <button type="button" className="btn btn-link btn-sm" onClick={() => setDetailId(bill.id)}>
          <span className="code-tag">{bill.billNumber}</span>
        </button>
      ),
    },
    { key: 'vendorBillNumber', header: t('bills.col.vendorBillNumber'), render: (bill) => bill.vendorBillNumber || <span className="text-subtle">—</span> },
    { key: 'vendorName', header: t('bills.col.vendor'), render: (bill) => bill.vendorName },
    { key: 'date', header: t('bills.col.date'), render: (bill) => formatDate(bill.date) },
    {
      key: 'dueDate',
      header: t('bills.col.dueDate'),
      render: (bill) => {
        const late = overdueDays(bill);
        return (
          <div className="cell-stack">
            <span>{formatDate(bill.dueDate)}</span>
            {late > 0 ? <small className="text-danger">{late === 1 ? t('bills.overdue.one') : t('bills.overdue.many', { days: late })}</small> : null}
          </div>
        );
      },
    },
    { key: 'status', header: t('bills.col.status'), render: (bill) => <Badge tone={statusTone(bill.status)}>{statusLabel(bill.status, t)}</Badge> },
    { key: 'total', header: t('bills.col.total'), align: 'right', render: (bill) => <span className="num">{formatCurrency(bill.total)}</span> },
    {
      key: 'balanceDue',
      header: t('bills.col.balanceDue'),
      align: 'right',
      render: (bill) => <span className={`num ${bill.balanceDue > 0 ? 'strong' : 'text-subtle'}`}>{formatCurrency(bill.balanceDue)}</span>,
    },
    {
      key: 'actions',
      header: t('bills.col.actions'),
      align: 'right',
      render: (bill) => (
        <div className="row-actions">
          <button type="button" className="action-btn" aria-label={t('bills.aria.view', { number: bill.billNumber })} onClick={() => setDetailId(bill.id)}>
            <Eye size={15} />
          </button>
          <button
            type="button"
            className="action-btn"
            style={{ color: '#ea4335' }}
            aria-label={t('bills.aria.sendGmail', { number: bill.billNumber })}
            title={t('bills.tip.sendGmail')}
            onClick={() => setMailBill(bill)}
          >
            <Mail size={15} />
          </button>
          <button
            type="button"
            className="action-btn"
            style={{ color: '#dc2626' }}
            aria-label={t('bills.aria.downloadPdf', { number: bill.billNumber })}
            title={t('bills.tip.pdf')}
            onClick={() => billsApi.downloadPdf(bill.id, bill.billNumber)}
          >
            <FileDown size={15} />
          </button>
          <button
            type="button"
            className="action-btn"
            style={{ color: '#15803d' }}
            aria-label={t('bills.aria.downloadExcel', { number: bill.billNumber })}
            title={t('bills.tip.excel')}
            onClick={() => billsApi.downloadExcel(bill.id, bill.billNumber)}
          >
            <FileSpreadsheet size={15} />
          </button>
          {canWrite ? (
            <>
              {canEditBill(bill) ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={t('bills.aria.edit', { number: bill.billNumber })}
                  onClick={() => navigate(`/bills/${bill.id}/edit`)}
                >
                  <Pencil size={15} />
                </button>
              ) : null}
              {isPayable(bill) ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={t('bills.aria.recordPayment', { number: bill.billNumber })}
                  onClick={() => setPayTarget(bill)}
                >
                  <Wallet size={15} />
                </button>
              ) : null}
              {bill.status === 'draft' ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={t('bills.aria.markOpen', { number: bill.billNumber })}
                  onClick={() => perform(() => billsApi.setStatus(bill.id, 'open'), t('bills.toast.nowOpen', { number: bill.billNumber }))}
                >
                  <CheckCircle2 size={15} />
                </button>
              ) : null}
              {bill.status !== 'void' ? (
                <button
                  type="button"
                  className="action-btn is-danger"
                  aria-label={t('bills.aria.void', { number: bill.billNumber })}
                  onClick={() => setConfirm({ kind: 'void', bill })}
                >
                  <Ban size={15} />
                </button>
              ) : null}
              {isBillDeletable(bill) ? (
                <button
                  type="button"
                  className="action-btn is-danger"
                  aria-label={t('bills.aria.delete', { number: bill.billNumber })}
                  onClick={() => setConfirm({ kind: 'delete', bill })}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('bills.title')}
        subtitle={t('bills.subtitle')}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<FileDown size={15} />}
              onClick={() =>
                void download(() => billsApi.exportPdf({
                  status: statusTab === 'all' ? undefined : statusTab,
                  vendor_id: vendorId || undefined,
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
                void download(() => billsApi.exportExcel({
                  status: statusTab === 'all' ? undefined : statusTab,
                  vendor_id: vendorId || undefined,
                  search: debouncedSearch.trim() || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                }))
              }
            >
              {t('common.extractExcel')}
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/bills/new')}>
                {t('bills.new')}
              </Button>
            </IfCanWrite>
          </div>
        }
      />

      {stats.error ? (
        <ErrorBlock message={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="stat-grid">
          <StatTile label={t('bills.stat.outstanding')} value={stats.data ? formatCurrency(stats.data.totalOutstanding) : '—'} sublabel={stats.data ? t('bills.stat.unpaidSub', { count: stats.data.unpaidCount }) : undefined} />
          <StatTile label={t('bills.stat.overdue')} value={stats.data ? formatCurrency(stats.data.overdue) : '—'} tone="negative" sublabel={stats.data ? t('bills.stat.overdueSub', { count: stats.data.overdueCount }) : undefined} />
          <StatTile label={t('bills.stat.due30')} value={stats.data ? formatCurrency(stats.data.dueWithin30Days) : '—'} tone="warning" />
          <StatTile label={t('bills.stat.drafts')} value={stats.data ? String(stats.data.draftCount) : '—'} sublabel={t('bills.stat.draftsSub')} />
        </div>
      )}

      <Tabs
        tabs={tabs}
        active={statusTab}
        onChange={(id) => {
          setStatusTab(id);
          setPage(1);
        }}
      />

      <Toolbar>
        <SearchInput
          value={search}
          placeholder={t('bills.search.placeholder')}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <FilterSelect
          label={t('bills.filter.vendor')}
          value={vendorId}
          options={vendorOptions}
          onChange={(value) => {
            setVendorId(value);
            setPage(1);
          }}
        />
        <label className="filter-select">
          <span>{t('bills.filter.from')}</span>
          <input
            type="date"
            className="input select-sm"
            value={startDate}
            aria-label={t('bills.filter.fromAria')}
            onChange={(event) => {
              setStartDate(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="filter-select">
          <span>{t('bills.filter.to')}</span>
          <input
            type="date"
            className="input select-sm"
            value={endDate}
            aria-label={t('bills.filter.toAria')}
            onChange={(event) => {
              setEndDate(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </Toolbar>

      <FormError message={action.error} />

      <div className="card">
        {list.loading ? (
          <SkeletonRows rows={6} columns={9} />
        ) : list.error ? (
          <ErrorBlock message={list.error} onRetry={list.reload} />
        ) : !list.data || list.data.items.length === 0 ? (
          <EmptyState
            title={t('bills.empty.title')}
            description={t('bills.empty.body')}
            icon={<FileText size={28} aria-hidden="true" />}
            action={
              <IfCanWrite>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/bills/new')}>
                  {t('bills.new')}
                </Button>
              </IfCanWrite>
            }
          />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: 'var(--surface-muted, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deletableRows.length === 0}
                  onClick={() => {
                    if (selectedIds.size === deletableRows.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(deletableRows.map((b) => b.id)));
                    }
                  }}
                >
                  {selectedIds.size === deletableRows.length && deletableRows.length > 0
                    ? t('bills.bulk.deselectAll')
                    : t('bills.bulk.selectAllPage', { count: deletableRows.length })}
                </Button>
                {selectedIds.size > 0 ? (
                  <span className="small text-muted">{t('bills.bulk.selected', { count: selectedIds.size })}</span>
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
                    {t('bills.bulk.deleteSelected', { count: selectedIds.size })}
                  </Button>
                </IfCanWrite>
              ) : null}
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(bill) => bill.id}
              caption={t('bills.table.caption')}
              selectedKeys={selectedIds}
              onSelectRow={(id) => {
                const next = new Set(selectedIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelectedIds(next);
              }}
              onSelectAll={() => {
                if (selectedIds.size === deletableRows.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(deletableRows.map((b) => b.id)));
              }}
              isAllSelected={deletableRows.length > 0 && selectedIds.size === deletableRows.length}
              isRowSelectable={isBillDeletable}
              rowNotSelectableReason={() => t('bills.table.notSelectable')}
            />
            <Pagination page={list.data?.page ?? page} pageSize={list.data?.pageSize ?? PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>

      {detailId ? (
        <BillDetailModal
          billId={detailId}
          canWrite={canWrite}
          onClose={() => setDetailId(null)}
          onChanged={refreshAll}
          onRecordPayment={(bill) => setPayTarget(bill)}
        />
      ) : null}

      {payTarget ? (
        <RecordVendorPaymentModal
          bill={payTarget}
          onClose={() => setPayTarget(null)}
          onSaved={() => {
            setPayTarget(null);
            refreshAll();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'delete' ? t('bills.confirm.deleteTitle') : t('bills.confirm.voidTitle')}
        busy={action.submitting}
        confirmLabel={confirm?.kind === 'delete' ? t('bills.confirm.deleteButton') : t('bills.confirm.voidButton')}
        message={
          <>
            <p>
              {confirm?.kind === 'delete'
                ? t('bills.confirm.deleteBody', { number: confirm?.bill.billNumber ?? '' })
                : t('bills.confirm.voidBody', { number: confirm?.bill.billNumber ?? '' })}
            </p>
            <FormError message={action.error} />
          </>
        }
        onCancel={() => {
          setConfirm(null);
          action.reset();
        }}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'delete') {
            void perform(() => billsApi.remove(confirm.bill.id), t('bills.toast.deleted', { number: confirm.bill.billNumber }));
          } else {
            void perform(() => billsApi.setStatus(confirm.bill.id, 'void'), t('bills.toast.voided', { number: confirm.bill.billNumber }));
          }
        }}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title={t('bills.bulkConfirm.title')}
        message={<p>{t('bills.bulkConfirm.body', { count: selectedIds.size })}</p>}
        confirmLabel={t('bills.bulkConfirm.button')}
        busy={bulkDeleting}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => void confirmBulkDelete()}
      />

      {mailBill ? (
        <SendBillModal
          bill={mailBill}
          onClose={() => setMailBill(null)}
          onSent={(msg) => {
            toast.success(msg);
            setMailBill(null);
          }}
        />
      ) : null}
    </>
  );
}

interface SendBillModalProps {
  bill: BillListItem;
  onClose: () => void;
  onSent: (msg: string) => void;
}

function SendBillModal({ bill, onClose, onSent }: SendBillModalProps) {
  const { t } = useAppContent();
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState(() =>
    t('bills.send.defaultNotes', { number: bill.billNumber, vendor: bill.vendorName, amount: formatCurrency(bill.total) }),
  );
  const [attachPdf, setAttachPdf] = useState(true);
  const { submitting, error, run } = useSubmit();

  const handleSend = async () => {
    if (!email.trim()) return;
    const result = await run(() =>
      billsApi.sendGmail(bill.id, {
        to_email: email.trim(),
        attach_pdf: attachPdf,
        custom_notes: notes.trim() || undefined,
      }),
    );
    if (result) {
      onSent(result.message);
    }
  };

  return (
    <Modal
      open
      size="md"
      title={t('bills.send.title')}
      subtitle={t('bills.send.subtitle', { number: bill.billNumber, vendor: bill.vendorName, amount: formatCurrency(bill.total) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('bills.send.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} icon={<Mail size={15} />} onClick={handleSend}>
            {t('bills.send.submit')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField
          label={t('bills.send.email')}
          type="email"
          required
          placeholder={t('bills.send.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <CheckboxField
          label={t('bills.send.attachPdf')}
          checked={attachPdf}
          onChange={(e) => setAttachPdf(e.target.checked)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <TextAreaField
          label={t('bills.send.notes')}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
