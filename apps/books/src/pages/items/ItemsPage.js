import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Item catalogue: search, filters, sorting, create/edit, details and stock adjustments. */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Eye, Package, Pencil, Plus, SlidersHorizontal, Trash2, TrendingDown, Wallet } from 'lucide-react';
import { accountingApi, contactsApi, itemsApi, reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/AuthContext';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate, formatDateTime, formatPercent, formatQuantity, parseNumber, todayIso } from '@/utils/format';
import { TAX_RATES, UNITS } from '@/utils/status';
const PAGE_SIZE = 25;
const TYPE_FILTERS = [
    { value: 'all', label: 'All types' },
    { value: 'goods', label: 'Goods' },
    { value: 'service', label: 'Services' },
];
const INVENTORY_FILTERS = [
    { value: 'all', label: 'All items' },
    { value: 'tracked', label: 'Inventory tracked' },
    { value: 'non-tracked', label: 'Not tracked' },
    { value: 'low-stock', label: 'Low stock' },
];
const TYPE_OPTIONS = [
    { value: 'goods', label: 'Goods' },
    { value: 'service', label: 'Service' },
];
const UNIT_OPTIONS = UNITS.map((unit) => ({ value: unit, label: unit }));
const TAX_OPTIONS = TAX_RATES.map((rate) => ({ value: String(rate), label: `${rate}%` }));
function stockTone(item) {
    if (item.stockOnHand <= 0)
        return 'danger';
    if (item.stockOnHand <= item.reorderLevel)
        return 'warning';
    return 'success';
}
function StockCell({ item }) {
    if (item.type === 'service' || !item.trackInventory)
        return _jsx("span", { className: "text-muted", children: "Not tracked" });
    return (_jsxs(Badge, { tone: stockTone(item), children: [formatQuantity(item.stockOnHand), " ", item.unit] }));
}
export function ItemsPage() {
    const toast = useToast();
    const { canWrite } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounced(search);
    const [typeFilter, setTypeFilter] = useState('all');
    const [inventoryFilter, setInventoryFilter] = useState('all');
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortOrder, setSortOrder] = useState('desc');
    const [page, setPage] = useState(1);
    const [formItem, setFormItem] = useState(null);
    const [formOpen, setFormOpen] = useState(false);
    const [detailsItem, setDetailsItem] = useState(null);
    const [adjustItem, setAdjustItem] = useState(null);
    const [deleteItem, setDeleteItem] = useState(null);
    const deleteSubmit = useSubmit();
    const list = useAsync((signal) => itemsApi.list({
        search: debouncedSearch.trim() || undefined,
        type_filter: typeFilter,
        inventory_filter: inventoryFilter,
        sort_by: sortBy,
        sort_order: sortOrder,
        page,
        page_size: PAGE_SIZE,
    }, signal), [debouncedSearch, typeFilter, inventoryFilter, sortBy, sortOrder, page]);
    const summary = useAsync(() => reportsApi.inventorySummary(), []);
    const options = useAsync(async () => {
        const [income, expense, asset, vendors] = await Promise.all([
            accountingApi.accounts({ type: 'income' }),
            accountingApi.accounts({ type: 'expense' }),
            accountingApi.accounts({ type: 'asset' }),
            contactsApi.list({ type: 'vendor', page_size: 200 }),
        ]);
        const toOption = (account) => ({ value: account.id, label: `${account.code} · ${account.name}` });
        return {
            salesAccounts: income.map(toOption),
            purchaseAccounts: [...expense, ...asset].map(toOption),
            vendors: vendors.items.map((vendor) => ({ value: vendor.id, label: vendor.displayName })),
        };
    }, []);
    const wantsNew = canWrite && searchParams.get('new') === '1';
    useEffect(() => {
        if (wantsNew) {
            setFormItem(null);
            setFormOpen(true);
        }
    }, [wantsNew]);
    function closeForm() {
        setFormOpen(false);
        setFormItem(null);
        if (searchParams.has('new')) {
            const next = new URLSearchParams(searchParams);
            next.delete('new');
            setSearchParams(next, { replace: true });
        }
    }
    function reloadAll() {
        list.reload();
        summary.reload();
    }
    function handleSort(key) {
        setPage(1);
        if (sortBy === key) {
            setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
        }
        else {
            setSortBy(key);
            setSortOrder(key === 'createdAt' ? 'desc' : 'asc');
        }
    }
    async function confirmDelete() {
        if (!deleteItem)
            return;
        const result = await deleteSubmit.run(() => itemsApi.remove(deleteItem.id));
        if (!result)
            return;
        if (result.message.toLowerCase().includes('inactive'))
            toast.notify(result.message, 'warning');
        else
            toast.success(result.message);
        setDeleteItem(null);
        reloadAll();
    }
    const rows = list.data?.items ?? [];
    const stats = summary.data;
    const columns = [
        {
            key: 'name',
            header: 'Item',
            sortable: true,
            render: (item) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "strong", children: item.name }), _jsx("small", { className: "mono", children: item.sku }), item.description ? _jsx("small", { className: "text-muted", children: item.description }) : null] })),
        },
        { key: 'type', header: 'Type', render: (item) => _jsx(Badge, { tone: item.type === 'goods' ? 'info' : 'neutral', children: item.type === 'goods' ? 'Goods' : 'Service' }) },
        { key: 'unit', header: 'Unit', render: (item) => _jsx("span", { className: "text-muted", children: item.unit }) },
        { key: 'taxRate', header: 'Tax', align: 'right', render: (item) => _jsx("span", { className: "num", children: formatPercent(item.taxRate) }) },
        { key: 'sellingPrice', header: 'Selling price', align: 'right', sortable: true, render: (item) => _jsx("span", { className: "num", children: formatCurrency(item.sellingPrice) }) },
        { key: 'costPrice', header: 'Cost price', align: 'right', sortable: true, render: (item) => _jsx("span", { className: "num", children: formatCurrency(item.costPrice) }) },
        { key: 'stockOnHand', header: 'Stock', align: 'right', sortable: true, render: (item) => _jsx(StockCell, { item: item }) },
        { key: 'createdAt', header: 'Added', sortable: true, render: (item) => _jsx("span", { className: "text-muted small", children: formatDate(item.createdAt) }) },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (item) => (_jsxs("div", { className: "row-actions", children: [_jsx("button", { type: "button", className: "action-btn", "aria-label": `View ${item.name}`, onClick: () => setDetailsItem(item), children: _jsx(Eye, { size: 15 }) }), _jsxs(IfCanWrite, { children: [_jsx("button", { type: "button", className: "action-btn", "aria-label": `Edit ${item.name}`, onClick: () => {
                                    setFormItem(item);
                                    setFormOpen(true);
                                }, children: _jsx(Pencil, { size: 15 }) }), item.trackInventory ? (_jsx("button", { type: "button", className: "action-btn", "aria-label": `Adjust stock for ${item.name}`, onClick: () => setAdjustItem(item), children: _jsx(SlidersHorizontal, { size: 15 }) })) : null, _jsx("button", { type: "button", className: "action-btn is-danger", "aria-label": `Delete ${item.name}`, onClick: () => setDeleteItem(item), children: _jsx(Trash2, { size: 15 }) })] })] })),
        },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Items", subtitle: "Goods and services you sell or buy, with inventory tracking.", actions: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => {
                            setFormItem(null);
                            setFormOpen(true);
                        }, children: "New item" }) }) }), stats ? (_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Total items", value: formatQuantity(stats.totalItems), sublabel: `${list.data?.total ?? 0} matching filters`, icon: _jsx(Package, { size: 16 }) }), _jsx(StatTile, { label: "Tracked items", value: formatQuantity(stats.trackedItems), sublabel: "Inventory managed", icon: _jsx(Boxes, { size: 16 }) }), _jsx(StatTile, { label: "Stock value", value: formatCurrency(stats.totalStockValue), sublabel: "At cost price", icon: _jsx(Wallet, { size: 16 }) }), _jsx(StatTile, { label: "Low stock", value: formatQuantity(stats.lowStockItems), sublabel: "At or below reorder level", tone: stats.lowStockItems > 0 ? 'negative' : 'neutral', icon: _jsx(TrendingDown, { size: 16 }) })] })) : null, _jsxs(Toolbar, { children: [_jsx(SearchInput, { value: search, onChange: (value) => {
                            setSearch(value);
                            setPage(1);
                        }, placeholder: "Search name, SKU, HSN\u2026", label: "Search items" }), _jsx(FilterSelect, { label: "Type", value: typeFilter, onChange: (value) => {
                            setTypeFilter(value);
                            setPage(1);
                        }, options: TYPE_FILTERS }), _jsx(FilterSelect, { label: "Inventory", value: inventoryFilter, onChange: (value) => {
                            setInventoryFilter(value);
                            setPage(1);
                        }, options: INVENTORY_FILTERS })] }), _jsx("div", { className: "card", children: list.loading ? (_jsx("div", { className: "card-body", children: _jsx(SkeletonRows, { rows: 6, columns: 7 }) })) : list.error ? (_jsx("div", { className: "card-body", children: _jsx(ErrorBlock, { message: list.error, onRetry: list.reload }) })) : !rows.length ? (_jsx("div", { className: "card-body", children: _jsx(EmptyState, { title: "No items yet", description: "Add the goods and services you sell so you can put them on invoices and bills.", icon: _jsx(Package, { size: 28, "aria-hidden": "true" }), action: _jsx(IfCanWrite, { children: _jsx(Button, { variant: "primary", icon: _jsx(Plus, { size: 15 }), onClick: () => {
                                    setFormItem(null);
                                    setFormOpen(true);
                                }, children: "New item" }) }) }) })) : (_jsxs(_Fragment, { children: [_jsx(DataTable, { columns: columns, rows: rows, rowKey: (item) => item.id, onRowClick: (item) => setDetailsItem(item), sortBy: sortBy, sortOrder: sortOrder, onSort: handleSort, caption: "Item catalogue" }), _jsx(Pagination, { page: page, pageSize: PAGE_SIZE, total: list.data?.total ?? 0, onPageChange: setPage })] })) }), formOpen ? (_jsx(ItemFormModal, { item: formItem, options: options.data, optionsError: options.error, onClose: closeForm, onSaved: (message) => {
                    toast.success(message);
                    closeForm();
                    reloadAll();
                } })) : null, detailsItem ? _jsx(ItemDetailsModal, { item: detailsItem, onClose: () => setDetailsItem(null) }) : null, adjustItem ? (_jsx(AdjustStockModal, { item: adjustItem, onClose: () => setAdjustItem(null), onSaved: (message) => {
                    toast.success(message);
                    setAdjustItem(null);
                    reloadAll();
                } })) : null, _jsx(ConfirmDialog, { open: !!deleteItem, title: "Delete item", message: deleteItem
                    ? `Delete “${deleteItem.name}” (${deleteItem.sku})? If the item is used on invoices or bills it will be marked inactive instead.`
                    : '', confirmLabel: "Delete item", busy: deleteSubmit.submitting, onConfirm: confirmDelete, onCancel: () => {
                    setDeleteItem(null);
                    deleteSubmit.reset();
                } })] }));
}
function initialForm(item) {
    return {
        name: item?.name ?? '',
        sku: item?.sku ?? '',
        type: item?.type ?? 'goods',
        unit: item?.unit ?? 'pcs',
        hsnSac: item?.hsnSac ?? '',
        taxRate: String(item?.taxRate ?? 18),
        description: item?.description ?? '',
        sellingPrice: item ? String(item.sellingPrice) : '',
        salesAccountId: item?.salesAccountId ?? '',
        salesDescription: item?.salesDescription ?? '',
        costPrice: item ? String(item.costPrice) : '',
        purchaseAccountId: item?.purchaseAccountId ?? '',
        preferredVendorId: item?.preferredVendorId ?? '',
        purchaseDescription: item?.purchaseDescription ?? '',
        trackInventory: item?.trackInventory ?? false,
        openingStock: item ? String(item.openingStock) : '0',
        openingStockRate: item ? String(item.openingStockRate) : '0',
        reorderLevel: item ? String(item.reorderLevel) : '0',
        warehouseLocation: item?.warehouseLocation ?? '',
    };
}
function ItemFormModal({ item, options, optionsError, onClose, onSaved }) {
    const [form, setForm] = useState(() => initialForm(item));
    const { submitting, error, fieldErrors, run } = useSubmit();
    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const tracks = form.type === 'goods' && form.trackInventory;
    async function save() {
        const payload = {
            name: form.name.trim(),
            sku: form.sku.trim(),
            type: form.type,
            unit: form.unit,
            hsnSac: form.hsnSac.trim() || null,
            taxRate: parseNumber(form.taxRate),
            description: form.description.trim() || null,
            sellingPrice: parseNumber(form.sellingPrice),
            salesAccountId: form.salesAccountId || null,
            salesDescription: form.salesDescription.trim() || null,
            costPrice: parseNumber(form.costPrice),
            purchaseAccountId: form.purchaseAccountId || null,
            preferredVendorId: form.preferredVendorId || null,
            purchaseDescription: form.purchaseDescription.trim() || null,
            trackInventory: tracks,
            openingStock: tracks ? parseNumber(form.openingStock) : 0,
            openingStockRate: tracks ? parseNumber(form.openingStockRate) : 0,
            reorderLevel: tracks ? parseNumber(form.reorderLevel) : 0,
            warehouseLocation: tracks ? form.warehouseLocation.trim() || null : null,
        };
        const result = await run(() => (item ? itemsApi.update(item.id, payload) : itemsApi.create(payload)));
        if (result)
            onSaved(item ? `${result.name} updated` : `${result.name} created`);
    }
    return (_jsxs(Modal, { open: true, size: "lg", title: item ? 'Edit item' : 'New item', subtitle: item ? item.sku : 'Goods and services you sell or purchase', onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", loading: submitting, onClick: save, children: item ? 'Save changes' : 'Create item' })] }), children: [_jsx(FormError, { message: error ?? optionsError }), _jsxs("section", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Basics" }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Name", required: true, value: form.name, error: fieldErrors.name, onChange: (event) => set('name', event.target.value) }), _jsx(TextField, { label: "SKU", required: true, value: form.sku, error: fieldErrors.sku, hint: "Unique code for this item", onChange: (event) => set('sku', event.target.value) }), _jsx(SelectField, { label: "Type", value: form.type, options: TYPE_OPTIONS, error: fieldErrors.type, onChange: (event) => set('type', event.target.value) }), _jsx(SelectField, { label: "Unit", value: form.unit, options: UNIT_OPTIONS, error: fieldErrors.unit, onChange: (event) => set('unit', event.target.value) }), _jsx(TextField, { label: "HSN / SAC", value: form.hsnSac, error: fieldErrors.hsnSac, onChange: (event) => set('hsnSac', event.target.value) }), _jsx(SelectField, { label: "Tax rate", value: form.taxRate, options: TAX_OPTIONS, error: fieldErrors.taxRate, onChange: (event) => set('taxRate', event.target.value) })] }), _jsx(TextAreaField, { label: "Description", value: form.description, error: fieldErrors.description, onChange: (event) => set('description', event.target.value) })] }), _jsxs("section", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Sales information" }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Selling price", type: "number", min: "0", step: "0.01", prefix: "\u20B9", value: form.sellingPrice, error: fieldErrors.sellingPrice, onChange: (event) => set('sellingPrice', event.target.value) }), _jsx(SelectField, { label: "Sales account", value: form.salesAccountId, placeholder: "Use the default income account", options: options?.salesAccounts ?? [], error: fieldErrors.salesAccountId, onChange: (event) => set('salesAccountId', event.target.value) })] }), _jsx(TextAreaField, { label: "Sales description", rows: 2, value: form.salesDescription, error: fieldErrors.salesDescription, hint: "Shown on invoices when this item is added", onChange: (event) => set('salesDescription', event.target.value) })] }), _jsxs("section", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Purchase information" }), _jsxs("div", { className: "form-grid-3", children: [_jsx(TextField, { label: "Cost price", type: "number", min: "0", step: "0.01", prefix: "\u20B9", value: form.costPrice, error: fieldErrors.costPrice, onChange: (event) => set('costPrice', event.target.value) }), _jsx(SelectField, { label: "Purchase account", value: form.purchaseAccountId, placeholder: "Use the default expense account", options: options?.purchaseAccounts ?? [], error: fieldErrors.purchaseAccountId, onChange: (event) => set('purchaseAccountId', event.target.value) }), _jsx(SelectField, { label: "Preferred vendor", value: form.preferredVendorId, placeholder: "No preferred vendor", options: options?.vendors ?? [], error: fieldErrors.preferredVendorId, onChange: (event) => set('preferredVendorId', event.target.value) })] }), _jsx(TextAreaField, { label: "Purchase description", rows: 2, value: form.purchaseDescription, error: fieldErrors.purchaseDescription, hint: "Shown on bills when this item is added", onChange: (event) => set('purchaseDescription', event.target.value) })] }), form.type === 'goods' ? (_jsxs("section", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Inventory" }), _jsx(CheckboxField, { label: "Track inventory for this item", hint: "Records stock on hand and posts opening stock to the ledger", checked: form.trackInventory, onChange: (event) => set('trackInventory', event.target.checked) }), form.trackInventory ? (_jsxs("div", { className: "form-grid-3", children: [_jsx(TextField, { label: "Opening stock", type: "number", min: "0", step: "0.001", value: form.openingStock, error: fieldErrors.openingStock, onChange: (event) => set('openingStock', event.target.value) }), _jsx(TextField, { label: "Opening stock rate", type: "number", min: "0", step: "0.01", prefix: "\u20B9", value: form.openingStockRate, error: fieldErrors.openingStockRate, onChange: (event) => set('openingStockRate', event.target.value) }), _jsx(TextField, { label: "Reorder level", type: "number", min: "0", step: "0.001", value: form.reorderLevel, error: fieldErrors.reorderLevel, onChange: (event) => set('reorderLevel', event.target.value) }), _jsx(TextField, { label: "Warehouse location", value: form.warehouseLocation, error: fieldErrors.warehouseLocation, onChange: (event) => set('warehouseLocation', event.target.value) })] })) : null] })) : null] }));
}
function Detail({ label, value }) {
    return (_jsxs("div", { className: "detail-item", children: [_jsx("span", { className: "detail-label", children: label }), _jsx("span", { className: "detail-value", children: value })] }));
}
function ItemDetailsModal({ item, onClose }) {
    const dash = _jsx("span", { className: "text-muted", children: "\u2014" });
    return (_jsxs(Modal, { open: true, size: "lg", title: item.name, subtitle: `${item.sku} · ${item.type === 'goods' ? 'Goods' : 'Service'}`, onClose: onClose, children: [_jsxs("div", { className: "detail-grid", children: [_jsx(Detail, { label: "SKU", value: _jsx("span", { className: "mono", children: item.sku }) }), _jsx(Detail, { label: "Type", value: _jsx(Badge, { tone: item.type === 'goods' ? 'info' : 'neutral', children: item.type === 'goods' ? 'Goods' : 'Service' }) }), _jsx(Detail, { label: "Unit", value: item.unit }), _jsx(Detail, { label: "HSN / SAC", value: item.hsnSac || dash }), _jsx(Detail, { label: "Tax rate", value: formatPercent(item.taxRate) }), _jsx(Detail, { label: "Status", value: _jsx(Badge, { tone: item.isActive ? 'success' : 'neutral', children: item.isActive ? 'Active' : 'Inactive' }) }), _jsx(Detail, { label: "Selling price", value: formatCurrency(item.sellingPrice) }), _jsx(Detail, { label: "Sales account", value: item.salesAccountName || dash }), _jsx(Detail, { label: "Cost price", value: formatCurrency(item.costPrice) }), _jsx(Detail, { label: "Purchase account", value: item.purchaseAccountName || dash }), _jsx(Detail, { label: "Preferred vendor", value: item.preferredVendorName || dash }), _jsx(Detail, { label: "Inventory", value: item.trackInventory ? 'Tracked' : 'Not tracked' }), item.trackInventory ? (_jsxs(_Fragment, { children: [_jsx(Detail, { label: "Stock on hand", value: _jsx(Badge, { tone: stockTone(item), children: `${formatQuantity(item.stockOnHand)} ${item.unit}` }) }), _jsx(Detail, { label: "Reorder level", value: `${formatQuantity(item.reorderLevel)} ${item.unit}` }), _jsx(Detail, { label: "Opening stock", value: `${formatQuantity(item.openingStock)} ${item.unit}` }), _jsx(Detail, { label: "Opening stock rate", value: formatCurrency(item.openingStockRate) }), _jsx(Detail, { label: "Stock valuation", value: _jsx("span", { className: "strong", children: formatCurrency(item.stockOnHand * item.costPrice) }) }), _jsx(Detail, { label: "Warehouse", value: item.warehouseLocation || dash })] })) : null, _jsx(Detail, { label: "Created", value: formatDateTime(item.createdAt) }), _jsx(Detail, { label: "Last updated", value: formatDateTime(item.updatedAt) })] }), item.description || item.salesDescription || item.purchaseDescription ? (_jsxs("div", { className: "stack", children: [item.description ? _jsx(Detail, { label: "Description", value: item.description }) : null, item.salesDescription ? _jsx(Detail, { label: "Sales description", value: item.salesDescription }) : null, item.purchaseDescription ? _jsx(Detail, { label: "Purchase description", value: item.purchaseDescription }) : null] })) : null] }));
}
function AdjustStockModal({ item, onClose, onSaved }) {
    const [date, setDate] = useState(todayIso());
    const [quantityDelta, setQuantityDelta] = useState('');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const { submitting, error, fieldErrors, run } = useSubmit();
    const history = useAsync(() => itemsApi.adjustments({ item_id: item.id, page_size: 5 }), [item.id]);
    async function save() {
        const result = await run(() => itemsApi.adjust({
            itemId: item.id,
            date,
            quantityDelta: parseNumber(quantityDelta),
            reason: reason.trim(),
            notes: notes.trim() || undefined,
        }));
        if (result)
            onSaved(`${result.adjustmentNumber} recorded for ${item.name}`);
    }
    return (_jsxs(Modal, { open: true, title: "Adjust stock", subtitle: `${item.name} · on hand ${formatQuantity(item.stockOnHand)} ${item.unit}`, onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", loading: submitting, onClick: save, children: "Save adjustment" })] }), children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Date", type: "date", required: true, value: date, error: fieldErrors.date, onChange: (event) => setDate(event.target.value) }), _jsx(TextField, { label: "Quantity change", type: "number", step: "0.001", required: true, value: quantityDelta, error: fieldErrors.quantityDelta, hint: "Use a negative number to reduce stock", onChange: (event) => setQuantityDelta(event.target.value) })] }), _jsx(TextField, { label: "Reason", required: true, value: reason, error: fieldErrors.reason, onChange: (event) => setReason(event.target.value) }), _jsx(TextAreaField, { label: "Notes", rows: 2, value: notes, error: fieldErrors.notes, onChange: (event) => setNotes(event.target.value) }), _jsxs("section", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Recent adjustments" }), history.loading ? (_jsx(SkeletonRows, { rows: 3, columns: 3 })) : history.error ? (_jsx(ErrorBlock, { message: history.error, onRetry: history.reload })) : !history.data?.items.length ? (_jsx("p", { className: "text-muted small", children: "No stock adjustments recorded for this item yet." })) : (_jsx("ul", { className: "totals-list", children: history.data.items.map((adjustment) => (_jsxs("li", { children: [_jsxs("span", { children: [_jsx("span", { className: "mono", children: adjustment.adjustmentNumber }), " \u00B7 ", formatDate(adjustment.date), " \u00B7 ", adjustment.reason] }), _jsxs("span", { className: adjustment.quantityDelta < 0 ? 'num text-danger' : 'num text-success', children: [adjustment.quantityDelta > 0 ? '+' : '', formatQuantity(adjustment.quantityDelta), " ", item.unit] })] }, adjustment.id))) }))] })] }));
}
