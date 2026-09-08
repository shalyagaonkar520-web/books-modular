import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileDown, FileSpreadsheet, Mail, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';

import { accountingApi, bankingApi, contactsApi, expensesApi } from '@/api/endpoints';
import type { Expense } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatPercent, round2, todayIso } from '@/utils/format';

import { ExpenseFormModal, type ExpenseRefs } from './ExpenseFormModal';

const PAGE_SIZE = 25;
const MAX_SUMMARY_PAGES = 50;

function monthStart(): string {
  return `${todayIso().slice(0, 8)}01`;
}

export function ExpensesPage() {
  const toast = useToast();
  const { canWrite } = useAuth();
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
  const remove = useSubmit();

  const refs = useAsync(async (): Promise<ExpenseRefs> => {
    const [expenseAccounts, bankAccounts, vendorPage, customerPage] = await Promise.all([
      accountingApi.accounts({ type: 'expense' }),
      bankingApi.accounts(),
      contactsApi.list({ type: 'vendor', page_size: 200 }),
      contactsApi.list({ type: 'customer', page_size: 200 }),
    ]);
    return { expenseAccounts, bankAccounts, vendors: vendorPage.items, customers: customerPage.items };
  }, []);

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

  const refreshAll = () => {
    list.reload();
    summary.reload();
  };

  const confirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected expense(s)?`)) return;
    setBulkDeleting(true);
    let count = 0;
    for (const id of selectedIds) {
      try {
        await expensesApi.remove(id);
        count++;
      } catch {
        // continue
      }
    }
    setBulkDeleting(false);
    toast.success(`Deleted ${count} expense(s)`);
    setSelectedIds(new Set());
    refreshAll();
  };

  const deleteExpense = async (expense: Expense) => {
    const result = await remove.run(() => expensesApi.remove(expense.id));
    if (result) {
      toast.success(`Expense ${expense.expenseNumber} deleted`);
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
      header: 'Expense #',
      render: (expense) => (
        <div className="cell-stack">
          <span className="code-tag">{expense.expenseNumber}</span>
          {expense.isBillable ? <small>Billable</small> : null}
        </div>
      ),
    },
    { key: 'date', header: 'Date', render: (expense) => formatDate(expense.date) },
    { key: 'accountName', header: 'Expense account', render: (expense) => expense.accountName },
    { key: 'paidThroughName', header: 'Paid through', render: (expense) => expense.paidThroughName },
    {
      key: 'vendorName',
      header: 'Vendor',
      render: (expense) => expense.vendorName || <span className="text-subtle">—</span>,
    },
    { key: 'reference', header: 'Reference', render: (expense) => expense.reference || <span className="text-subtle">—</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (expense) => <span className="num">{formatCurrency(expense.amount)}</span> },
    {
      key: 'taxAmount',
      header: 'Tax',
      align: 'right',
      render: (expense) => (
        <div className="cell-stack">
          <span className="num">{formatCurrency(expense.taxAmount)}</span>
          <small>{formatPercent(expense.taxRate)}</small>
        </div>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', render: (expense) => <span className="num strong">{formatCurrency(expense.total)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (expense) => (
        <div className="row-actions">
          <button
            type="button"
            className="action-btn"
            style={{ color: '#ea4335' }}
            aria-label={`Send expense details for ${expense.expenseNumber} via Gmail`}
            title="Send expense details via Gmail"
            onClick={() => setMailExpense(expense)}
          >
            <Mail size={15} />
          </button>
          {canWrite ? (
            <>
              <button type="button" className="action-btn" aria-label={`Edit expense ${expense.expenseNumber}`} onClick={() => setEditing(expense)}>
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="action-btn is-danger"
                aria-label={`Delete expense ${expense.expenseNumber}`}
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
        title="Expenses"
        subtitle="Costs paid straight out of a bank, cash or credit card account."
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<FileDown size={15} />}
              onClick={() =>
                expensesApi.exportPdf({
                  account_id: accountId || undefined,
                  vendor_id: vendorId || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                })
              }
            >
              Extract PDF
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={15} />}
              onClick={() =>
                expensesApi.exportExcel({
                  account_id: accountId || undefined,
                  vendor_id: vendorId || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                })
              }
            >
              Extract Excel
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                Record expense
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
            label="Total spend"
            value={summary.data ? formatCurrency(summary.data.spend) : '—'}
            sublabel={`${formatDate(startDate)} – ${formatDate(endDate)}`}
          />
          <StatTile label="Expenses recorded" value={summary.data ? String(summary.data.count) : '—'} />
          <StatTile label="Average expense" value={summary.data ? formatCurrency(summary.data.average) : '—'} />
          <StatTile label="Billable" value={summary.data ? formatCurrency(summary.data.billable) : '—'} tone="warning" sublabel="Rebillable to customers" />
        </div>
      )}

      <Toolbar>
        <label className="filter-select">
          <span>From</span>
          <input type="date" className="input select-sm" value={startDate} aria-label="Expenses from date" onChange={(event) => resetPage(setStartDate)(event.target.value)} />
        </label>
        <label className="filter-select">
          <span>To</span>
          <input type="date" className="input select-sm" value={endDate} aria-label="Expenses to date" onChange={(event) => resetPage(setEndDate)(event.target.value)} />
        </label>
        <FilterSelect
          label="Account"
          value={accountId}
          onChange={resetPage(setAccountId)}
          options={[
            { value: '', label: 'All expense accounts' },
            ...(refs.data?.expenseAccounts ?? []).map((account) => ({ value: account.id, label: account.name })),
          ]}
        />
        <FilterSelect
          label="Vendor"
          value={vendorId}
          onChange={resetPage(setVendorId)}
          options={[{ value: '', label: 'All vendors' }, ...(refs.data?.vendors ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName }))]}
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
            title="No expenses in this period"
            description="Adjust the date range, or record an expense to get started."
            icon={<Receipt size={28} aria-hidden="true" />}
            action={
              <IfCanWrite>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                  Record expense
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
                  {selectedIds.size === rows.length && rows.length > 0 ? 'Deselect All' : `Select All on Page (${rows.length})`}
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
                    onClick={() => void confirmBulkDelete()}
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
              rowKey={(expense) => expense.id}
              caption="Expenses"
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
        <Modal open title="Record expense" size="md" onClose={() => { setEditing(null); closeCreate(); }}>
          {refs.error ? <ErrorBlock message={refs.error} onRetry={refs.reload} /> : <LoadingBlock label="Loading accounts…" />}
        </Modal>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this expense?"
        confirmLabel="Delete expense"
        busy={remove.submitting}
        message={
          <>
            <p>
              Expense {pendingDelete?.expenseNumber} for {formatCurrency(pendingDelete?.total ?? 0)} will be deleted. Its journal entry is reversed and the
              matching bank transaction on {pendingDelete?.paidThroughName} is removed, so the account balance goes back up.
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
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState(`Expense record #${expense.expenseNumber} for ${formatCurrency(expense.total)} on ${formatDate(expense.date)} (${expense.accountName}).`);
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
      title="Send Expense Details via Gmail"
      subtitle={`Expense #${expense.expenseNumber} • ${expense.accountName} (${formatCurrency(expense.total)})`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={submitting} icon={<Mail size={15} />} onClick={handleSend}>
            Send via Gmail
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
          placeholder="accountant@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <CheckboxField
          label="Attach PDF Report"
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
