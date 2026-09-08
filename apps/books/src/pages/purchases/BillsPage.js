import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, FileText, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { billsApi, contactsApi } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Tabs, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';
import { BillDetailModal, overdueDays } from './BillDetailModal';
import { RecordVendorPaymentModal } from './RecordVendorPaymentModal';
const PAGE_SIZE = 25;
const TABS = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Draft' },
    { id: 'unpaid', label: 'Unpaid' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'paid', label: 'Paid' },
];
function canEditBill(bill) {
    return (bill.status === 'draft' || bill.status === 'open' || bill.status === 'overdue') && bill.amountPaid <= 0;
}
function isPayable(bill) {
    return ['open', 'partially_paid', 'overdue'].includes(bill.status) && bill.balanceDue > 0;
}
export function BillsPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const { canWrite } = useAuth();
    const [searchParams] = useSearchParams();
    const [statusTab, setStatusTab] = useState('all');
    const [search, setSearch] = useState('');
    const [vendorId, setVendorId] = useState(() => searchParams.get('vendor') ?? '');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounced(search);
    const [detailId, setDetailId] = useState(null);
    const [payTarget, setPayTarget] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const action = useSubmit();
    const stats = useAsync(() => billsApi.stats(), []);
    const vendors = useAsync((signal) => contactsApi.list({ type: 'vendor', page_size: 200 }, signal), []);
    const list = useAsync((signal) => billsApi.list({
        status: statusTab === 'all' ? undefined : statusTab,
        vendor_id: vendorId || undefined,
        search: debouncedSearch.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        page_size: PAGE_SIZE,
    }, signal), [statusTab, vendorId, debouncedSearch, startDate, endDate, page]);
    const vendorOptions = useMemo(() => [
        { value: '', label: 'All vendors' },
        ...(vendors.data?.items ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName })),
    ], [vendors.data]);
    const refreshAll = () => {
        list.reload();
        stats.reload();
    };
    const perform = async (fn, message) => {
        const result = await action.run(fn);
        if (result) {
            toast.success(message);
            setConfirm(null);
            refreshAll();
        }
    };
    const columns = [
        {
            key: 'billNumber',
            header: 'Bill #',
            render: (bill) => (_jsx("button", { type: "button", className: "btn btn-link btn-sm", onClick: () => setDetailId(bill.id), children: _jsx("span", { className: "code-tag", children: bill.billNumber }) })),
        },
        { key: 'vendorBillNumber', header: 'Vendor bill #', render: (bill) => bill.vendorBillNumber || _jsx("span", { className: "text-subtle", children: "\u2014" }) },
        { key: 'vendorName', header: 'Vendor', render: (bill) => bill.vendorName },
        { key: 'date', header: 'Date', render: (bill) => formatDate(bill.date) },
        {
            key: 'dueDate',
            header: 'Due date',
            render: (bill) => {
                const late = overdueDays(bill);
                return (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { children: formatDate(bill.dueDate) }), late > 0 ? _jsx("small", { className: "text-danger", children: late === 1 ? '1 day overdue' : `${late} days overdue` }) : null] }));
            },
        },
        { key: 'status', header: 'Status', render: (bill) => _jsx(Badge, { tone: statusTone(bill.status), children: statusLabel(bill.status) }) },
        { key: 'total', header: 'Total', align: 'right', render: (bill) => _jsx("span", { className: "num", children: formatCurrency(bill.total) }) },
        {
            key: 'balanceDue',
            header: 'Balance due',
            align: 'right',
            render: (bill) => _jsx("span", { className: `num ${bill.balanceDue > 0 ? 'strong' : 'text-subtle'}`, children: formatCurrency(bill.balanceDue) }),
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (bill) => (_jsxs("div", { className: "row-actions", children: [_jsx("button", { type: "button", className: "action-btn", "aria-label": `View bill ${bill.billNumber}`, onClick: () => setDetailId(bill.id), children: _jsx(Eye, { size: 15 }) }), canWrite ? (_jsxs(_Fragment, { children: [canEditBill(bill) ? (_jsx("button", { type: "button", className: "action-btn", "aria-label": `Edit bill ${bill.billNumber}`, onClick: () => navigate(`/bills/${bill.id}/edit`), children: _jsx(Pencil, { size: 15 }) })) : null, isPayable(bill) ? (_jsx("button", { type: "button", className: "action-btn", "aria-label": `Record payment for bill ${bill.billNumber}`, onClick: () => setPayTarget(bill), children: _jsx(Wallet, { size: 15 }) })) : null, bill.status === 'draft' ? (_jsx("button", { type: "button", className: "action-btn", "aria-label": `Mark bill ${bill.billNumber} as open`, onClick: () => perform(() => billsApi.setStatus(bill.id, 'open'), `Bill ${bill.billNumber} is now open`), children: _jsx(CheckCircle2, { size: 15 }) })) : null, bill.status !== 'void' ? (_jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Void bill ${bill.billNumber}`, onClick: () => setConfirm({ kind: 'void', bill }), children: _jsx(Ban, { size: 15 }) })) : null, bill.status === 'draft' || bill.status === 'void' ? (_jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete bill ${bill.billNumber}`, onClick: () => setConfirm({ kind: 'delete', bill }), children: _jsx(Trash2, { size: 15 }) })) : null] })) : null] })),
        },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Bills", subtitle: "Purchase bills owed to your vendors.", actions: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => navigate('/bills/new'), children: "New bill" }) }) }), stats.error ? (_jsx(ErrorBlock, { message: stats.error, onRetry: stats.reload })) : (_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Total outstanding", value: stats.data ? formatCurrency(stats.data.totalOutstanding) : '—', sublabel: stats.data ? `${stats.data.unpaidCount} unpaid bills` : undefined }), _jsx(StatTile, { label: "Overdue", value: stats.data ? formatCurrency(stats.data.overdue) : '—', tone: "negative", sublabel: stats.data ? `${stats.data.overdueCount} bills past due` : undefined }), _jsx(StatTile, { label: "Due within 30 days", value: stats.data ? formatCurrency(stats.data.dueWithin30Days) : '—', tone: "warning" }), _jsx(StatTile, { label: "Drafts", value: stats.data ? String(stats.data.draftCount) : '—', sublabel: "Not yet posted to the ledger" })] })), _jsx(Tabs, { tabs: TABS, active: statusTab, onChange: (id) => {
                    setStatusTab(id);
                    setPage(1);
                } }), _jsxs(Toolbar, { children: [_jsx(SearchInput, { value: search, placeholder: "Search bill number, vendor bill number or vendor\u2026", onChange: (value) => {
                            setSearch(value);
                            setPage(1);
                        } }), _jsx(FilterSelect, { label: "Vendor", value: vendorId, options: vendorOptions, onChange: (value) => {
                            setVendorId(value);
                            setPage(1);
                        } }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "From" }), _jsx("input", { type: "date", className: "input select-sm", value: startDate, "aria-label": "Bills from date", onChange: (event) => {
                                    setStartDate(event.target.value);
                                    setPage(1);
                                } })] }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "To" }), _jsx("input", { type: "date", className: "input select-sm", value: endDate, "aria-label": "Bills to date", onChange: (event) => {
                                    setEndDate(event.target.value);
                                    setPage(1);
                                } })] })] }), _jsx(FormError, { message: action.error }), _jsx("div", { className: "card", children: list.loading ? (_jsx(SkeletonRows, { rows: 6, columns: 9 })) : list.error ? (_jsx(ErrorBlock, { message: list.error, onRetry: list.reload })) : !list.data || list.data.items.length === 0 ? (_jsx(EmptyState, { title: "No bills found", description: "Bills you record for your vendors will appear here.", icon: _jsx(FileText, { size: 28, "aria-hidden": "true" }), action: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => navigate('/bills/new'), children: "New bill" }) }) })) : (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: list.data.items, rowKey: (bill) => bill.id, caption: "Bills" }), _jsx(Pagination, { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: setPage })] })) }), detailId ? (_jsx(BillDetailModal, { billId: detailId, canWrite: canWrite, onClose: () => setDetailId(null), onChanged: refreshAll, onRecordPayment: (bill) => setPayTarget(bill) })) : null, payTarget ? (_jsx(RecordVendorPaymentModal, { bill: payTarget, onClose: () => setPayTarget(null), onSaved: () => {
                    setPayTarget(null);
                    refreshAll();
                } })) : null, _jsx(ConfirmDialog, { open: confirm !== null, title: confirm?.kind === 'delete' ? 'Delete this bill?' : 'Void this bill?', busy: action.submitting, confirmLabel: confirm?.kind === 'delete' ? 'Delete bill' : 'Void bill', message: _jsxs(_Fragment, { children: [_jsx("p", { children: confirm?.kind === 'delete'
                                ? `Bill ${confirm?.bill.billNumber} will be permanently deleted. Only draft or void bills can be deleted.`
                                : `Bill ${confirm?.bill.billNumber} will be voided and its ledger entries reversed. Recorded payments must be deleted first.` }), _jsx(FormError, { message: action.error })] }), onCancel: () => {
                    setConfirm(null);
                    action.reset();
                }, onConfirm: () => {
                    if (!confirm)
                        return;
                    if (confirm.kind === 'delete') {
                        void perform(() => billsApi.remove(confirm.bill.id), `Bill ${confirm.bill.billNumber} deleted`);
                    }
                    else {
                        void perform(() => billsApi.setStatus(confirm.bill.id, 'void'), `Bill ${confirm.bill.billNumber} voided`);
                    }
                } })] }));
}
