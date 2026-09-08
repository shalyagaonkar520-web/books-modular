import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { CheckboxField } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { IfCanWrite } from '@/auth/RouteGuards';
import { payrollApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate, formatNumber } from '@/utils/format';
import { EmployeeFormModal } from './EmployeeFormModal';
export function EmployeesTab() {
    const toast = useToast();
    const { isAdmin, organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const [includeInactive, setIncludeInactive] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const remove = useSubmit();
    const { data, loading, error, reload } = useAsync(() => payrollApi.employees({ include_inactive: includeInactive }), [includeInactive]);
    const employees = data ?? [];
    const activeEmployees = employees.filter((employee) => employee.isActive);
    const monthlyNet = activeEmployees.reduce((sum, employee) => sum + employee.netSalary, 0);
    const monthlyGross = activeEmployees.reduce((sum, employee) => sum + employee.grossSalary, 0);
    const confirmDelete = async () => {
        if (!deleting)
            return;
        const result = await remove.run(() => payrollApi.removeEmployee(deleting.id));
        if (result) {
            toast.success(result.message);
            setDeleting(null);
            reload();
        }
        else if (remove.error) {
            toast.error(remove.error);
        }
    };
    const columns = [
        { key: 'code', header: 'Code', render: (row) => _jsx("span", { className: "code-tag", children: row.employeeCode }) },
        {
            key: 'name',
            header: 'Employee',
            render: (row) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "strong", children: row.name }), row.email ? _jsx("small", { children: row.email }) : null] })),
        },
        { key: 'designation', header: 'Designation', render: (row) => row.designation ?? _jsx("span", { className: "text-muted", children: "\u2014" }) },
        { key: 'department', header: 'Department', render: (row) => row.department ?? _jsx("span", { className: "text-muted", children: "\u2014" }) },
        { key: 'joined', header: 'Joined', render: (row) => formatDate(row.dateOfJoining) },
        { key: 'gross', header: 'Gross', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.grossSalary, currency) }) },
        { key: 'net', header: 'Net', align: 'right', render: (row) => _jsx("span", { className: "num strong", children: formatCurrency(row.netSalary, currency) }) },
        {
            key: 'status',
            header: 'Status',
            render: (row) => _jsx(Badge, { tone: row.isActive ? 'success' : 'neutral', children: row.isActive ? 'Active' : 'Inactive' }),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            width: '90px',
            render: (row) => (_jsxs("div", { className: "row-actions", children: [_jsx(IfCanWrite, { children: _jsx("button", { type: "button", className: "action-btn", onClick: () => {
                                setEditing(row);
                                setFormOpen(true);
                            }, "aria-label": `Edit ${row.name}`, title: "Edit", children: _jsx(Pencil, { size: 15 }) }) }), isAdmin ? (_jsx("button", { type: "button", className: "action-btn is-danger", onClick: () => setDeleting(row), "aria-label": `Delete ${row.name}`, title: "Delete", children: _jsx(Trash2, { size: 15 }) })) : null] })),
        },
    ];
    return (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Active employees", value: formatNumber(activeEmployees.length, 0), sublabel: `${employees.length} on record` }), _jsx(StatTile, { label: "Monthly gross", value: formatCurrency(monthlyGross, currency), sublabel: "Active employees" }), _jsx(StatTile, { label: "Monthly net", value: formatCurrency(monthlyNet, currency), sublabel: "Take-home after deductions" })] }), _jsxs(Card, { title: "Employees", subtitle: "Salary structure used to build each pay run", actions: _jsxs("div", { className: "row", children: [_jsx(CheckboxField, { label: "Show inactive", checked: includeInactive, onChange: (event) => setIncludeInactive(event.target.checked) }), _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", size: "sm", icon: _jsx(Plus, { size: 15 }), onClick: () => {
                                    setEditing(null);
                                    setFormOpen(true);
                                }, children: "Add employee" }) })] }), children: [loading ? _jsx(LoadingBlock, { label: "Loading employees\u2026" }) : null, !loading && error ? _jsx(ErrorBlock, { message: error, onRetry: reload }) : null, !loading && !error && employees.length === 0 ? (_jsx(EmptyState, { title: "No employees yet", description: "Add your first employee to start running payroll." })) : null, !loading && !error && employees.length > 0 ? (_jsx(DataTable, { columns: columns, rows: employees, rowKey: (row) => row.id, caption: "Employees" })) : null] }), formOpen ? _jsx(EmployeeFormModal, { employee: editing, onClose: () => setFormOpen(false), onSaved: reload }) : null, _jsx(ConfirmDialog, { open: !!deleting, title: "Delete employee", message: deleting ? (_jsxs(_Fragment, { children: [_jsx("strong", { children: deleting.name }), " will be deleted. If they already appear on a payslip they are marked inactive instead, so past pay runs stay intact."] })) : (''), confirmLabel: "Delete", busy: remove.submitting, onConfirm: confirmDelete, onCancel: () => setDeleting(null) })] }));
}
