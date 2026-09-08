import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { payrollApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate, formatQuantity } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';
import { PayslipModal } from './PayslipModal';
export function PayRunDetailModal({ payRunId, onClose }) {
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const [openSlip, setOpenSlip] = useState(null);
    const { data, loading, error, reload } = useAsync(() => payrollApi.payRun(payRunId), [payRunId]);
    const columns = [
        {
            key: 'employee',
            header: 'Employee',
            render: (row) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "strong", children: row.employeeName }), _jsxs("small", { children: [row.employeeCode, row.designation ? ` · ${row.designation}` : ''] })] })),
        },
        { key: 'gross', header: 'Gross', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.gross, currency) }) },
        { key: 'pf', header: 'PF', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.pfEmployee, currency) }) },
        { key: 'pt', header: 'Prof. tax', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.professionalTax, currency) }) },
        { key: 'tds', header: 'TDS', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.tds, currency) }) },
        {
            key: 'lop',
            header: 'Loss of pay',
            align: 'right',
            render: (row) => row.lossOfPayDays > 0 ? (_jsxs("span", { className: "num text-warning", children: [formatQuantity(row.lossOfPayDays), " d \u00B7 ", formatCurrency(row.lossOfPayAmount, currency)] })) : (_jsx("span", { className: "text-muted", children: "\u2014" })),
        },
        { key: 'deductions', header: 'Deductions', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.totalDeductions, currency) }) },
        { key: 'net', header: 'Net pay', align: 'right', render: (row) => _jsx("span", { className: "num strong", children: formatCurrency(row.netPay, currency) }) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            width: '130px',
            render: (row) => (_jsx(Button, { variant: "link", size: "sm", icon: _jsx(FileText, { size: 14 }), onClick: () => setOpenSlip(row), children: "View payslip" })),
        },
    ];
    const totals = (data?.payslips ?? []).reduce((sum, slip) => ({
        gross: sum.gross + slip.gross,
        pf: sum.pf + slip.pfEmployee,
        pt: sum.pt + slip.professionalTax,
        tds: sum.tds + slip.tds,
        lop: sum.lop + slip.lossOfPayAmount,
        deductions: sum.deductions + slip.totalDeductions,
        net: sum.net + slip.netPay,
    }), { gross: 0, pf: 0, pt: 0, tds: 0, lop: 0, deductions: 0, net: 0 });
    return (_jsxs(_Fragment, { children: [_jsxs(Modal, { open: true, size: "xl", title: data ? `Pay run · ${data.periodLabel}` : 'Pay run', subtitle: data ? `${data.employeeCount} employees${data.payDate ? ` · paid on ${formatDate(data.payDate)}` : ''}` : undefined, onClose: onClose, footer: _jsx(Button, { variant: "secondary", onClick: onClose, children: "Close" }), children: [loading ? _jsx(LoadingBlock, { label: "Loading payslips\u2026" }) : null, !loading && error ? _jsx(ErrorBlock, { message: error, onRetry: reload }) : null, !loading && !error && data ? (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "row-between", children: [_jsx(Badge, { tone: statusTone(data.status), children: statusLabel(data.status) }), _jsxs("span", { className: "text-muted small", children: ["Created ", formatDate(data.createdAt)] })] }), data.payslips.length === 0 ? (_jsx(EmptyState, { title: "This pay run has no payslips", description: "Delete it and create a new pay run for the period." })) : (_jsx(DataTable, { columns: columns, rows: data.payslips, rowKey: (row) => row.id, caption: "Payslips in this pay run", footer: _jsxs("tr", { children: [_jsx("td", { children: "Total" }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.gross, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.pf, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.pt, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.tds, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.lop, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.deductions, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.net, currency) }), _jsx("td", {})] }) }))] })) : null] }), openSlip && data ? (_jsx(PayslipModal, { payslip: openSlip, periodLabel: data.periodLabel, payDate: data.payDate, onClose: () => setOpenSlip(null) })) : null] }));
}
