import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { contactsApi, vendorPaymentsApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, round2, titleCase, todayIso } from '@/utils/format';
import { PAYMENT_MODES } from '@/utils/status';
import { RecordVendorPaymentModal } from './RecordVendorPaymentModal';
const PAGE_SIZE = 25;
const MAX_SUMMARY_PAGES = 50;
function modeLabel(mode) {
    return PAYMENT_MODES.find((option) => option.value === mode)?.label ?? titleCase(mode);
}
function monthStart() {
    return `${todayIso().slice(0, 8)}01`;
}
export function PaymentsMadePage() {
    const toast = useToast();
    const { canWrite } = useAuth();
    const [vendorId, setVendorId] = useState('');
    const [startDate, setStartDate] = useState(monthStart);
    const [endDate, setEndDate] = useState(todayIso);
    const [page, setPage] = useState(1);
    const [recording, setRecording] = useState(false);
    const [pendingDelete, setPendingDelete] = useState(null);
    const remove = useSubmit();
    const vendors = useAsync((signal) => contactsApi.list({ type: 'vendor', page_size: 200 }, signal), []);
    const filters = useMemo(() => ({
        vendor_id: vendorId || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
    }), [vendorId, startDate, endDate]);
    const list = useAsync(() => vendorPaymentsApi.list({ ...filters, page, page_size: PAGE_SIZE }), [filters, page]);
    const summary = useAsync(async () => {
        const rows = [];
        let total = 0;
        for (let current = 1; current <= MAX_SUMMARY_PAGES; current += 1) {
            const result = await vendorPaymentsApi.list({ ...filters, page: current, page_size: 200 });
            total = result.total;
            rows.push(...result.items);
            if (result.items.length === 0 || rows.length >= total)
                break;
        }
        return {
            count: total,
            paid: round2(rows.reduce((sum, row) => sum + row.amount, 0)),
            advances: round2(rows.reduce((sum, row) => sum + (row.billId ? 0 : row.amount), 0)),
        };
    }, [filters]);
    const refreshAll = () => {
        list.reload();
        summary.reload();
    };
    const changeFilter = (setter) => (value) => {
        setter(value);
        setPage(1);
    };
    const deletePayment = async (payment) => {
        const result = await remove.run(() => vendorPaymentsApi.remove(payment.id));
        if (result) {
            toast.success(`Payment ${payment.paymentNumber} deleted`);
            setPendingDelete(null);
            refreshAll();
        }
    };
    const columns = [
        { key: 'paymentNumber', header: 'Payment #', render: (payment) => _jsx("span", { className: "code-tag", children: payment.paymentNumber }) },
        { key: 'date', header: 'Date', render: (payment) => formatDate(payment.date) },
        {
            key: 'vendorName',
            header: 'Vendor',
            render: (payment) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { children: payment.vendorName }), _jsx("small", { children: payment.bankAccountName })] })),
        },
        {
            key: 'billNumber',
            header: 'Bill',
            render: (payment) => payment.billNumber ? _jsx("span", { className: "code-tag", children: payment.billNumber }) : _jsx("span", { className: "text-subtle", children: "Advance to vendor" }),
        },
        { key: 'mode', header: 'Mode', render: (payment) => modeLabel(payment.mode) },
        { key: 'reference', header: 'Reference', render: (payment) => payment.reference || _jsx("span", { className: "text-subtle", children: "\u2014" }) },
        { key: 'amount', header: 'Amount', align: 'right', render: (payment) => _jsx("span", { className: "num strong", children: formatCurrency(payment.amount) }) },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (payment) => canWrite ? (_jsx("div", { className: "row-actions", children: _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete payment ${payment.paymentNumber}`, onClick: () => setPendingDelete(payment), children: _jsx(Trash2, { size: 15 }) }) })) : null,
        },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Payments made", subtitle: "Every payment sent to a vendor, whether against a bill or as an advance.", actions: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => setRecording(true), children: "Record payment" }) }) }), summary.error ? (_jsx(ErrorBlock, { message: summary.error, onRetry: summary.reload })) : (_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Total paid", value: summary.data ? formatCurrency(summary.data.paid) : '—', sublabel: `${formatDate(startDate)} – ${formatDate(endDate)}` }), _jsx(StatTile, { label: "Payments", value: summary.data ? String(summary.data.count) : '—' }), _jsx(StatTile, { label: "Advances", value: summary.data ? formatCurrency(summary.data.advances) : '—', tone: "warning", sublabel: "Not yet applied to a bill" })] })), _jsxs(Toolbar, { children: [_jsx(FilterSelect, { label: "Vendor", value: vendorId, onChange: changeFilter(setVendorId), options: [{ value: '', label: 'All vendors' }, ...(vendors.data?.items ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName }))] }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "From" }), _jsx("input", { type: "date", className: "input select-sm", value: startDate, "aria-label": "Payments from date", onChange: (event) => changeFilter(setStartDate)(event.target.value) })] }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "To" }), _jsx("input", { type: "date", className: "input select-sm", value: endDate, "aria-label": "Payments to date", onChange: (event) => changeFilter(setEndDate)(event.target.value) })] })] }), _jsx(FormError, { message: remove.error }), _jsx("div", { className: "card", children: list.loading ? (_jsx(SkeletonRows, { rows: 6, columns: 8 })) : list.error ? (_jsx(ErrorBlock, { message: list.error, onRetry: list.reload })) : !list.data || list.data.items.length === 0 ? (_jsx(EmptyState, { title: "No payments in this period", description: "Widen the date range, or record a payment to a vendor.", icon: _jsx(Wallet, { size: 28, "aria-hidden": "true" }), action: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => setRecording(true), children: "Record payment" }) }) })) : (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: list.data.items, rowKey: (payment) => payment.id, caption: "Payments made" }), _jsx(Pagination, { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: setPage })] })) }), recording ? (_jsx(RecordVendorPaymentModal, { onClose: () => setRecording(false), onSaved: () => {
                    setRecording(false);
                    refreshAll();
                } })) : null, _jsx(ConfirmDialog, { open: pendingDelete !== null, title: "Delete this payment?", confirmLabel: "Delete payment", busy: remove.submitting, message: _jsxs(_Fragment, { children: [_jsxs("p", { children: ["Payment ", pendingDelete?.paymentNumber, " of ", formatCurrency(pendingDelete?.amount ?? 0), " to ", pendingDelete?.vendorName, " will be deleted. The journal entry is reversed, the bank transaction removed and any bill balance restored."] }), _jsx(FormError, { message: remove.error })] }), onCancel: () => {
                    setPendingDelete(null);
                    remove.reset();
                }, onConfirm: () => {
                    if (pendingDelete)
                        void deletePayment(pendingDelete);
                } })] }));
}
