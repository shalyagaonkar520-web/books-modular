import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Badge } from '@/components/ui/Badge';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatNumber, formatQuantity } from '@/utils/format';
export function InventorySummaryReportView() {
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const { data, loading, error, reload } = useAsync(() => reportsApi.inventorySummary(), []);
    if (loading)
        return _jsx(LoadingBlock, { label: "Valuing stock on hand\u2026" });
    if (error)
        return _jsx(ErrorBlock, { message: error, onRetry: reload });
    if (!data)
        return null;
    const columns = [
        {
            key: 'item',
            header: 'Item',
            render: (row) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { className: "strong", children: row.name }), _jsx("small", { children: row.sku })] })),
        },
        {
            key: 'stock',
            header: 'Stock on hand',
            align: 'right',
            render: (row) => (_jsxs("span", { className: "num", children: [formatQuantity(row.stockOnHand), " ", row.unit] })),
        },
        { key: 'reorder', header: 'Reorder level', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatQuantity(row.reorderLevel) }) },
        { key: 'cost', header: 'Cost price', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.costPrice, currency) }) },
        { key: 'value', header: 'Stock value', align: 'right', render: (row) => _jsx("span", { className: "num strong", children: formatCurrency(row.stockValue, currency) }) },
        {
            key: 'flag',
            header: 'Status',
            render: (row) => (row.isLowStock ? _jsx(Badge, { tone: "warning", children: "Low stock" }) : _jsx(Badge, { tone: "success", children: "In stock" })),
        },
    ];
    return (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Active items", value: formatNumber(data.totalItems, 0), sublabel: "Goods and services" }), _jsx(StatTile, { label: "Inventory tracked", value: formatNumber(data.trackedItems, 0), sublabel: "Items with stock tracking on" }), _jsx(StatTile, { label: "Low stock", value: formatNumber(data.lowStockItems, 0), tone: data.lowStockItems > 0 ? 'warning' : 'positive', sublabel: "At or below reorder level" }), _jsx(StatTile, { label: "Stock value", value: formatCurrency(data.totalStockValue, currency), sublabel: "Quantity on hand at cost price" })] }), _jsx(Card, { title: "Inventory summary", subtitle: "Every item with inventory tracking enabled", children: data.rows.length ? (_jsx(DataTable, { columns: columns, rows: data.rows, rowKey: (row) => row.itemId, caption: "Inventory summary by item", footer: _jsxs("tr", { children: [_jsx("td", { colSpan: 4, children: "Total stock value" }), _jsx("td", { className: "align-right num", children: formatCurrency(data.totalStockValue, currency) }), _jsx("td", {})] }) })) : (_jsx(EmptyState, { title: "No inventory-tracked items", description: "Turn on inventory tracking for a goods item to see stock levels and valuation here." })) })] }));
}
