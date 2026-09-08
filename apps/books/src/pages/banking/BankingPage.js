import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Landmark, Trash2 } from 'lucide-react';
import { emptyPage } from '@/api/client';
import { accountingApi, bankingApi } from '@/api/endpoints';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/DataTable';
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
    const [selectedAccountId, setSelectedAccountId] = useState(null);
    const [page, setPage] = useState(1);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reconciledFilter, setReconciledFilter] = useState('all');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounced(search);
    const [selectedRows, setSelectedRows] = useState([]);
    const [accountModal, setAccountModal] = useState({ open: false, account: null });
    const [transactionModalOpen, setTransactionModalOpen] = useState(false);
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const summary = useAsync(() => bankingApi.summary(), []);
    const ledgerAccounts = useAsync(() => (canWrite ? accountingApi.accounts() : Promise.resolve([])), [canWrite]);
    const accounts = summary.data?.accounts ?? [];
    const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
    useEffect(() => {
        const available = summary.data?.accounts ?? [];
        if (!available.length)
            return;
        setSelectedAccountId((current) => {
            if (current && available.some((account) => account.id === current))
                return current;
            return available.find((account) => account.isPrimary)?.id ?? available[0].id;
        });
    }, [summary.data]);
    const transactions = useAsync(() => selectedAccountId
        ? bankingApi.transactions({
            bank_account_id: selectedAccountId,
            page,
            page_size: PAGE_SIZE,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
            reconciled: reconciledFilter === 'all' ? undefined : reconciledFilter === 'yes',
            search: debouncedSearch.trim() || undefined,
        })
        : Promise.resolve(emptyPage()), [selectedAccountId, page, startDate, endDate, reconciledFilter, debouncedSearch]);
    const rows = useMemo(() => transactions.data?.items ?? [], [transactions.data]);
    /** Cumulative movement across the rows currently on screen, oldest first. */
    const runningBalances = useMemo(() => {
        const balances = new Map();
        let total = 0;
        for (const transaction of [...rows].reverse()) {
            total += transaction.type === 'deposit' ? transaction.amount : -transaction.amount;
            balances.set(transaction.id, round2(total));
        }
        return balances;
    }, [rows]);
    const action = useSubmit();
    useEffect(() => {
        if (action.error)
            toast.error(action.error);
    }, [action.error, toast]);
    const resetFilters = () => {
        setPage(1);
        setSelectedRows([]);
    };
    const refresh = () => {
        summary.reload();
        transactions.reload();
    };
    const selectAccount = (accountId) => {
        setSelectedAccountId(accountId);
        resetFilters();
    };
    const toggleRow = (id) => setSelectedRows((current) => (current.includes(id) ? current.filter((rowId) => rowId !== id) : [...current, id]));
    const setReconciled = async (ids, reconciled) => {
        if (!ids.length)
            return;
        const result = await action.run(() => bankingApi.reconcile(ids, reconciled));
        if (result) {
            toast.success(result.message);
            setSelectedRows([]);
            refresh();
        }
    };
    const confirmDelete = async () => {
        if (!deleteTarget)
            return;
        const result = await action.run(() => bankingApi.removeTransaction(deleteTarget.id));
        setDeleteTarget(null);
        if (result) {
            toast.success(result.message);
            setSelectedRows([]);
            refresh();
        }
    };
    const columns = [
        ...(canWrite
            ? [
                {
                    key: 'select',
                    header: '',
                    width: '38px',
                    render: (transaction) => (_jsx("input", { type: "checkbox", className: "checkbox", checked: selectedRows.includes(transaction.id), "aria-label": `Select transaction dated ${formatDate(transaction.date)}`, onChange: () => toggleRow(transaction.id) })),
                },
            ]
            : []),
        { key: 'date', header: 'Date', render: (transaction) => formatDate(transaction.date) },
        {
            key: 'description',
            header: 'Description',
            render: (transaction) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { children: transaction.description }), transaction.reference ? _jsxs("small", { children: ["Ref: ", transaction.reference] }) : null] })),
        },
        { key: 'source', header: 'Source', render: (transaction) => _jsx(Badge, { tone: "neutral", children: titleCase(transaction.sourceType) }) },
        {
            key: 'counter',
            header: 'Counter account',
            render: (transaction) => _jsx("span", { className: "text-muted", children: transaction.counterAccountName ?? '—' }),
        },
        {
            key: 'deposit',
            header: 'Deposit',
            align: 'right',
            render: (transaction) => transaction.type === 'deposit' ? (_jsx("span", { className: "num text-success", children: formatCurrency(transaction.amount, selectedAccount?.currency) })) : (_jsx("span", { className: "text-subtle", children: "\u2014" })),
        },
        {
            key: 'withdrawal',
            header: 'Withdrawal',
            align: 'right',
            render: (transaction) => transaction.type === 'withdrawal' ? (_jsx("span", { className: "num text-danger", children: formatCurrency(transaction.amount, selectedAccount?.currency) })) : (_jsx("span", { className: "text-subtle", children: "\u2014" })),
        },
        {
            key: 'running',
            header: 'Running balance',
            align: 'right',
            render: (transaction) => _jsx("span", { className: "num", children: formatCurrency(runningBalances.get(transaction.id) ?? 0, selectedAccount?.currency) }),
        },
        {
            key: 'reconciled',
            header: 'Reconciled',
            align: 'center',
            render: (transaction) => canWrite ? (_jsx("input", { type: "checkbox", className: "checkbox", checked: transaction.isReconciled, disabled: action.submitting, "aria-label": `Mark transaction dated ${formatDate(transaction.date)} as reconciled`, onChange: (event) => void setReconciled([transaction.id], event.target.checked) })) : (_jsx(Badge, { tone: transaction.isReconciled ? 'success' : 'warning', children: transaction.isReconciled ? 'Yes' : 'No' })),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            render: (transaction) => canWrite && DELETABLE_SOURCES.has(transaction.sourceType) ? (_jsx("div", { className: "row-actions", children: _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": "Delete transaction", onClick: () => setDeleteTarget(transaction), children: _jsx(Trash2, { size: 15 }) }) })) : null,
        },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Banking", subtitle: "Cash and bank balances, transaction register and reconciliation.", actions: _jsxs(IfCanWrite, { children: [_jsx(Button, { onClick: () => setAccountModal({ open: true, account: null }), children: "Add account" }), _jsx(Button, { onClick: () => setTransferModalOpen(true), disabled: accounts.length < 2, children: "Transfer" }), _jsx(Button, { variant: "primary", onClick: () => setTransactionModalOpen(true), disabled: !selectedAccount, children: "Add transaction" })] }) }), summary.loading ? (_jsx(SkeletonRows, { rows: 3, columns: 3 })) : summary.error ? (_jsx(ErrorBlock, { message: summary.error, onRetry: summary.reload })) : !accounts.length ? (_jsx(EmptyState, { title: "No bank accounts yet", description: "Add a bank, cash or credit card account to start tracking money in and out.", icon: _jsx(Landmark, { size: 28, "aria-hidden": "true" }), action: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", onClick: () => setAccountModal({ open: true, account: null }), children: "Add account" }) }) })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "stat-grid", children: _jsx(StatTile, { label: "Total balance", value: formatCurrency(summary.data?.totalBalance), sublabel: `${accounts.length} account(s) · ${summary.data?.unreconciledCount ?? 0} unreconciled`, tone: (summary.data?.totalBalance ?? 0) < 0 ? 'negative' : 'positive', icon: _jsx(Landmark, { size: 16, "aria-hidden": "true" }) }) }), _jsx(BankAccountCards, { accounts: accounts, selectedAccountId: selectedAccountId, onSelect: selectAccount }), _jsxs(Card, { title: selectedAccount ? `${selectedAccount.name} register` : 'Transaction register', subtitle: selectedAccount ? formatCurrency(selectedAccount.currentBalance, selectedAccount.currency) + ' current balance' : undefined, actions: selectedAccount ? (_jsx(IfCanWrite, { children: _jsx(Button, { size: "sm", onClick: () => setAccountModal({ open: true, account: selectedAccount }), children: "Edit account" }) })) : null, children: [_jsxs(Toolbar, { children: [_jsx(SearchInput, { value: search, onChange: (value) => {
                                            setSearch(value);
                                            resetFilters();
                                        }, placeholder: "Search description or reference\u2026" }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "From" }), _jsx("input", { type: "date", className: "select select-sm", value: startDate, onChange: (event) => {
                                                    setStartDate(event.target.value);
                                                    resetFilters();
                                                } })] }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "To" }), _jsx("input", { type: "date", className: "select select-sm", value: endDate, onChange: (event) => {
                                                    setEndDate(event.target.value);
                                                    resetFilters();
                                                } })] }), _jsx(FilterSelect, { label: "Status", value: reconciledFilter, options: RECONCILED_OPTIONS, onChange: (value) => {
                                            setReconciledFilter(value);
                                            resetFilters();
                                        } })] }), _jsxs("div", { className: "stack", children: [canWrite && rows.length ? (_jsxs("div", { className: "row-between", children: [_jsx("span", { className: "small text-muted", children: selectedRows.length ? `${selectedRows.length} selected` : 'Select rows to reconcile in bulk' }), _jsxs("div", { className: "row", children: [_jsx(Button, { size: "sm", variant: "ghost", onClick: () => setSelectedRows(rows.map((transaction) => transaction.id)), children: "Select all on page" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setSelectedRows([]), disabled: !selectedRows.length, children: "Clear" }), _jsx(Button, { size: "sm", onClick: () => void setReconciled(selectedRows, true), disabled: !selectedRows.length, loading: action.submitting, children: "Mark reconciled" }), _jsx(Button, { size: "sm", onClick: () => void setReconciled(selectedRows, false), disabled: !selectedRows.length, children: "Mark unreconciled" })] })] })) : null, transactions.loading ? (_jsx(SkeletonRows, { rows: 6, columns: 7 })) : transactions.error ? (_jsx(ErrorBlock, { message: transactions.error, onRetry: transactions.reload })) : !rows.length ? (_jsx(EmptyState, { title: "No transactions found", description: "Adjust the filters, or record a deposit, withdrawal or transfer." })) : (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: rows, rowKey: (transaction) => transaction.id, caption: "Bank transaction register" }), _jsx("p", { className: "small text-subtle", children: "Running balance is a cumulative total of the rows visible on this page, in date order." }), _jsx(Pagination, { page: page, pageSize: PAGE_SIZE, total: transactions.data?.total ?? 0, onPageChange: setPage })] }))] })] })] })), _jsx(BankAccountModal, { open: accountModal.open, account: accountModal.account, onClose: () => setAccountModal({ open: false, account: null }), onSaved: (message) => {
                    setAccountModal({ open: false, account: null });
                    toast.success(message);
                    refresh();
                } }), _jsx(BankTransactionModal, { open: transactionModalOpen, account: selectedAccount, ledgerAccounts: ledgerAccounts.data ?? [], onClose: () => setTransactionModalOpen(false), onSaved: (message) => {
                    setTransactionModalOpen(false);
                    toast.success(message);
                    refresh();
                } }), _jsx(BankTransferModal, { open: transferModalOpen, accounts: accounts, defaultFromAccountId: selectedAccountId, onClose: () => setTransferModalOpen(false), onSaved: (message) => {
                    setTransferModalOpen(false);
                    toast.success(message);
                    refresh();
                } }), _jsx(ConfirmDialog, { open: !!deleteTarget, title: "Delete transaction", message: deleteTarget
                    ? `Delete the ${deleteTarget.type} of ${formatCurrency(deleteTarget.amount)} dated ${formatDate(deleteTarget.date)}? The ledger entry will be reversed.`
                    : '', confirmLabel: "Delete", busy: action.submitting, onConfirm: () => void confirmDelete(), onCancel: () => setDeleteTarget(null) })] }));
}
