import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Sales > Payments received: every customer payment, with filters and recording. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { contactsApi, customerPaymentsApi } from '@/api/endpoints';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatNumber, round2 } from '@/utils/format';
import { PAYMENT_MODES } from '@/utils/status';
import { RecordPaymentModal } from './RecordPaymentModal';
const PAGE_SIZE = 25;
const TOTALS_PAGE_SIZE = 200;
const MAX_TOTALS_PAGES = 20;
const modeLabel = (mode) => PAYMENT_MODES.find((option) => option.value === mode)?.label ?? mode;
/** Sum the whole filtered range by walking the paginated endpoint. */
async function loadRangeTotals(query) {
    let received = 0;
    let unapplied = 0;
    let count = 0;
    let page = 1;
    let total = 0;
    for (;;) {
        const result = await customerPaymentsApi.list({ ...query, page, page_size: TOTALS_PAGE_SIZE });
        total = result.total;
        for (const payment of result.items) {
            received += payment.amount;
            if (!payment.invoiceId)
                unapplied += payment.amount;
        }
        count += result.items.length;
        if (count >= total || !result.items.length)
            break;
        page += 1;
        if (page > MAX_TOTALS_PAGES)
            return { received: round2(received), count: total, unapplied: round2(unapplied), truncated: true };
    }
    return { received: round2(received), count: total, unapplied: round2(unapplied), truncated: false };
}
export function PaymentsReceivedPage() {
    const toast = useToast();
    const { submitting, error: actionError, run, reset } = useSubmit();
    const [customerId, setCustomerId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(1);
    const [recording, setRecording] = useState(false);
    const [pendingDelete, setPendingDelete] = useState(null);
    const filters = useMemo(() => ({ customer_id: customerId || undefined, start_date: startDate || undefined, end_date: endDate || undefined }), [customerId, startDate, endDate]);
    const customers = useAsync((signal) => contactsApi.list({ type: 'customer', page_size: 200 }, signal), []);
    const payments = useAsync(() => customerPaymentsApi.list({ ...filters, page, page_size: PAGE_SIZE }), [filters, page]);
    const totals = useAsync(() => loadRangeTotals(filters), [filters]);
    const refresh = () => {
        payments.reload();
        totals.reload();
    };
    const customerOptions = useMemo(() => [
        { value: '', label: 'All customers' },
        ...(customers.data?.items ?? []).map((customer) => ({ value: customer.id, label: customer.displayName })),
    ], [customers.data]);
    const confirmDelete = async () => {
        if (!pendingDelete)
            return;
        const result = await run(() => customerPaymentsApi.remove(pendingDelete.id));
        if (result) {
            toast.success(result.message);
            setPendingDelete(null);
            refresh();
        }
    };
    const columns = [
        { key: 'paymentNumber', header: 'Payment #', render: (row) => _jsx("span", { className: "mono", children: row.paymentNumber }) },
        { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
        { key: 'customerName', header: 'Customer', render: (row) => row.customerName },
        {
            key: 'invoiceNumber',
            header: 'Invoice',
            render: (row) => row.invoiceId && row.invoiceNumber ? (_jsx(Link, { to: `/invoices/${row.invoiceId}`, children: row.invoiceNumber })) : (_jsx("span", { className: "text-subtle", children: "Unapplied advance" })),
        },
        {
            key: 'mode',
            header: 'Mode',
            render: (row) => (_jsxs("span", { className: "cell-stack", children: [_jsx("span", { children: modeLabel(row.mode) }), _jsx("small", { children: row.bankAccountName })] })),
        },
        { key: 'reference', header: 'Reference', render: (row) => (row.reference ? _jsx("span", { className: "code-tag", children: row.reference }) : '—') },
        { key: 'amount', header: 'Amount', align: 'right', render: (row) => _jsx("span", { className: "num strong", children: formatCurrency(row.amount) }) },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (row) => (_jsx(IfCanWrite, { children: _jsx("span", { className: "row-actions", children: _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete payment ${row.paymentNumber}`, onClick: () => {
                            reset();
                            setPendingDelete(row);
                        }, children: _jsx(Trash2, { size: 15 }) }) }) })),
        },
    ];
    const rows = payments.data?.items ?? [];
    const hasFilters = Boolean(customerId || startDate || endDate);
    const rangeLabel = startDate || endDate ? `${startDate ? formatDate(startDate) : 'the beginning'} – ${endDate ? formatDate(endDate) : 'today'}` : 'All time';
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Payments received", subtitle: "Money collected from your customers.", breadcrumb: ['Sales', 'Payments received'], actions: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => setRecording(true), children: "Record payment" }) }) }), totals.error ? (_jsx(ErrorBlock, { message: totals.error, onRetry: totals.reload })) : (_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Total received", value: formatCurrency(totals.data?.received ?? 0), sublabel: totals.data?.truncated ? `${rangeLabel} (first ${formatNumber(TOTALS_PAGE_SIZE * MAX_TOTALS_PAGES, 0)} payments)` : rangeLabel, tone: "positive", icon: _jsx(Wallet, { size: 15 }) }), _jsx(StatTile, { label: "Payments", value: formatNumber(totals.data?.count ?? 0, 0), sublabel: "Records in this range" }), _jsx(StatTile, { label: "Unapplied advances", value: formatCurrency(totals.data?.unapplied ?? 0), sublabel: "Not linked to an invoice", tone: totals.data && totals.data.unapplied > 0 ? 'warning' : 'neutral' })] })), _jsxs(Toolbar, { children: [_jsx(FilterSelect, { label: "Customer", value: customerId, options: customerOptions, onChange: (value) => {
                            setCustomerId(value);
                            setPage(1);
                        } }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "From" }), _jsx("input", { type: "date", className: "input select-sm", value: startDate, onChange: (event) => {
                                    setStartDate(event.target.value);
                                    setPage(1);
                                } })] }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "To" }), _jsx("input", { type: "date", className: "input select-sm", value: endDate, onChange: (event) => {
                                    setEndDate(event.target.value);
                                    setPage(1);
                                } })] })] }), _jsx("div", { className: "card", children: payments.loading ? (_jsx(SkeletonRows, { rows: 6, columns: 8 })) : payments.error ? (_jsx(ErrorBlock, { message: payments.error, onRetry: payments.reload })) : !rows.length ? (_jsx(EmptyState, { title: hasFilters ? 'No payments match these filters' : 'No payments recorded yet', description: hasFilters ? 'Try a different customer or date range.' : 'Record a payment when a customer settles an invoice or pays in advance.', action: hasFilters ? null : (_jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => setRecording(true), children: "Record payment" }) })) })) : (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: rows, rowKey: (row) => row.id, caption: "Payments received" }), _jsx(Pagination, { page: page, pageSize: payments.data?.pageSize ?? PAGE_SIZE, total: payments.data?.total ?? 0, onPageChange: setPage })] })) }), _jsx(RecordPaymentModal, { open: recording, customers: customers.data?.items ?? [], onClose: () => setRecording(false), onSaved: refresh }), _jsx(ConfirmDialog, { open: !!pendingDelete, title: "Delete payment", confirmLabel: "Delete payment", busy: submitting, onCancel: () => setPendingDelete(null), onConfirm: confirmDelete, message: _jsxs(_Fragment, { children: [_jsx(FormError, { message: actionError }), pendingDelete ? (_jsxs("p", { children: ["Payment ", pendingDelete.paymentNumber, " of ", formatCurrency(pendingDelete.amount), " from ", pendingDelete.customerName, " will be deleted and its ledger entries reversed."] })) : null] }) })] }));
}
