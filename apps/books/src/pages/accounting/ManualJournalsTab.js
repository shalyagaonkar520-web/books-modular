import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Eye, Undo2 } from 'lucide-react';
import { accountingApi } from '@/api/endpoints';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, titleCase } from '@/utils/format';
import { JournalDetailModal, NewJournalModal } from './JournalModals';
const PAGE_SIZE = 25;
const SOURCE_TYPES = [
    'manual',
    'invoice',
    'invoice_cogs',
    'bill',
    'bill_stock',
    'customer_payment',
    'vendor_payment',
    'expense',
    'bank_transaction',
    'transfer',
    'payroll',
    'inventory_adjustment',
    'bank_opening',
    'item_opening',
];
const SOURCE_OPTIONS = [
    { value: '', label: 'All sources' },
    ...SOURCE_TYPES.map((sourceType) => ({ value: sourceType, label: titleCase(sourceType) })),
];
export function ManualJournalsTab({ accounts }) {
    const { canWrite } = useAuth();
    const toast = useToast();
    const [page, setPage] = useState(1);
    const [sourceType, setSourceType] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounced(search);
    const [detail, setDetail] = useState(null);
    const [newOpen, setNewOpen] = useState(false);
    const [reverseTarget, setReverseTarget] = useState(null);
    const journals = useAsync(() => accountingApi.journals({
        page,
        page_size: PAGE_SIZE,
        source_type: sourceType || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        search: debouncedSearch.trim() || undefined,
    }), [page, sourceType, startDate, endDate, debouncedSearch]);
    const action = useSubmit();
    useEffect(() => {
        if (action.error)
            toast.error(action.error);
    }, [action.error, toast]);
    const confirmReverse = async () => {
        if (!reverseTarget)
            return;
        const reversal = await action.run(() => accountingApi.reverseJournal(reverseTarget.id));
        setReverseTarget(null);
        if (reversal) {
            toast.success(`Reversal ${reversal.entryNumber} posted.`);
            journals.reload();
        }
    };
    const rows = journals.data?.items ?? [];
    const columns = [
        { key: 'entryNumber', header: 'Entry #', render: (entry) => _jsx("span", { className: "code-tag", children: entry.entryNumber }) },
        { key: 'date', header: 'Date', render: (entry) => formatDate(entry.date) },
        { key: 'reference', header: 'Reference', render: (entry) => _jsx("span", { className: "text-muted", children: entry.reference ?? '—' }) },
        { key: 'source', header: 'Source', render: (entry) => _jsx(Badge, { tone: entry.sourceType === 'manual' ? 'info' : 'neutral', children: titleCase(entry.sourceType) }) },
        { key: 'reversal', header: 'Reversal', render: (entry) => (entry.isReversal ? _jsx(Badge, { tone: "warning", children: "Reversal" }) : _jsx("span", { className: "text-subtle", children: "\u2014" })) },
        { key: 'total', header: 'Total', align: 'right', render: (entry) => _jsx("span", { className: "num", children: formatCurrency(entry.total) }) },
        {
            key: 'actions',
            header: '',
            align: 'right',
            width: '80px',
            render: (entry) => (_jsxs("div", { className: "row-actions", children: [_jsx("button", { type: "button", className: "action-btn", "aria-label": `View journal ${entry.entryNumber}`, onClick: () => setDetail(entry), children: _jsx(Eye, { size: 15 }) }), canWrite && entry.sourceType === 'manual' && !entry.isReversal ? (_jsx("button", { type: "button", className: "action-btn", "aria-label": `Reverse journal ${entry.entryNumber}`, onClick: () => setReverseTarget(entry), children: _jsx(Undo2, { size: 15 }) })) : null] })),
        },
    ];
    const resetPage = () => setPage(1);
    return (_jsxs(_Fragment, { children: [_jsxs(Toolbar, { children: [_jsx(SearchInput, { value: search, onChange: (value) => {
                            setSearch(value);
                            resetPage();
                        }, placeholder: "Search entry number, reference or notes\u2026" }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "From" }), _jsx("input", { type: "date", className: "select select-sm", value: startDate, onChange: (event) => {
                                    setStartDate(event.target.value);
                                    resetPage();
                                } })] }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "To" }), _jsx("input", { type: "date", className: "select select-sm", value: endDate, onChange: (event) => {
                                    setEndDate(event.target.value);
                                    resetPage();
                                } })] }), _jsx(FilterSelect, { label: "Source", value: sourceType, options: SOURCE_OPTIONS, onChange: (value) => {
                            setSourceType(value);
                            resetPage();
                        } }), _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", size: "sm", onClick: () => setNewOpen(true), children: "New journal entry" }) })] }), _jsx(Card, { title: "Journal entries", subtitle: `${journals.data?.total ?? 0} entry(s)`, children: journals.loading ? (_jsx(SkeletonRows, { rows: 8, columns: 6 })) : journals.error ? (_jsx(ErrorBlock, { message: journals.error, onRetry: journals.reload })) : !rows.length ? (_jsx(EmptyState, { title: "No journal entries found", description: "Adjust the filters, or post a manual journal entry." })) : (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: rows, rowKey: (entry) => entry.id, onRowClick: setDetail, caption: "Journal entries" }), _jsx(Pagination, { page: page, pageSize: PAGE_SIZE, total: journals.data?.total ?? 0, onPageChange: setPage })] })) }), _jsx(JournalDetailModal, { entry: detail, onClose: () => setDetail(null) }), _jsx(NewJournalModal, { open: newOpen, accounts: accounts, onClose: () => setNewOpen(false), onSaved: (message) => {
                    setNewOpen(false);
                    toast.success(message);
                    journals.reload();
                } }), _jsx(ConfirmDialog, { open: !!reverseTarget, title: "Reverse journal entry", message: reverseTarget
                    ? `Post a reversing entry for ${reverseTarget.entryNumber} dated ${formatDate(reverseTarget.date)}? The original entry stays on record.`
                    : '', confirmLabel: "Reverse entry", tone: "primary", busy: action.submitting, onConfirm: () => void confirmReverse(), onCancel: () => setReverseTarget(null) })] }));
}
