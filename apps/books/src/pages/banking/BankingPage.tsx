import { useEffect, useMemo, useState } from 'react';
import { Landmark, Trash2 } from 'lucide-react';

import { emptyPage } from '@/api/client';
import { accountingApi, bankingApi } from '@/api/endpoints';
import type { BankAccount, BankTransaction } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, round2, titleCase } from '@/utils/format';

import { BankAccountCards } from './BankAccountCards';
import { BankAccountModal } from './BankAccountModal';
import { BankTransactionModal, BankTransferModal } from './BankTransactionModals';

const PAGE_SIZE = 25;

const RECONCILED_OPTIONS = [
  { value: 'all', label: 'All transactions' },
  { value: 'yes', label: 'Reconciled' },
  { value: 'no', label: 'Unreconciled' },
];

const DELETABLE_SOURCES = new Set(['manual', 'transfer']);

export function BankingPage() {
  const { canWrite } = useAuth();
  const toast = useToast();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reconciledFilter, setReconciledFilter] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const [accountModal, setAccountModal] = useState<{ open: boolean; account: BankAccount | null }>({ open: false, account: null });
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BankTransaction | null>(null);

  const summary = useAsync(() => bankingApi.summary(), []);
  const ledgerAccounts = useAsync(() => (canWrite ? accountingApi.accounts() : Promise.resolve([])), [canWrite]);

  const accounts = summary.data?.accounts ?? [];
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;

  useEffect(() => {
    const available = summary.data?.accounts ?? [];
    if (!available.length) return;
    setSelectedAccountId((current) => {
      if (current && available.some((account) => account.id === current)) return current;
      return available.find((account) => account.isPrimary)?.id ?? available[0].id;
    });
  }, [summary.data]);

  const transactions = useAsync(
    () =>
      selectedAccountId
        ? bankingApi.transactions({
            bank_account_id: selectedAccountId,
            page,
            page_size: PAGE_SIZE,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
            reconciled: reconciledFilter === 'all' ? undefined : reconciledFilter === 'yes',
            search: debouncedSearch.trim() || undefined,
          })
        : Promise.resolve(emptyPage<BankTransaction>()),
    [selectedAccountId, page, startDate, endDate, reconciledFilter, debouncedSearch],
  );

  const rows = useMemo(() => transactions.data?.items ?? [], [transactions.data]);

  /** Cumulative movement across the rows currently on screen, oldest first. */
  const runningBalances = useMemo(() => {
    const balances = new Map<string, number>();
    let total = 0;
    for (const transaction of [...rows].reverse()) {
      total += transaction.type === 'deposit' ? transaction.amount : -transaction.amount;
      balances.set(transaction.id, round2(total));
    }
    return balances;
  }, [rows]);

  const action = useSubmit();
  useEffect(() => {
    if (action.error) toast.error(action.error);
  }, [action.error, toast]);

  const resetFilters = () => {
    setPage(1);
    setSelectedRows([]);
  };

  const refresh = () => {
    summary.reload();
    transactions.reload();
  };

  const selectAccount = (accountId: string) => {
    setSelectedAccountId(accountId);
    resetFilters();
  };

  const toggleRow = (id: string) =>
    setSelectedRows((current) => (current.includes(id) ? current.filter((rowId) => rowId !== id) : [...current, id]));

  const setReconciled = async (ids: string[], reconciled: boolean) => {
    if (!ids.length) return;
    const result = await action.run(() => bankingApi.reconcile(ids, reconciled));
    if (result) {
      toast.success(result.message);
      setSelectedRows([]);
      refresh();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await action.run(() => bankingApi.removeTransaction(deleteTarget.id));
    setDeleteTarget(null);
    if (result) {
      toast.success(result.message);
      setSelectedRows([]);
      refresh();
    }
  };

  const columns: Array<Column<BankTransaction>> = [
    ...(canWrite
      ? [
          {
            key: 'select',
            header: '',
            width: '38px',
            render: (transaction: BankTransaction) => (
              <input
                type="checkbox"
                className="checkbox"
                checked={selectedRows.includes(transaction.id)}
                aria-label={`Select transaction dated ${formatDate(transaction.date)}`}
                onChange={() => toggleRow(transaction.id)}
              />
            ),
          },
        ]
      : []),
    { key: 'date', header: 'Date', render: (transaction) => formatDate(transaction.date) },
    {
      key: 'description',
      header: 'Description',
      render: (transaction) => (
        <div className="cell-stack">
          <span>{transaction.description}</span>
          {transaction.reference ? <small>Ref: {transaction.reference}</small> : null}
        </div>
      ),
    },
    { key: 'source', header: 'Source', render: (transaction) => <Badge tone="neutral">{titleCase(transaction.sourceType)}</Badge> },
    {
      key: 'counter',
      header: 'Counter account',
      render: (transaction) => <span className="text-muted">{transaction.counterAccountName ?? '—'}</span>,
    },
    {
      key: 'deposit',
      header: 'Deposit',
      align: 'right',
      render: (transaction) =>
        transaction.type === 'deposit' ? (
          <span className="num text-success">{formatCurrency(transaction.amount, selectedAccount?.currency)}</span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'withdrawal',
      header: 'Withdrawal',
      align: 'right',
      render: (transaction) =>
        transaction.type === 'withdrawal' ? (
          <span className="num text-danger">{formatCurrency(transaction.amount, selectedAccount?.currency)}</span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: 'running',
      header: 'Running balance',
      align: 'right',
      render: (transaction) => <span className="num">{formatCurrency(runningBalances.get(transaction.id) ?? 0, selectedAccount?.currency)}</span>,
    },
    {
      key: 'reconciled',
      header: 'Reconciled',
      align: 'center',
      render: (transaction) =>
        canWrite ? (
          <input
            type="checkbox"
            className="checkbox"
            checked={transaction.isReconciled}
            disabled={action.submitting}
            aria-label={`Mark transaction dated ${formatDate(transaction.date)} as reconciled`}
            onChange={(event) => void setReconciled([transaction.id], event.target.checked)}
          />
        ) : (
          <Badge tone={transaction.isReconciled ? 'success' : 'warning'}>{transaction.isReconciled ? 'Yes' : 'No'}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (transaction) =>
        canWrite && DELETABLE_SOURCES.has(transaction.sourceType) ? (
          <div className="row-actions">
            <button type="button" className="action-btn is-danger" aria-label="Delete transaction" onClick={() => setDeleteTarget(transaction)}>
              <Trash2 size={15} />
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Banking"
        subtitle="Cash and bank balances, transaction register and reconciliation."
        actions={
          <IfCanWrite>
            <Button onClick={() => setAccountModal({ open: true, account: null })}>Add account</Button>
            <Button onClick={() => setTransferModalOpen(true)} disabled={accounts.length < 2}>
              Transfer
            </Button>
            <Button variant="primary" onClick={() => setTransactionModalOpen(true)} disabled={!selectedAccount}>
              Add transaction
            </Button>
          </IfCanWrite>
        }
      />

      {summary.loading ? (
        <SkeletonRows rows={3} columns={3} />
      ) : summary.error ? (
        <ErrorBlock message={summary.error} onRetry={summary.reload} />
      ) : !accounts.length ? (
        <EmptyState
          title="No bank accounts yet"
          description="Add a bank, cash or credit card account to start tracking money in and out."
          icon={<Landmark size={28} aria-hidden="true" />}
          action={
            <IfCanWrite>
              <Button variant="primary" onClick={() => setAccountModal({ open: true, account: null })}>
                Add account
              </Button>
            </IfCanWrite>
          }
        />
      ) : (
        <>
          <div className="stat-grid">
            <StatTile
              label="Total balance"
              value={formatCurrency(summary.data?.totalBalance)}
              sublabel={`${accounts.length} account(s) · ${summary.data?.unreconciledCount ?? 0} unreconciled`}
              tone={(summary.data?.totalBalance ?? 0) < 0 ? 'negative' : 'positive'}
              icon={<Landmark size={16} aria-hidden="true" />}
            />
          </div>

          <BankAccountCards accounts={accounts} selectedAccountId={selectedAccountId} onSelect={selectAccount} />

          <Card
            title={selectedAccount ? `${selectedAccount.name} register` : 'Transaction register'}
            subtitle={selectedAccount ? formatCurrency(selectedAccount.currentBalance, selectedAccount.currency) + ' current balance' : undefined}
            actions={
              selectedAccount ? (
                <IfCanWrite>
                  <Button size="sm" onClick={() => setAccountModal({ open: true, account: selectedAccount })}>
                    Edit account
                  </Button>
                </IfCanWrite>
              ) : null
            }
          >
            <Toolbar>
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  resetFilters();
                }}
                placeholder="Search description or reference…"
              />
              <label className="filter-select">
                <span>From</span>
                <input
                  type="date"
                  className="select select-sm"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    resetFilters();
                  }}
                />
              </label>
              <label className="filter-select">
                <span>To</span>
                <input
                  type="date"
                  className="select select-sm"
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    resetFilters();
                  }}
                />
              </label>
              <FilterSelect
                label="Status"
                value={reconciledFilter}
                options={RECONCILED_OPTIONS}
                onChange={(value) => {
                  setReconciledFilter(value);
                  resetFilters();
                }}
              />
            </Toolbar>

            <div className="stack">
              {canWrite && rows.length ? (
                <div className="row-between">
                  <span className="small text-muted">
                    {selectedRows.length ? `${selectedRows.length} selected` : 'Select rows to reconcile in bulk'}
                  </span>
                  <div className="row">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedRows(rows.map((transaction) => transaction.id))}>
                      Select all on page
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedRows([])} disabled={!selectedRows.length}>
                      Clear
                    </Button>
                    <Button size="sm" onClick={() => void setReconciled(selectedRows, true)} disabled={!selectedRows.length} loading={action.submitting}>
                      Mark reconciled
                    </Button>
                    <Button size="sm" onClick={() => void setReconciled(selectedRows, false)} disabled={!selectedRows.length}>
                      Mark unreconciled
                    </Button>
                  </div>
                </div>
              ) : null}

              {transactions.loading ? (
                <SkeletonRows rows={6} columns={7} />
              ) : transactions.error ? (
                <ErrorBlock message={transactions.error} onRetry={transactions.reload} />
              ) : !rows.length ? (
                <EmptyState title="No transactions found" description="Adjust the filters, or record a deposit, withdrawal or transfer." />
              ) : (
                <>
                  <DataTable columns={columns} rows={rows} rowKey={(transaction) => transaction.id} caption="Bank transaction register" />
                  <p className="small text-subtle">Running balance is a cumulative total of the rows visible on this page, in date order.</p>
                  <Pagination page={page} pageSize={PAGE_SIZE} total={transactions.data?.total ?? 0} onPageChange={setPage} />
                </>
              )}
            </div>
          </Card>
        </>
      )}

      <BankAccountModal
        open={accountModal.open}
        account={accountModal.account}
        onClose={() => setAccountModal({ open: false, account: null })}
        onSaved={(message) => {
          setAccountModal({ open: false, account: null });
          toast.success(message);
          refresh();
        }}
      />
      <BankTransactionModal
        open={transactionModalOpen}
        account={selectedAccount}
        ledgerAccounts={ledgerAccounts.data ?? []}
        onClose={() => setTransactionModalOpen(false)}
        onSaved={(message) => {
          setTransactionModalOpen(false);
          toast.success(message);
          refresh();
        }}
      />
      <BankTransferModal
        open={transferModalOpen}
        accounts={accounts}
        defaultFromAccountId={selectedAccountId}
        onClose={() => setTransferModalOpen(false)}
        onSaved={(message) => {
          setTransferModalOpen(false);
          toast.success(message);
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete transaction"
        message={
          deleteTarget
            ? `Delete the ${deleteTarget.type} of ${formatCurrency(deleteTarget.amount)} dated ${formatDate(deleteTarget.date)}? The ledger entry will be reversed.`
            : ''
        }
        confirmLabel="Delete"
        busy={action.submitting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
