import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField } from '@/components/ui/Field';
import { payrollApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, parseNumber } from '@/utils/format';
const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];
export function PayRunCreateModal({ onClose, onCreated }) {
    const toast = useToast();
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const { submitting, error, run } = useSubmit();
    const now = new Date();
    const [month, setMonth] = useState(String(now.getMonth() + 1));
    const [year, setYear] = useState(String(now.getFullYear()));
    const [lossOfPay, setLossOfPay] = useState({});
    const { data, loading, error: loadError, reload } = useAsync(() => payrollApi.employees(), []);
    const employees = data ?? [];
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
    const create = async () => {
        const lop = {};
        Object.entries(lossOfPay).forEach(([employeeId, value]) => {
            const days = parseNumber(value);
            if (days > 0)
                lop[employeeId] = days;
        });
        const created = await run(() => payrollApi.createPayRun({ periodYear: Number(year), periodMonth: Number(month), lossOfPay: lop }));
        if (created) {
            toast.success(`Draft pay run created for ${created.periodLabel}.`);
            onCreated();
            onClose();
        }
    };
    const columns = [
        {
            key: 'employee',
            header: 'Employee',
            render: (row) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "strong", children: row.name }), _jsxs("small", { children: [row.employeeCode, row.designation ? ` · ${row.designation}` : ''] })] })),
        },
        { key: 'gross', header: 'Monthly gross', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.grossSalary, currency) }) },
        {
            key: 'lop',
            header: 'Loss of pay (days)',
            align: 'right',
            width: '160px',
            render: (row) => (_jsx("input", { type: "number", className: "input", min: 0, max: daysInMonth, step: "0.5", value: lossOfPay[row.id] ?? '', placeholder: "0", "aria-label": `Loss of pay days for ${row.name}`, onChange: (event) => setLossOfPay((current) => ({ ...current, [row.id]: event.target.value })) })),
        },
    ];
    const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
    return (_jsx(Modal, { open: true, size: "lg", title: "New pay run", subtitle: "One pay run per period \u2014 approve it, then record the payment", onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", onClick: create, loading: submitting, disabled: !employees.length, children: "Create draft pay run" })] }), children: _jsxs("div", { className: "stack", children: [_jsx(FormError, { message: error }), _jsx("p", { className: "text-muted small", children: "A pay run can only be created once for a period. It starts as a draft built from each active employee's current salary structure, minus any loss-of-pay days you enter below." }), _jsxs("div", { className: "form-grid", children: [_jsx(SelectField, { label: "Month", value: month, options: MONTHS.map((label, index) => ({ value: String(index + 1), label })), onChange: (event) => setMonth(event.target.value) }), _jsx(SelectField, { label: "Year", value: year, options: years.map((value) => ({ value: String(value), label: String(value) })), onChange: (event) => setYear(event.target.value) })] }), loading ? _jsx(LoadingBlock, { label: "Loading active employees\u2026" }) : null, !loading && loadError ? _jsx(ErrorBlock, { message: loadError, onRetry: reload }) : null, !loading && !loadError && employees.length === 0 ? (_jsx(EmptyState, { title: "No active employees", description: "Add an active employee before creating a pay run." })) : null, !loading && !loadError && employees.length > 0 ? (_jsx(DataTable, { columns: columns, rows: employees, rowKey: (row) => row.id, caption: "Loss of pay per employee" })) : null] }) }));
}
