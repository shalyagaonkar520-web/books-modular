import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Sales > Invoices: searchable, filterable list with inline status and payment actions. */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, Eye, FileText, IndianRupee, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { contactsApi, invoicesApi } from '@/api/endpoints';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Tabs, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { daysBetween, formatCurrency, formatDate, todayIso } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';
import { RecordPaymentModal } from './RecordPaymentModal';
const PAGE_SIZE = 25;
const TABS = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Draft' },
    { id: 'unpaid', label: 'Unpaid' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'paid', label: 'Paid' },
];
/** Sent/partially-paid invoices with nothing paid yet may still be edited. */
function canEdit(invoice) {
    if (invoice.status === 'draft')
        return true;
    return (invoice.status === 'sent' || invoice.status === 'overdue') && invoice.amountPaid === 0;
}
function canTakePayment(invoice) {
    return ['sent', 'partially_paid', 'overdue'].includes(invoice.status) && invoice.balanceDue > 0;
}
export function InvoicesPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { submitting, error: actionError, run, reset } = useSubmit();
    const [status, setStatus] = useState('all');
    const [search, setSearch] = useState('');
    const [customerId, setCustomerId] = useState(searchParams.get('customer') ?? '');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(1);
    const [pending, setPending] = useState(null);
    const [paymentFor, setPaymentFor] = useState(null);
    const debouncedSearch = useDebounced(search);
    const customers = useAsync((signal) => contactsApi.list({ type: 'customer', page_size: 200 }, signal), []);
    const stats = useAsync(() => invoicesApi.stats(), []);
    const invoices = useAsync((signal) => invoicesApi.list({
        status: status === 'all' ? undefined : status,
        customer_id: customerId || undefined,
        search: debouncedSearch.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        page_size: PAGE_SIZE,
    }, signal), [status, customerId, debouncedSearch, startDate, endDate, page]);
    const refresh = () => {
        invoices.reload();
        stats.reload();
    };
    const customerOptions = useMemo(() => [
        { value: '', label: 'All customers' },
        ...(customers.data?.items ?? []).map((customer) => ({ value: customer.id, label: customer.displayName })),
    ], [customers.data]);
    const runPending = async () => {
        if (!pending)
            return;
        const { kind, invoice } = pending;
        const result = await run(() => kind === 'delete' ? invoicesApi.remove(invoice.id) : invoicesApi.setStatus(invoice.id, kind === 'send' ? 'sent' : 'void'));
        if (result) {
            toast.success(kind === 'delete'
                ? `Invoice ${invoice.invoiceNumber} deleted`
                : kind === 'send'
                    ? `Invoice ${invoice.invoiceNumber} marked as sent`
                    : `Invoice ${invoice.invoiceNumber} voided`);
            setPending(null);
            refresh();
        }
    };
    const today = todayIso();
    const columns = [
        {
            key: 'invoiceNumber',
            header: 'Invoice #',
            render: (row) => (_jsxs("span", { className: "cell-stack", children: [_jsx(Link, { to: `/invoices/${row.id}`, className: "strong", children: row.invoiceNumber }), row.reference ? _jsxs("small", { children: ["Ref ", row.reference] }) : null] })),
        },
        { key: 'customerName', header: 'Customer', render: (row) => row.customerName },
        { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
        {
            key: 'dueDate',
            header: 'Due date',
            render: (row) => {
                const overdueBy = daysBetween(row.dueDate, today);
                return (_jsxs("span", { className: "cell-stack", children: [_jsx("span", { children: formatDate(row.dueDate) }), row.status === 'overdue' && overdueBy > 0 ? (_jsxs("small", { className: "text-danger", children: [overdueBy, " ", overdueBy === 1 ? 'day' : 'days', " overdue"] })) : null] }));
            },
        },
        { key: 'status', header: 'Status', render: (row) => _jsx(Badge, { tone: statusTone(row.status), children: statusLabel(row.status) }) },
        { key: 'total', header: 'Total', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.total) }) },
        {
            key: 'balanceDue',
            header: 'Balance due',
            align: 'right',
            render: (row) => _jsx("span", { className: `num ${row.balanceDue > 0 ? 'strong' : 'text-subtle'}`, children: formatCurrency(row.balanceDue) }),
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (row) => (_jsxs("span", { className: "row-actions", children: [_jsx("button", { type: "button", className: "action-btn", "aria-label": `View invoice ${row.invoiceNumber}`, onClick: () => navigate(`/invoices/${row.id}`), children: _jsx(Eye, { size: 15 }) }), _jsx(IfCanWrite, { children: _jsxs(_Fragment, { children: [canEdit(row) ? (_jsx("button", { type: "button", className: "action-btn", "aria-label": `Edit invoice ${row.invoiceNumber}`, onClick: () => navigate(`/invoices/${row.id}/edit`), children: _jsx(Pencil, { size: 15 }) })) : null, canTakePayment(row) ? (_jsx("button", { type: "button", className: "action-btn", "aria-label": `Record payment for invoice ${row.invoiceNumber}`, onClick: () => setPaymentFor({ id: row.id, invoiceNumber: row.invoiceNumber, customerId: row.customerId, balanceDue: row.balanceDue }), children: _jsx(IndianRupee, { size: 15 }) })) : null, row.status === 'draft' ? (_jsx("button", { type: "button", className: "action-btn", "aria-label": `Mark invoice ${row.invoiceNumber} as sent`, onClick: () => {
                                        reset();
                                        setPending({ kind: 'send', invoice: row });
                                    }, children: _jsx(Send, { size: 15 }) })) : null, row.status !== 'void' ? (_jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Void invoice ${row.invoiceNumber}`, onClick: () => {
                                        reset();
                                        setPending({ kind: 'void', invoice: row });
                                    }, children: _jsx(Ban, { size: 15 }) })) : null, row.status === 'draft' || row.status === 'void' ? (_jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete invoice ${row.invoiceNumber}`, onClick: () => {
                                        reset();
                                        setPending({ kind: 'delete', invoice: row });
                                    }, children: _jsx(Trash2, { size: 15 }) })) : null] }) })] })),
        },
    ];
    const rows = invoices.data?.items ?? [];
    const hasFilters = Boolean(debouncedSearch || customerId || startDate || endDate || status !== 'all');
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Invoices", subtitle: "Everything you have billed your customers.", actions: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => navigate('/invoices/new'), children: "New invoice" }) }) }), stats.error ? (_jsx(ErrorBlock, { message: stats.error, onRetry: stats.reload })) : (_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Total outstanding", value: formatCurrency(stats.data?.totalOutstanding ?? 0), sublabel: `${stats.data?.unpaidCount ?? 0} open invoices` }), _jsx(StatTile, { label: "Overdue", value: formatCurrency(stats.data?.overdue ?? 0), tone: "negative", sublabel: `${stats.data?.overdueCount ?? 0} past due` }), _jsx(StatTile, { label: "Due within 30 days", value: formatCurrency(stats.data?.dueWithin30Days ?? 0), tone: "warning" }), _jsx(StatTile, { label: "Drafts", value: String(stats.data?.draftCount ?? 0), sublabel: "Not yet sent", icon: _jsx(FileText, { size: 15 }) })] })), _jsx(Tabs, { tabs: TABS, active: status, onChange: (id) => {
                    setStatus(id);
                    setPage(1);
                } }), _jsxs(Toolbar, { children: [_jsx(SearchInput, { value: search, onChange: (value) => {
                            setSearch(value);
                            setPage(1);
                        }, placeholder: "Search invoice number, customer or reference\u2026" }), _jsx(FilterSelect, { label: "Customer", value: customerId, options: customerOptions, onChange: (value) => {
                            setCustomerId(value);
                            setPage(1);
                        } }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "From" }), _jsx("input", { type: "date", className: "input select-sm", value: startDate, onChange: (event) => {
                                    setStartDate(event.target.value);
                                    setPage(1);
                                } })] }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "To" }), _jsx("input", { type: "date", className: "input select-sm", value: endDate, onChange: (event) => {
                                    setEndDate(event.target.value);
                                    setPage(1);
                                } })] })] }), _jsx("div", { className: "card", children: invoices.loading ? (_jsx(SkeletonRows, { rows: 6, columns: 8 })) : invoices.error ? (_jsx(ErrorBlock, { message: invoices.error, onRetry: invoices.reload })) : !rows.length ? (_jsx(EmptyState, { title: hasFilters ? 'No invoices match these filters' : 'No invoices yet', description: hasFilters ? 'Try a different status, customer or date range.' : 'Create your first invoice to start billing customers.', action: hasFilters ? null : (_jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => navigate('/invoices/new'), children: "New invoice" }) })) })) : (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: rows, rowKey: (row) => row.id, caption: "Invoices" }), _jsx(Pagination, { page: page, pageSize: invoices.data?.pageSize ?? PAGE_SIZE, total: invoices.data?.total ?? 0, onPageChange: setPage })] })) }), _jsx(RecordPaymentModal, { open: !!paymentFor, invoice: paymentFor ?? undefined, onClose: () => setPaymentFor(null), onSaved: refresh }), _jsx(ConfirmDialog, { open: !!pending, title: pending?.kind === 'delete' ? 'Delete invoice' : pending?.kind === 'send' ? 'Mark invoice as sent' : 'Void invoice', confirmLabel: pending?.kind === 'delete' ? 'Delete' : pending?.kind === 'send' ? 'Mark as sent' : 'Void invoice', tone: pending?.kind === 'send' ? 'primary' : 'danger', busy: submitting, onCancel: () => setPending(null), onConfirm: runPending, message: _jsxs(_Fragment, { children: [_jsx(FormError, { message: actionError }), pending?.kind === 'delete' ? (_jsxs("p", { children: ["Invoice ", pending.invoice.invoiceNumber, " will be permanently removed. This cannot be undone."] })) : pending?.kind === 'send' ? (_jsxs("p", { children: ["Invoice ", pending.invoice.invoiceNumber, " will be posted to your books and can no longer be deleted."] })) : pending ? (_jsxs("p", { children: ["Voiding invoice ", pending.invoice.invoiceNumber, " reverses its ledger entries. Recorded payments must be deleted first."] })) : null] }) })] }));
}
