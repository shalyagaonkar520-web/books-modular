import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileDown, FileSpreadsheet, Mail, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';

import { ApiError } from '@/api/client';
import { accountingApi, bankingApi, contactsApi, expensesApi } from '@/api/endpoints';
import type { Expense } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useDownload } from '@/hooks/useDownload';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatPercent, round2, todayIso } from '@/utils/format';

import { ExpenseFormModal, type ExpenseRefs } from './ExpenseFormModal';

const PAGE_SIZE = 25;
const MAX_SUMMARY_PAGES = 50;

function monthStart(): string {
  return `${todayIso().slice(0, 8)}01`;
}

export function ExpensesPage() {
  const { t } = useAppContent();
  const toast = useToast();
  const { download } = useDownload();
  const { canWrite, can } = useAuth();
  // Reading the chart of accounts and bank accounts is Admin/Viewer only, but
  // Staff may still record an expense - so skip those fetches for them rather
  // than 403 the account pickers.
  const canReadAccounts = can('admin', 'viewer');
  const [searchParams, setSearchParams] = useSearchParams();

  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(todayIso);
  const [accountId, setAccountId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(() => searchParams.get('new') === '1');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);
  const [mailExpense, setMailExpense] = useState<Expense | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const remove = useSubmit();

  const refs = useAsync(async (): Promise<ExpenseRefs> => {
    const [expenseAccounts, bankAccounts, vendorPage, customerPage] = await Promise.all([
      canReadAccounts ? accountingApi.accounts({ type: 'expense' }) : accountingApi.accountOptions('expense'),
      canReadAccounts ? bankingApi.accounts() : bankingApi.accountOptions(),
      contactsApi.list({ type: 'vendor', page_size: 200 }),
      contactsApi.list({ type: 'customer', page_size: 200 }),
    ]);
    return { expenseAccounts, bankAccounts, vendors: vendorPage.items, customers: customerPage.items };
  }, [canReadAccounts]);

  const filters = useMemo(
    () => ({
      account_id: accountId || undefined,
      vendor_id: vendorId || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    }),
    [accountId, vendorId, startDate, endDate],
  );

  const list = useAsync(() => expensesApi.list({ ...filters, page, page_size: PAGE_SIZE }), [filters, page]);

  const summary = useAsync(async () => {
    const rows: Expense[] = [];
    let total = 0;
    for (let current = 1; current <= MAX_SUMMARY_PAGES; current += 1) {
      const result = await expensesApi.list({ ...filters, page: current, page_size: 200 });
      total = result.total;
      rows.push(...result.items);
      if (result.items.length === 0 || rows.length >= total) break;
    }
    const spend = round2(rows.reduce((sum, row) => sum + row.total, 0));
    const billable = round2(rows.reduce((sum, row) => sum + (row.isBillable ? row.total : 0), 0));
    return { count: total, spend, billable, average: rows.length > 0 ? round2(spend / rows.length) : 0 };
  }, [filters]);

  const closeCreate = () => {
    setCreating(false);
    if (searchParams.has('new')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  };

  // Recent activity on the dashboard links here with ?expense=<id> - open that
  // expense's edit view directly instead of leaving the visitor on the filtered
  // current-month list, where an older expense wouldn't even be visible.
  useEffect(() => {
    const expenseId = searchParams.get('expense');
    if (!expenseId) return;
    let cancelled = false;
    void expensesApi.get(expenseId).then((expense) => {
      if (!cancelled) setEditing(expense);
    });
    const next = new URLSearchParams(searchParams);
    next.delete('expense');
    setSearchParams(next, { replace: true });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = () => {
    list.reload();
    summary.reload();
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
        await expensesApi.remove(id);
        count++;
      } catch (err) {
        failedIds.add(id);
        lastError = err instanceof ApiError ? err.message : lastError;
      }
    }
    setBulkDeleting(false);
    if (failedIds.size > 0) {
      const reason = lastError ? ` ${lastError}` : '';
      toast.error(t('expenses.toast.bulkDeletePartial', { count, total: selectedIds.size, failed: failedIds.size, reason }));
    } else {
      toast.success(t('expenses.toast.bulkDeleted', { count }));
    }
    setSelectedIds(failedIds);
    refreshAll();
  };

  const deleteExpense = async (expense: Expense) => {
    const result = await remove.run(() => expensesApi.remove(expense.id));
    if (result) {
      toast.success(t('expenses.toast.deleted', { number: expense.expenseNumber }));
      setPendingDelete(null);
      refreshAll();
    }
  };

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const rows = list.data?.items ?? [];

  const columns: Array<Column<Expense>> = [
    {
      key: 'expenseNumber',
      header: t('expenses.col.expenseNumber'),
      render: (expense) => (
        <div className="cell-stack">
          <span className="code-tag">{expense.expenseNumber}</span>
          {expense.isBillable ? <small>{t('expenses.billableTag')}</small> : null}
        </div>
      ),
    },
    { key: 'date', header: t('expenses.col.date'), render: (expense) => formatDate(expense.date) },
    { key: 'accountName', header: t('expenses.col.account'), render: (expense) => expense.accountName },
    { key: 'paidThroughName', header: t('expenses.col.paidThrough'), render: (expense) => expense.paidThroughName },
    {
      key: 'vendorName',
      header: t('expenses.col.vendor'),
      render: (expense) => expense.vendorName || <span className="text-subtle">—</span>,
    },
    { key: 'reference', header: t('expenses.col.reference'), render: (expense) => expense.reference || <span className="text-subtle">—</span> },
    { key: 'amount', header: t('expenses.col.amount'), align: 'right', render: (expense) => <span className="num">{formatCurrency(expense.amount)}</span> },
    {
      key: 'taxAmount',
      header: t('expenses.col.tax'),
      align: 'right',
      render: (expense) => (
        <div className="cell-stack">
          <span className="num">{formatCurrency(expense.taxAmount)}</span>
          <small>{formatPercent(expense.taxRate)}</small>
        </div>
      ),
    },
    { key: 'total', header: t('expenses.col.total'), align: 'right', render: (expense) => <span className="num strong">{formatCurrency(expense.total)}</span> },
    {
      key: 'actions',
      header: t('expenses.col.actions'),
      align: 'right',
      render: (expense) => (
        <div className="row-actions">
          <button
            type="button"
            className="action-btn"
            style={{ color: '#ea4335' }}
            aria-label={t('expenses.aria.sendGmail', { number: expense.expenseNumber })}
            title={t('expenses.tip.sendGmail')}
            onClick={() => setMailExpense(expense)}
          >
            <Mail size={15} />
          </button>
          {canWrite ? (
            <>
              <button type="button" className="action-btn" aria-label={t('expenses.aria.edit', { number: expense.expenseNumber })} onClick={() => setEditing(expense)}>
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="action-btn is-danger"
                aria-label={t('expenses.aria.delete', { number: expense.expenseNumber })}
                onClick={() => setPendingDelete(expense)}
              >
                <Trash2 size={15} />
              </button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<FileDown size={15} />}
              onClick={() =>
                void download(() => expensesApi.exportPdf({
                  account_id: accountId || undefined,
                  vendor_id: vendorId || undefined,
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
                void download(() => expensesApi.exportExcel({
                  account_id: accountId || undefined,
                  vendor_id: vendorId || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                }))
              }
            >
              {t('common.extractExcel')}
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                {t('expenses.record')}
              </Button>
            </IfCanWrite>
          </div>
        }
      />

      {summary.error ? (
        <ErrorBlock message={summary.error} onRetry={summary.reload} />
      ) : (
        <div className="stat-grid">
          <StatTile
            label={t('expenses.stat.totalSpend')}
            value={summary.data ? formatCurrency(summary.data.spend) : '—'}
            sublabel={`${formatDate(startDate)} – ${formatDate(endDate)}`}
          />
          <StatTile label={t('expenses.stat.recorded')} value={summary.data ? String(summary.data.count) : '—'} />
          <StatTile label={t('expenses.stat.average')} value={summary.data ? formatCurrency(summary.data.average) : '—'} />
          <StatTile label={t('expenses.stat.billable')} value={summary.data ? formatCurrency(summary.data.billable) : '—'} tone="warning" sublabel={t('expenses.stat.billableSub')} />
        </div>
      )}

      <Toolbar>
        <label className="filter-select">
          <span>{t('expenses.filter.from')}</span>
          <input type="date" className="input select-sm" value={startDate} aria-label={t('expenses.filter.fromAria')} onChange={(event) => resetPage(setStartDate)(event.target.value)} />
        </label>
        <label className="filter-select">
          <span>{t('expenses.filter.to')}</span>
          <input type="date" className="input select-sm" value={endDate} aria-label={t('expenses.filter.toAria')} onChange={(event) => resetPage(setEndDate)(event.target.value)} />
        </label>
        <FilterSelect
          label={t('expenses.filter.account')}
          value={accountId}
          onChange={resetPage(setAccountId)}
          options={[
            { value: '', label: t('expenses.filter.allAccounts') },
            ...(refs.data?.expenseAccounts ?? []).map((account) => ({ value: account.id, label: account.name })),
          ]}
        />
        <FilterSelect
          label={t('expenses.filter.vendor')}
          value={vendorId}
          onChange={resetPage(setVendorId)}
          options={[{ value: '', label: t('expenses.filter.allVendors') }, ...(refs.data?.vendors ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName }))]}
        />
      </Toolbar>

      <FormError message={remove.error} />

      <div className="card">
        {list.loading ? (
          <SkeletonRows rows={6} columns={9} />
        ) : list.error ? (
          <ErrorBlock message={list.error} onRetry={list.reload} />
        ) : !list.data || list.data.items.length === 0 ? (
          <EmptyState
            title={t('expenses.empty.title')}
            description={t('expenses.empty.body')}
            icon={<Receipt size={28} aria-hidden="true" />}
            action={
              <IfCanWrite>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                  {t('expenses.record')}
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
                  onClick={() => {
                    if (selectedIds.size === rows.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(rows.map((e) => e.id)));
                    }
                  }}
                >
                  {selectedIds.size === rows.length && rows.length > 0 ? t('expenses.bulk.deselectAll') : t('expenses.bulk.selectAllPage', { count: rows.length })}
                </Button>
                {selectedIds.size > 0 ? (
                  <span className="small text-muted">{t('expenses.bulk.selected', { count: selectedIds.size })}</span>
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
                    {t('expenses.bulk.deleteSelected', { count: selectedIds.size })}
                  </Button>
                </IfCanWrite>
              ) : null}
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(expense) => expense.id}
              caption={t('expenses.table.caption')}
              selectedKeys={selectedIds}
              onSelectRow={(id) => {
                const next = new Set(selectedIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelectedIds(next);
              }}
              onSelectAll={() => {
                if (selectedIds.size === rows.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(rows.map((e) => e.id)));
              }}
              isAllSelected={rows.length > 0 && selectedIds.size === rows.length}
            />
            <Pagination page={list.data?.page ?? page} pageSize={list.data?.pageSize ?? PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>

      {(creating || editing) && refs.data ? (
        <ExpenseFormModal
          refs={refs.data}
          expense={editing}
          onClose={() => {
            setEditing(null);
            closeCreate();
          }}
          onSaved={() => {
            setEditing(null);
            closeCreate();
            refreshAll();
          }}
        />
      ) : null}

      {(creating || editing) && !refs.data ? (
        <Modal open title={t('expenses.loadingModal.title')} size="md" onClose={() => { setEditing(null); closeCreate(); }}>
          {refs.error ? <ErrorBlock message={refs.error} onRetry={refs.reload} /> : <LoadingBlock label={t('expenses.loadingModal.loading')} />}
        </Modal>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('expenses.confirm.title')}
        confirmLabel={t('expenses.confirm.button')}
        busy={remove.submitting}
        message={
          <>
            <p>
              {t('expenses.confirm.body', {
                number: pendingDelete?.expenseNumber ?? '',
                amount: formatCurrency(pendingDelete?.total ?? 0),
                account: pendingDelete?.paidThroughName ?? '',
              })}
            </p>
            <FormError message={remove.error} />
          </>
        }
        onCancel={() => {
          setPendingDelete(null);
          remove.reset();
        }}
        onConfirm={() => {
          if (pendingDelete) void deleteExpense(pendingDelete);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title={t('expenses.bulkConfirm.title')}
        message={<p>{t('expenses.bulkConfirm.body', { count: selectedIds.size })}</p>}
        confirmLabel={t('expenses.bulkConfirm.button')}
        busy={bulkDeleting}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => void confirmBulkDelete()}
      />

      {mailExpense ? (
        <SendExpenseModal
          expense={mailExpense}
          onClose={() => setMailExpense(null)}
          onSent={(msg) => {
            toast.success(msg);
            setMailExpense(null);
          }}
        />
      ) : null}
    </>
  );
}

interface SendExpenseModalProps {
  expense: Expense;
  onClose: () => void;
  onSent: (msg: string) => void;
}

function SendExpenseModal({ expense, onClose, onSent }: SendExpenseModalProps) {
  const { t } = useAppContent();
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState(() =>
    t('expenses.send.defaultNotes', {
      number: expense.expenseNumber,
      amount: formatCurrency(expense.total),
      date: formatDate(expense.date),
      account: expense.accountName,
    }),
  );
  const [attachPdf, setAttachPdf] = useState(false);
  const { submitting, error, run } = useSubmit();

  const handleSend = async () => {
    if (!email.trim()) return;
    const result = await run(() =>
      expensesApi.sendGmail(expense.id, {
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
      title={t('expenses.send.title')}
      subtitle={t('expenses.send.subtitle', { number: expense.expenseNumber, account: expense.accountName, amount: formatCurrency(expense.total) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('expenses.send.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} icon={<Mail size={15} />} onClick={handleSend}>
            {t('expenses.send.submit')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField
          label={t('expenses.send.email')}
          type="email"
          required
          placeholder={t('expenses.send.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <CheckboxField
          label={t('expenses.send.attachPdf')}
          checked={attachPdf}
          onChange={(e) => setAttachPdf(e.target.checked)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <TextAreaField
          label={t('expenses.send.notes')}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
