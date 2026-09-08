import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { orgApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime } from '@/utils/format';
import { InviteUserModal } from './InviteUserModal';
import { ResetPasswordModal } from './ResetPasswordModal';
const ROLE_OPTIONS = [
    { value: 'admin', label: 'Administrator' },
    { value: 'staff', label: 'Staff' },
    { value: 'viewer', label: 'Viewer' },
];
export function UsersSettings() {
    const toast = useToast();
    const { user: currentUser } = useAuth();
    const [inviting, setInviting] = useState(false);
    const [resetting, setResetting] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const action = useSubmit();
    const { data, loading, error, reload } = useAsync(() => orgApi.users(), []);
    const users = data ?? [];
    const updateUser = async (target, body, successMessage) => {
        setBusyId(target.id);
        const result = await action.run(() => orgApi.updateUser(target.id, body));
        setBusyId(null);
        if (result) {
            toast.success(successMessage);
            reload();
        }
        else if (action.error) {
            toast.error(action.error);
        }
    };
    const columns = [
        {
            key: 'name',
            header: 'Name',
            render: (row) => (_jsxs("div", { className: "cell-stack", children: [_jsxs("span", { className: "strong", children: [row.name, row.id === currentUser?.id ? ' (you)' : ''] }), _jsx("small", { children: row.email })] })),
        },
        {
            key: 'role',
            header: 'Role',
            width: '180px',
            render: (row) => (_jsxs("label", { className: "filter-select", children: [_jsxs("span", { className: "sr-only", children: ["Role for ", row.name] }), _jsx("select", { className: "select select-sm", value: row.role, disabled: busyId === row.id, onChange: (event) => updateUser(row, { role: event.target.value }, `${row.name} is now ${ROLE_OPTIONS.find((option) => option.value === event.target.value)?.label ?? event.target.value}.`), children: ROLE_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] })),
        },
        {
            key: 'status',
            header: 'Status',
            render: (row) => _jsx(Badge, { tone: row.isActive ? 'success' : 'neutral', children: row.isActive ? 'Active' : 'Deactivated' }),
        },
        {
            key: 'lastLogin',
            header: 'Last login',
            render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : _jsx("span", { className: "text-muted", children: "Never" })),
        },
        { key: 'created', header: 'Added', render: (row) => formatDate(row.createdAt) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            width: '240px',
            render: (row) => (_jsxs("div", { className: "row-actions", children: [_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(KeyRound, { size: 14 }), onClick: () => setResetting(row), children: "Reset password" }), _jsx(Button, { variant: row.isActive ? 'secondary' : 'primary', size: "sm", loading: busyId === row.id, onClick: () => updateUser(row, { isActive: !row.isActive }, row.isActive ? `${row.name} can no longer sign in.` : `${row.name} can sign in again.`), children: row.isActive ? 'Deactivate' : 'Activate' })] })),
        },
    ];
    return (_jsxs("div", { className: "stack", children: [_jsxs(Card, { title: "Users", subtitle: "Administrators manage everything, staff can record transactions, viewers are read-only", actions: _jsx(Button, { variant: "primary", size: "sm", icon: _jsx(Plus, { size: 15 }), onClick: () => setInviting(true), children: "Invite user" }), children: [_jsx("p", { className: "text-muted small", children: "An organization always needs at least one active administrator, and you cannot change your own role or deactivate your own account." }), loading ? _jsx(LoadingBlock, { label: "Loading users\u2026" }) : null, !loading && error ? _jsx(ErrorBlock, { message: error, onRetry: reload }) : null, !loading && !error && users.length === 0 ? _jsx(EmptyState, { title: "No users yet", description: "Invite a colleague to collaborate." }) : null, !loading && !error && users.length > 0 ? (_jsx(DataTable, { columns: columns, rows: users, rowKey: (row) => row.id, caption: "Users in this organization" })) : null] }), inviting ? _jsx(InviteUserModal, { onClose: () => setInviting(false), onInvited: reload }) : null, resetting ? _jsx(ResetPasswordModal, { user: resetting, onClose: () => setResetting(null) }) : null] }));
}
