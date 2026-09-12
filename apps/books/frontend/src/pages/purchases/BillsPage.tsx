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

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'paid', label: 'Paid' },
];

function canEditBill(bill: BillListItem): boolean {
  return (bill.status === 'draft' || bill.status === 'open' || bill.status === 'overdue') && bill.amountPaid <= 0;
}

function isPayable(bill: BillListItem): boolean {
  return ['open', 'partially_paid', 'overdue'].includes(bill.status) && bill.balanceDue > 0;
}

export function BillsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { download } = useDownload();
  const { canWrite } = useAuth();
  const [searchParams] = useSearchParams();

  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');
  const [vendorId, setVendorId] = useState(() => searchParams.get('vendor') ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

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
      { value: '', label: 'All vendors' },
      ...(vendors.data?.items ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName })),
    ],
    [vendors.data],
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
      toast.error(`Deleted ${count} of ${selectedIds.size} bill(s); ${failedIds.size} could not be deleted.${reason}`);
    } else {
      toast.success(`Deleted ${count} bill(s)`);
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
      header: 'Bill #',
      render: (bill) => (
        <button type="button" className="btn btn-link btn-sm" onClick={() => setDetailId(bill.id)}>
          <span className="code-tag">{bill.billNumber}</span>
        </button>
      ),
    },
    { key: 'vendorBillNumber', header: 'Vendor bill #', render: (bill) => bill.vendorBillNumber || <span className="text-subtle">—</span> },
    { key: 'vendorName', header: 'Vendor', render: (bill) => bill.vendorName },
    { key: 'date', header: 'Date', render: (bill) => formatDate(bill.date) },
    {
      key: 'dueDate',
      header: 'Due date',
      render: (bill) => {
        const late = overdueDays(bill);
        return (
          <div className="cell-stack">
            <span>{formatDate(bill.dueDate)}</span>
            {late > 0 ? <small className="text-danger">{late === 1 ? '1 day overdue' : `${late} days overdue`}</small> : null}
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (bill) => <Badge tone={statusTone(bill.status)}>{statusLabel(bill.status)}</Badge> },
    { key: 'total', header: 'Total', align: 'right', render: (bill) => <span className="num">{formatCurrency(bill.total)}</span> },
    {
      key: 'balanceDue',
      header: 'Balance due',
      align: 'right',
      render: (bill) => <span className={`num ${bill.balanceDue > 0 ? 'strong' : 'text-subtle'}`}>{formatCurrency(bill.balanceDue)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (bill) => (
        <div className="row-actions">
          <button type="button" className="action-btn" aria-label={`View bill ${bill.billNumber}`} onClick={() => setDetailId(bill.id)}>
            <Eye size={15} />
          </button>
          <button
            type="button"
            className="action-btn"
            style={{ color: '#ea4335' }}
            aria-label={`Send bill ${bill.billNumber} via Gmail`}
            title="Send bill via Gmail"
            onClick={() => setMailBill(bill)}
          >
            <Mail size={15} />
          </button>
          <button
            type="button"
            className="action-btn"
            style={{ color: '#dc2626' }}
            aria-label={`Download PDF for bill ${bill.billNumber}`}
            title="Full PDF Extract"
            onClick={() => billsApi.downloadPdf(bill.id, bill.billNumber)}
          >
            <FileDown size={15} />
          </button>
          <button
            type="button"
            className="action-btn"
            style={{ color: '#15803d' }}
            aria-label={`Download Excel for bill ${bill.billNumber}`}
            title="Excel Extract"
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
                  aria-label={`Edit bill ${bill.billNumber}`}
                  onClick={() => navigate(`/bills/${bill.id}/edit`)}
                >
                  <Pencil size={15} />
                </button>
              ) : null}
              {isPayable(bill) ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={`Record payment for bill ${bill.billNumber}`}
                  onClick={() => setPayTarget(bill)}
                >
                  <Wallet size={15} />
                </button>
              ) : null}
              {bill.status === 'draft' ? (
                <button
                  type="button"
                  className="action-btn"
                  aria-label={`Mark bill ${bill.billNumber} as open`}
                  onClick={() => perform(() => billsApi.setStatus(bill.id, 'open'), `Bill ${bill.billNumber} is now open`)}
                >
                  <CheckCircle2 size={15} />
                </button>
              ) : null}
              {bill.status !== 'void' ? (
                <button
                  type="button"
                  className="action-btn is-danger"
                  aria-label={`Void bill ${bill.billNumber}`}
                  onClick={() => setConfirm({ kind: 'void', bill })}
                >
                  <Ban size={15} />
                </button>
              ) : null}
              {isBillDeletable(bill) ? (
                <button
                  type="button"
                  className="action-btn is-danger"
                  aria-label={`Delete bill ${bill.billNumber}`}
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
        title="Bills"
        subtitle="Purchase bills owed to your vendors."
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
              Extract PDF
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
              Extract Excel
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/bills/new')}>
                New bill
              </Button>
            </IfCanWrite>
          </div>
        }
      />

      {stats.error ? (
        <ErrorBlock message={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="stat-grid">
          <StatTile label="Total outstanding" value={stats.data ? formatCurrency(stats.data.totalOutstanding) : '—'} sublabel={stats.data ? `${stats.data.unpaidCount} unpaid bills` : undefined} />
          <StatTile label="Overdue" value={stats.data ? formatCurrency(stats.data.overdue) : '—'} tone="negative" sublabel={stats.data ? `${stats.data.overdueCount} bills past due` : undefined} />
          <StatTile label="Due within 30 days" value={stats.data ? formatCurrency(stats.data.dueWithin30Days) : '—'} tone="warning" />
          <StatTile label="Drafts" value={stats.data ? String(stats.data.draftCount) : '—'} sublabel="Not yet posted to the ledger" />
        </div>
      )}

      <Tabs
        tabs={TABS}
        active={statusTab}
        onChange={(id) => {
          setStatusTab(id);
          setPage(1);
        }}
      />

      <Toolbar>
        <SearchInput
          value={search}
          placeholder="Search bill number, vendor bill number or vendor…"
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <FilterSelect
          label="Vendor"
          value={vendorId}
          options={vendorOptions}
          onChange={(value) => {
            setVendorId(value);
            setPage(1);
          }}
        />
        <label className="filter-select">
          <span>From</span>
          <input
            type="date"
            className="input select-sm"
            value={startDate}
            aria-label="Bills from date"
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
            aria-label="Bills to date"
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
            title="No bills found"
            description="Bills you record for your vendors will appear here."
            icon={<FileText size={28} aria-hidden="true" />}
            action={
              <IfCanWrite>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate('/bills/new')}>
                  New bill
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
              rowKey={(bill) => bill.id}
              caption="Bills"
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
              rowNotSelectableReason={() => 'This bill has payments recorded against it. Delete those payments first.'}
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
        title={confirm?.kind === 'delete' ? 'Delete this bill?' : 'Void this bill?'}
        busy={action.submitting}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete bill' : 'Void bill'}
        message={
          <>
            <p>
              {confirm?.kind === 'delete'
                ? `Bill ${confirm?.bill.billNumber} will be permanently deleted. Only draft or void bills can be deleted.`
                : `Bill ${confirm?.bill.billNumber} will be voided and its ledger entries reversed. Recorded payments must be deleted first.`}
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
            void perform(() => billsApi.remove(confirm.bill.id), `Bill ${confirm.bill.billNumber} deleted`);
          } else {
            void perform(() => billsApi.setStatus(confirm.bill.id, 'void'), `Bill ${confirm.bill.billNumber} voided`);
          }
        }}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="Delete selected bills"
        message={<p>{selectedIds.size} selected bill(s) will be permanently removed. This cannot be undone.</p>}
        confirmLabel="Delete"
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
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState(`Please find attached purchase bill #${bill.billNumber} from ${bill.vendorName} for ${formatCurrency(bill.total)}.`);
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
      title="Send Bill via Gmail"
      subtitle={`Bill #${bill.billNumber} • ${bill.vendorName} (${formatCurrency(bill.total)})`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={submitting} icon={<Mail size={15} />} onClick={handleSend}>
            Send Bill via Gmail
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField
          label="Recipient Email"
          type="email"
          required
          placeholder="vendor@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <CheckboxField
          label="Attach PDF Bill"
          checked={attachPdf}
          onChange={(e) => setAttachPdf(e.target.checked)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <TextAreaField
          label="Custom Notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
