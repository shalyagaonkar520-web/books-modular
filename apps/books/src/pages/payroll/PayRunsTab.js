import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { BadgeCheck, Banknote, Eye, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { payrollApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate, formatNumber } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';
import { PayRunCreateModal } from './PayRunCreateModal';
import { PayRunDetailModal } from './PayRunDetailModal';
import { PayRunPayModal } from './PayRunPayModal';
export function PayRunsTab() {
    const toast = useToast();
    const { isAdmin, organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const [creating, setCreating] = useState(false);
    const [detailId, setDetailId] = useState(null);
    const [paying, setPaying] = useState(null);
    const [approving, setApproving] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const action = useSubmit();
    const { data, loading, error, reload } = useAsync(() => payrollApi.payRuns(), []);
    const payRuns = data ?? [];
    const confirmApprove = async () => {
        if (!approving)
            return;
        const result = await action.run(() => payrollApi.approvePayRun(approving.id));
        if (result) {
            toast.success(`${result.periodLabel} pay run approved.`);
            setApproving(null);
            reload();
        }
        else if (action.error) {
            toast.error(action.error);
        }
    };
    const confirmDelete = async () => {
        if (!deleting)
            return;
        const result = await action.run(() => payrollApi.removePayRun(deleting.id));
        if (result) {
            toast.success(result.message);
            setDeleting(null);
            reload();
        }
        else if (action.error) {
            toast.error(action.error);
        }
    };
    const columns = [
        { key: 'period', header: 'Period', render: (row) => _jsx("span", { className: "strong", children: row.periodLabel }) },
        { key: 'status', header: 'Status', render: (row) => _jsx(Badge, { tone: statusTone(row.status), children: statusLabel(row.status) }) },
        { key: 'employees', header: 'Employees', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatNumber(row.employeeCount, 0) }) },
        { key: 'gross', header: 'Gross', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.totalGross, currency) }) },
        { key: 'deductions', header: 'Deductions', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.totalDeductions, currency) }) },
        { key: 'net', header: 'Net', align: 'right', render: (row) => _jsx("span", { className: "num strong", children: formatCurrency(row.totalNet, currency) }) },
        { key: 'payDate', header: 'Pay date', render: (row) => (row.payDate ? formatDate(row.payDate) : _jsx("span", { className: "text-muted", children: "\u2014" })) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            width: '260px',
            render: (row) => (_jsxs("div", { className: "row-actions", children: [_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(Eye, { size: 14 }), onClick: () => setDetailId(row.id), children: "View" }), isAdmin && row.status === 'draft' ? (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", size: "sm", icon: _jsx(BadgeCheck, { size: 14 }), onClick: () => setApproving(row), children: "Approve" }), _jsx("button", { type: "button", className: "action-btn is-danger", onClick: () => setDeleting(row), "aria-label": `Delete ${row.periodLabel} pay run`, title: "Delete", children: _jsx(Trash2, { size: 15 }) })] })) : null, isAdmin && row.status === 'approved' ? (_jsx(Button, { variant: "primary", size: "sm", icon: _jsx(Banknote, { size: 14 }), onClick: () => setPaying(row), children: "Record payment" })) : null] })),
        },
    ];
    return (_jsxs("div", { className: "stack", children: [_jsxs(Card, { title: "Pay runs", subtitle: "Draft a pay run, approve it, then record the payment to post it to the ledger", actions: isAdmin ? (_jsx(Button, { variant: "primary", size: "sm", icon: _jsx(Plus, { size: 15 }), onClick: () => setCreating(true), children: "New pay run" })) : null, children: [loading ? _jsx(LoadingBlock, { label: "Loading pay runs\u2026" }) : null, !loading && error ? _jsx(ErrorBlock, { message: error, onRetry: reload }) : null, !loading && !error && payRuns.length === 0 ? (_jsx(EmptyState, { title: "No pay runs yet", description: isAdmin ? 'Create a pay run for a month to generate payslips for every active employee.' : 'An administrator has not created a pay run yet.' })) : null, !loading && !error && payRuns.length > 0 ? (_jsx(DataTable, { columns: columns, rows: payRuns, rowKey: (row) => row.id, caption: "Monthly pay runs" })) : null] }), creating ? _jsx(PayRunCreateModal, { onClose: () => setCreating(false), onCreated: reload }) : null, detailId ? _jsx(PayRunDetailModal, { payRunId: detailId, onClose: () => setDetailId(null) }) : null, paying ? _jsx(PayRunPayModal, { payRun: paying, onClose: () => setPaying(null), onPaid: reload }) : null, _jsx(ConfirmDialog, { open: !!approving, title: "Approve pay run", message: approving ? (_jsxs(_Fragment, { children: ["Approve the ", _jsx("strong", { children: approving.periodLabel }), " pay run for ", formatCurrency(approving.totalNet, currency), " net? Payslips are locked once approved, and you can then record the payment."] })) : (''), confirmLabel: "Approve", tone: "primary", busy: action.submitting, onConfirm: confirmApprove, onCancel: () => setApproving(null) }), _jsx(ConfirmDialog, { open: !!deleting, title: "Delete pay run", message: deleting ? (_jsxs(_Fragment, { children: ["The ", _jsx("strong", { children: deleting.periodLabel }), " pay run and its payslips will be deleted. Paid pay runs cannot be deleted."] })) : (''), confirmLabel: "Delete", busy: action.submitting, onConfirm: confirmDelete, onCancel: () => setDeleting(null) })] }));
}
