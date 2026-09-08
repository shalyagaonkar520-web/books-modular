import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Download, FileText, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, StatTile } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { IfCanWrite } from '@/auth/RouteGuards';
import { PageHeader } from '@/components/ui/PageHeader';
import { downloadFile, ApiError } from '@/api/client';
import { documentsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatBytes, formatDateTime, formatNumber } from '@/utils/format';
import { DOCUMENT_CATEGORY_OPTIONS, documentCategoryLabel } from './categories';
import { DocumentEditModal } from './DocumentEditModal';
import { DocumentUploadCard } from './DocumentUploadCard';
const PAGE_SIZE = 25;
const STATS_SAMPLE = 200;
export function DocumentsPage() {
    const toast = useToast();
    const { canWrite } = useAuth();
    const [category, setCategory] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const debouncedSearch = useDebounced(search);
    const remove = useSubmit();
    const list = useAsync(() => documentsApi.list({ page, page_size: PAGE_SIZE, category: category || undefined, search: debouncedSearch || undefined }), [page, category, debouncedSearch]);
    const stats = useAsync(() => documentsApi.list({ page: 1, page_size: STATS_SAMPLE }), []);
    const refreshAll = () => {
        list.reload();
        stats.reload();
    };
    const changeFilter = (next) => {
        setCategory(next);
        setPage(1);
    };
    const changeSearch = (next) => {
        setSearch(next);
        setPage(1);
    };
    const download = async (row) => {
        try {
            await downloadFile(`/documents/${row.id}/download`, row.originalFilename);
        }
        catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'The download could not be started.');
        }
    };
    const confirmDelete = async () => {
        if (!deleting)
            return;
        const result = await remove.run(() => documentsApi.remove(deleting.id));
        if (result) {
            toast.success(result.message);
            setDeleting(null);
            refreshAll();
        }
        else if (remove.error) {
            toast.error(remove.error);
        }
    };
    const sample = stats.data?.items ?? [];
    const sampledBytes = sample.reduce((sum, row) => sum + row.sizeBytes, 0);
    const categoryCounts = sample.reduce((counts, row) => {
        counts[row.category] = (counts[row.category] ?? 0) + 1;
        return counts;
    }, {});
    const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
    const total = stats.data?.total ?? 0;
    const sizeSublabel = total > sample.length ? `Across the ${sample.length} most recent uploads` : 'Across all documents';
    const columns = [
        {
            key: 'title',
            header: 'Document',
            render: (row) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "strong", children: row.title }), _jsx("small", { children: row.originalFilename })] })),
        },
        { key: 'category', header: 'Category', render: (row) => _jsx(Badge, { tone: "info", children: documentCategoryLabel(row.category) }) },
        { key: 'size', header: 'Size', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatBytes(row.sizeBytes) }) },
        { key: 'uploadedBy', header: 'Uploaded by', render: (row) => row.uploadedByName ?? _jsx("span", { className: "text-muted", children: "\u2014" }) },
        { key: 'uploadedAt', header: 'Uploaded at', render: (row) => formatDateTime(row.createdAt) },
        {
            key: 'checksum',
            header: 'SHA-256',
            render: (row) => (_jsx("span", { className: "mono", title: row.sha256, children: row.sha256.slice(0, 12) })),
        },
        {
            key: 'actions',
            header: '',
            align: 'right',
            width: '120px',
            render: (row) => (_jsxs("div", { className: "row-actions", children: [_jsx("button", { type: "button", className: "action-btn", onClick: () => download(row), "aria-label": `Download ${row.title}`, title: "Download", children: _jsx(Download, { size: 15 }) }), _jsxs(IfCanWrite, { children: [_jsx("button", { type: "button", className: "action-btn", onClick: () => setEditing(row), "aria-label": `Edit ${row.title}`, title: "Edit details", children: _jsx(Pencil, { size: 15 }) }), _jsx("button", { type: "button", className: "action-btn is-danger", onClick: () => setDeleting(row), "aria-label": `Delete ${row.title}`, title: "Delete", children: _jsx(Trash2, { size: 15 }) })] })] })),
        },
    ];
    return (_jsxs("div", { className: "stack", children: [_jsx(PageHeader, { title: "Documents", subtitle: "A searchable vault for every file that supports your books" }), _jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Documents", value: formatNumber(total, 0), sublabel: "Stored in this organization", icon: _jsx(FileText, { size: 16 }) }), _jsx(StatTile, { label: "Storage used", value: formatBytes(sampledBytes), sublabel: sizeSublabel }), _jsx(StatTile, { label: "Largest category", value: topCategory ? documentCategoryLabel(topCategory[0]) : '—', sublabel: topCategory ? `${topCategory[1]} ${topCategory[1] === 1 ? 'document' : 'documents'}` : 'Nothing uploaded yet' })] }), canWrite ? _jsx(DocumentUploadCard, { onUploaded: refreshAll }) : null, _jsxs(Card, { title: "All documents", children: [_jsxs(Toolbar, { children: [_jsx(SearchInput, { value: search, onChange: changeSearch, placeholder: "Search title, file name or notes\u2026" }), _jsx(FilterSelect, { label: "Category", value: category, onChange: changeFilter, options: [{ value: '', label: 'All categories' }, ...DOCUMENT_CATEGORY_OPTIONS] })] }), list.loading ? _jsx(LoadingBlock, { label: "Loading documents\u2026" }) : null, !list.loading && list.error ? _jsx(ErrorBlock, { message: list.error, onRetry: list.reload }) : null, !list.loading && !list.error && list.data && list.data.items.length === 0 ? (_jsx(EmptyState, { title: category || debouncedSearch ? 'No documents match these filters' : 'No documents yet', description: category || debouncedSearch
                            ? 'Clear the search or pick a different category.'
                            : 'Upload a contract, receipt or bank statement to get started.' })) : null, !list.loading && !list.error && list.data && list.data.items.length > 0 ? (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: list.data.items, rowKey: (row) => row.id, caption: "Stored documents" }), _jsx(Pagination, { page: list.data.page, pageSize: list.data.pageSize, total: list.data.total, onPageChange: setPage })] })) : null] }), editing ? _jsx(DocumentEditModal, { document: editing, onClose: () => setEditing(null), onSaved: refreshAll }) : null, _jsx(ConfirmDialog, { open: !!deleting, title: "Delete document", message: deleting ? (_jsxs(_Fragment, { children: [_jsx("strong", { children: deleting.title }), " and the stored file will be permanently deleted. This cannot be undone."] })) : (''), confirmLabel: "Delete", busy: remove.submitting, onConfirm: confirmDelete, onCancel: () => setDeleting(null) })] }));
}
