import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { accountingApi } from '@/api/endpoints';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { CheckboxField } from '@/components/ui/Field';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, titleCase } from '@/utils/format';
import { AccountModal, ACCOUNT_TYPE_OPTIONS } from './AccountModal';
const TYPE_FILTER_OPTIONS = [{ value: '', label: 'All types' }, ...ACCOUNT_TYPE_OPTIONS];
export function ChartOfAccountsTab() {
    const { canWrite } = useAuth();
    const toast = useToast();
    const [typeFilter, setTypeFilter] = useState('');
    const [includeInactive, setIncludeInactive] = useState(false);
    const [modal, setModal] = useState({ open: false, account: null });
    const [deleteTarget, setDeleteTarget] = useState(null);
    const accounts = useAsync(() => accountingApi.accounts({ type: typeFilter || undefined, include_inactive: includeInactive }), [typeFilter, includeInactive]);
    const action = useSubmit();
    useEffect(() => {
        if (action.error)
            toast.error(action.error);
    }, [action.error, toast]);
    const confirmDelete = async () => {
        if (!deleteTarget)
            return;
        const result = await action.run(() => accountingApi.removeAccount(deleteTarget.id));
        setDeleteTarget(null);
        if (result) {
            toast.success(result.message);
            accounts.reload();
        }
    };
    const rows = accounts.data ?? [];
    const columns = [
        { key: 'code', header: 'Code', width: '90px', render: (account) => _jsx("span", { className: "code-tag", children: account.code }) },
        {
            key: 'name',
            header: 'Name',
            render: (account) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: account.isActive ? undefined : 'text-subtle', children: account.name }), account.description ? _jsx("small", { children: account.description }) : null] })),
        },
        { key: 'type', header: 'Type', render: (account) => titleCase(account.type) },
        { key: 'subtype', header: 'Subtype', render: (account) => _jsx("span", { className: "text-muted", children: account.subtype ? titleCase(account.subtype) : '—' }) },
        {
            key: 'flags',
            header: 'Flags',
            render: (account) => (_jsxs("div", { className: "row", children: [account.isSystem ? _jsx(Badge, { tone: "info", children: "System" }) : null, account.isActive ? null : _jsx(Badge, { tone: "neutral", children: "Inactive" })] })),
        },
        { key: 'balance', header: 'Balance', align: 'right', render: (account) => _jsx("span", { className: "num", children: formatCurrency(account.balance) }) },
        ...(canWrite
            ? [
                {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    width: '80px',
                    render: (account) => (_jsxs("div", { className: "row-actions", children: [_jsx("button", { type: "button", className: "action-btn", "aria-label": `Edit ${account.name}`, onClick: () => setModal({ open: true, account }), children: _jsx(Pencil, { size: 15 }) }), account.isSystem ? null : (_jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete ${account.name}`, onClick: () => setDeleteTarget(account), children: _jsx(Trash2, { size: 15 }) }))] })),
                },
            ]
            : []),
    ];
    return (_jsxs(_Fragment, { children: [_jsxs(Toolbar, { children: [_jsx(FilterSelect, { label: "Type", value: typeFilter, options: TYPE_FILTER_OPTIONS, onChange: setTypeFilter }), _jsx(CheckboxField, { label: "Include inactive accounts", checked: includeInactive, onChange: (event) => setIncludeInactive(event.target.checked) }), _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", size: "sm", onClick: () => setModal({ open: true, account: null }), children: "New account" }) })] }), _jsx(Card, { title: "Chart of accounts", subtitle: `${rows.length} account(s)`, children: accounts.loading ? (_jsx(SkeletonRows, { rows: 8, columns: 6 })) : accounts.error ? (_jsx(ErrorBlock, { message: accounts.error, onRetry: accounts.reload })) : !rows.length ? (_jsx(EmptyState, { title: "No accounts match this filter", description: "Clear the type filter or create a new ledger account." })) : (_jsx(DataTable, { columns: columns, rows: rows, rowKey: (account) => account.id, caption: "Chart of accounts" })) }), _jsx(AccountModal, { open: modal.open, account: modal.account, onClose: () => setModal({ open: false, account: null }), onSaved: (message) => {
                    setModal({ open: false, account: null });
                    toast.success(message);
                    accounts.reload();
                } }), _jsx(ConfirmDialog, { open: !!deleteTarget, title: "Delete account", message: deleteTarget
                    ? `Delete ${deleteTarget.code} · ${deleteTarget.name}? If the account already has journal lines it will be deactivated instead.`
                    : '', confirmLabel: "Delete", busy: action.submitting, onConfirm: () => void confirmDelete(), onCancel: () => setDeleteTarget(null) })] }));
}
