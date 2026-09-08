import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { projectsApi } from '@/api/endpoints';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatNumber, titleCase } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';
import { InvoiceTimeModal } from './InvoiceTimeModal';
import { ProjectModal } from './ProjectModal';
const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'on_hold', label: 'On hold' },
    { value: 'completed', label: 'Completed' },
];
export function ProjectsTab({ onProjectsChanged }) {
    const { canWrite } = useAuth();
    const toast = useToast();
    const [statusFilter, setStatusFilter] = useState('');
    const [modal, setModal] = useState({ open: false, project: null });
    const [invoiceTarget, setInvoiceTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [lastInvoice, setLastInvoice] = useState(null);
    const projects = useAsync(() => projectsApi.list({ status: statusFilter || undefined }), [statusFilter]);
    const action = useSubmit();
    useEffect(() => {
        if (action.error)
            toast.error(action.error);
    }, [action.error, toast]);
    const refresh = () => {
        projects.reload();
        onProjectsChanged();
    };
    const confirmDelete = async () => {
        if (!deleteTarget)
            return;
        const result = await action.run(() => projectsApi.remove(deleteTarget.id));
        setDeleteTarget(null);
        if (result) {
            toast.success(result.message);
            refresh();
        }
    };
    const rows = projects.data ?? [];
    return (_jsxs(_Fragment, { children: [_jsxs(Toolbar, { children: [_jsx(FilterSelect, { label: "Status", value: statusFilter, options: STATUS_OPTIONS, onChange: setStatusFilter }), _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", size: "sm", onClick: () => setModal({ open: true, project: null }), children: "New project" }) })] }), lastInvoice ? (_jsx(Card, { title: "Invoice created", subtitle: `${lastInvoice.invoiceNumber} · ${formatCurrency(lastInvoice.total)}`, children: _jsxs("div", { className: "row-between", children: [_jsxs("span", { className: "text-muted", children: ["Unbilled time has been billed to ", lastInvoice.customerName, "."] }), _jsxs("div", { className: "row", children: [_jsx(Link, { className: "btn btn-primary btn-sm", to: `/invoices/${lastInvoice.id}`, children: _jsx("span", { children: "View invoice" }) }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => setLastInvoice(null), children: "Dismiss" })] })] }) })) : null, projects.loading ? (_jsx(SkeletonRows, { rows: 4, columns: 4 })) : projects.error ? (_jsx(ErrorBlock, { message: projects.error, onRetry: projects.reload })) : !rows.length ? (_jsx(EmptyState, { title: "No projects yet", description: "Create a project to log billable time against a customer.", icon: _jsx(FolderKanban, { size: 28, "aria-hidden": "true" }), action: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", onClick: () => setModal({ open: true, project: null }), children: "New project" }) }) })) : (_jsx("div", { className: "grid-2", children: rows.map((project) => {
                    const budgetUsed = project.budgetHours > 0 ? Math.min(100, (project.loggedHours / project.budgetHours) * 100) : 0;
                    const canInvoice = project.billingMethod === 'hourly' && project.unbilledHours > 0;
                    return (_jsxs(Card, { title: project.name, subtitle: project.customerName ?? 'No customer linked', actions: _jsx(Badge, { tone: statusTone(project.status), children: statusLabel(project.status) }), footer: canWrite ? (_jsxs("div", { className: "row", children: [_jsx(Button, { size: "sm", onClick: () => setModal({ open: true, project }), children: "Edit" }), canInvoice ? (_jsx(Button, { size: "sm", variant: "primary", onClick: () => setInvoiceTarget(project), children: "Invoice unbilled time" })) : null, _jsx(Button, { size: "sm", variant: "danger", onClick: () => setDeleteTarget(project), children: "Delete" })] })) : null, children: [_jsxs("div", { className: "detail-grid", children: [_jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Billing" }), _jsxs("span", { className: "detail-value", children: [titleCase(project.billingMethod), project.billingMethod === 'hourly' ? ` · ${formatCurrency(project.hourlyRate)}/hr` : ''] })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Budget hours" }), _jsx("span", { className: "detail-value num", children: project.budgetHours > 0 ? formatNumber(project.budgetHours) : '—' })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Logged" }), _jsxs("span", { className: "detail-value num", children: [formatNumber(project.loggedHours), " h"] })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Billable" }), _jsxs("span", { className: "detail-value num", children: [formatNumber(project.billableHours), " h"] })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Unbilled" }), _jsxs("span", { className: "detail-value num", children: [formatNumber(project.unbilledHours), " h"] })] }), _jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: "Unbilled amount" }), _jsx("span", { className: "detail-value num", children: formatCurrency(project.unbilledAmount) })] })] }), project.budgetHours > 0 ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "split-bar", role: "img", "aria-label": `${formatNumber(project.loggedHours)} of ${formatNumber(project.budgetHours)} budget hours used`, children: _jsx("span", { className: "split-segment segment-current", style: { width: `${budgetUsed}%` } }) }), _jsxs("p", { className: "small text-subtle", children: [formatNumber(project.loggedHours), " of ", formatNumber(project.budgetHours), " budget hours used"] })] })) : null] }, project.id));
                }) })), _jsx(ProjectModal, { open: modal.open, project: modal.project, onClose: () => setModal({ open: false, project: null }), onSaved: (message) => {
                    setModal({ open: false, project: null });
                    toast.success(message);
                    refresh();
                } }), _jsx(InvoiceTimeModal, { open: !!invoiceTarget, project: invoiceTarget, onClose: () => setInvoiceTarget(null), onInvoiced: (invoice) => {
                    setInvoiceTarget(null);
                    setLastInvoice(invoice);
                    toast.success(`Invoice ${invoice.invoiceNumber} created for ${formatCurrency(invoice.total)}.`);
                    refresh();
                } }), _jsx(ConfirmDialog, { open: !!deleteTarget, title: "Delete project", message: deleteTarget
                    ? `Delete ${deleteTarget.name}? If the project already has invoiced time it will be marked completed instead of deleted.`
                    : '', confirmLabel: "Delete", busy: action.submitting, onConfirm: () => void confirmDelete(), onCancel: () => setDeleteTarget(null) })] }));
}
