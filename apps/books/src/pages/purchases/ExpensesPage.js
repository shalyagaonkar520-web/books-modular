import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { accountingApi, bankingApi, contactsApi, expensesApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatPercent, round2, todayIso } from '@/utils/format';
import { ExpenseFormModal } from './ExpenseFormModal';
const PAGE_SIZE = 25;
const MAX_SUMMARY_PAGES = 50;
function monthStart() {
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
    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(() => searchParams.get('new') === '1');
    const [pendingDelete, setPendingDelete] = useState(null);
    const remove = useSubmit();
    const refs = useAsync(async () => {
        const [expenseAccounts, bankAccounts, vendorPage, customerPage] = await Promise.all([
            accountingApi.accounts({ type: 'expense' }),
            bankingApi.accounts(),
            contactsApi.list({ type: 'vendor', page_size: 200 }),
            contactsApi.list({ type: 'customer', page_size: 200 }),
        ]);
        return { expenseAccounts, bankAccounts, vendors: vendorPage.items, customers: customerPage.items };
    }, []);
    const filters = useMemo(() => ({
        account_id: accountId || undefined,
        vendor_id: vendorId || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
    }), [accountId, vendorId, startDate, endDate]);
    const list = useAsync(() => expensesApi.list({ ...filters, page, page_size: PAGE_SIZE }), [filters, page]);
    const summary = useAsync(async () => {
        const rows = [];
        let total = 0;
        for (let current = 1; current <= MAX_SUMMARY_PAGES; current += 1) {
            const result = await expensesApi.list({ ...filters, page: current, page_size: 200 });
            total = result.total;
            rows.push(...result.items);
            if (result.items.length === 0 || rows.length >= total)
                break;
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
    const deleteExpense = async (expense) => {
        const result = await remove.run(() => expensesApi.remove(expense.id));
        if (result) {
            toast.success(`Expense ${expense.expenseNumber} deleted`);
            setPendingDelete(null);
            refreshAll();
        }
    };
    const resetPage = (setter) => (value) => {
        setter(value);
        setPage(1);
    };
    const columns = [
        {
            key: 'expenseNumber',
            header: 'Expense #',
            render: (expense) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "code-tag", children: expense.expenseNumber }), expense.isBillable ? _jsx("small", { children: "Billable" }) : null] })),
        },
        { key: 'date', header: 'Date', render: (expense) => formatDate(expense.date) },
        { key: 'accountName', header: 'Expense account', render: (expense) => expense.accountName },
        { key: 'paidThroughName', header: 'Paid through', render: (expense) => expense.paidThroughName },
        {
            key: 'vendorName',
            header: 'Vendor',
            render: (expense) => expense.vendorName || _jsx("span", { className: "text-subtle", children: "\u2014" }),
        },
        { key: 'reference', header: 'Reference', render: (expense) => expense.reference || _jsx("span", { className: "text-subtle", children: "\u2014" }) },
        { key: 'amount', header: 'Amount', align: 'right', render: (expense) => _jsx("span", { className: "num", children: formatCurrency(expense.amount) }) },
        {
            key: 'taxAmount',
            header: 'Tax',
            align: 'right',
            render: (expense) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "num", children: formatCurrency(expense.taxAmount) }), _jsx("small", { children: formatPercent(expense.taxRate) })] })),
        },
        { key: 'total', header: 'Total', align: 'right', render: (expense) => _jsx("span", { className: "num strong", children: formatCurrency(expense.total) }) },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (expense) => canWrite ? (_jsxs("div", { className: "row-actions", children: [_jsx("button", { type: "button", className: "action-btn", "aria-label": `Edit expense ${expense.expenseNumber}`, onClick: () => setEditing(expense), children: _jsx(Pencil, { size: 15 }) }), _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete expense ${expense.expenseNumber}`, onClick: () => setPendingDelete(expense), children: _jsx(Trash2, { size: 15 }) })] })) : null,
        },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Expenses", subtitle: "Costs paid straight out of a bank, cash or credit card account.", actions: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => setCreating(true), children: "Record expense" }) }) }), summary.error ? (_jsx(ErrorBlock, { message: summary.error, onRetry: summary.reload })) : (_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Total spend", value: summary.data ? formatCurrency(summary.data.spend) : '—', sublabel: `${formatDate(startDate)} – ${formatDate(endDate)}` }), _jsx(StatTile, { label: "Expenses recorded", value: summary.data ? String(summary.data.count) : '—' }), _jsx(StatTile, { label: "Average expense", value: summary.data ? formatCurrency(summary.data.average) : '—' }), _jsx(StatTile, { label: "Billable", value: summary.data ? formatCurrency(summary.data.billable) : '—', tone: "warning", sublabel: "Rebillable to customers" })] })), _jsxs(Toolbar, { children: [_jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "From" }), _jsx("input", { type: "date", className: "input select-sm", value: startDate, "aria-label": "Expenses from date", onChange: (event) => resetPage(setStartDate)(event.target.value) })] }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "To" }), _jsx("input", { type: "date", className: "input select-sm", value: endDate, "aria-label": "Expenses to date", onChange: (event) => resetPage(setEndDate)(event.target.value) })] }), _jsx(FilterSelect, { label: "Account", value: accountId, onChange: resetPage(setAccountId), options: [
                            { value: '', label: 'All expense accounts' },
                            ...(refs.data?.expenseAccounts ?? []).map((account) => ({ value: account.id, label: account.name })),
                        ] }), _jsx(FilterSelect, { label: "Vendor", value: vendorId, onChange: resetPage(setVendorId), options: [{ value: '', label: 'All vendors' }, ...(refs.data?.vendors ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName }))] })] }), _jsx(FormError, { message: remove.error }), _jsx("div", { className: "card", children: list.loading ? (_jsx(SkeletonRows, { rows: 6, columns: 9 })) : list.error ? (_jsx(ErrorBlock, { message: list.error, onRetry: list.reload })) : !list.data || list.data.items.length === 0 ? (_jsx(EmptyState, { title: "No expenses in this period", description: "Adjust the date range, or record an expense to get started.", icon: _jsx(Receipt, { size: 28, "aria-hidden": "true" }), action: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => setCreating(true), children: "Record expense" }) }) })) : (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: list.data.items, rowKey: (expense) => expense.id, caption: "Expenses" }), _jsx(Pagination, { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: setPage })] })) }), (creating || editing) && refs.data ? (_jsx(ExpenseFormModal, { refs: refs.data, expense: editing, onClose: () => {
                    setEditing(null);
                    closeCreate();
                }, onSaved: () => {
                    setEditing(null);
                    closeCreate();
                    refreshAll();
                } })) : null, (creating || editing) && !refs.data ? (_jsx(Modal, { open: true, title: "Record expense", size: "md", onClose: () => { setEditing(null); closeCreate(); }, children: refs.error ? _jsx(ErrorBlock, { message: refs.error, onRetry: refs.reload }) : _jsx(LoadingBlock, { label: "Loading accounts\u2026" }) })) : null, _jsx(ConfirmDialog, { open: pendingDelete !== null, title: "Delete this expense?", confirmLabel: "Delete expense", busy: remove.submitting, message: _jsxs(_Fragment, { children: [_jsxs("p", { children: ["Expense ", pendingDelete?.expenseNumber, " for ", formatCurrency(pendingDelete?.total ?? 0), " will be deleted. Its journal entry is reversed and the matching bank transaction on ", pendingDelete?.paidThroughName, " is removed, so the account balance goes back up."] }), _jsx(FormError, { message: remove.error })] }), onCancel: () => {
                    setPendingDelete(null);
                    remove.reset();
                }, onConfirm: () => {
                    if (pendingDelete)
                        void deleteExpense(pendingDelete);
                } })] }));
}
