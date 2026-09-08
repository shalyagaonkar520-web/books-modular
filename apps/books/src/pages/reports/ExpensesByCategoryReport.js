import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card } from '@/components/ui/Card';
import { DonutChart } from '@/components/ui/Charts';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/utils/format';
export function ExpensesByCategoryReport({ startDate, endDate }) {
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const { data, loading, error, reload } = useAsync(() => reportsApi.expensesByCategory({ start_date: startDate, end_date: endDate }), [startDate, endDate]);
    if (loading)
        return _jsx(LoadingBlock, { label: "Grouping expenses by category\u2026" });
    if (error)
        return _jsx(ErrorBlock, { message: error, onRetry: reload });
    if (!data)
        return null;
    if (!data.rows.length) {
        return _jsx(EmptyState, { title: "No expenses in this period", description: "Record an expense, or widen the date range, to see the breakdown." });
    }
    const columns = [
        { key: 'category', header: 'Category', render: (row) => _jsx("span", { className: "strong", children: row.accountName }) },
        { key: 'count', header: 'Expenses', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatNumber(row.count, 0) }) },
        { key: 'amount', header: 'Amount', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.amount, currency) }) },
        {
            key: 'share',
            header: 'Share',
            align: 'right',
            render: (row) => _jsx("span", { className: "num text-muted", children: formatPercent(data.total > 0 ? (row.amount / data.total) * 100 : 0) }),
        },
    ];
    const totalCount = data.rows.reduce((sum, row) => sum + row.count, 0);
    return (_jsxs("div", { className: "grid-2", children: [_jsx(Card, { title: "Expenses by category", subtitle: `${formatDate(data.startDate)} to ${formatDate(data.endDate)}`, children: _jsx(DataTable, { columns: columns, rows: data.rows, rowKey: (row) => row.accountId, caption: "Expenses grouped by category", footer: _jsxs("tr", { children: [_jsx("td", { children: "Total" }), _jsx("td", { className: "align-right num", children: formatNumber(totalCount, 0) }), _jsx("td", { className: "align-right num", children: formatCurrency(data.total, currency) }), _jsx("td", { className: "align-right num", children: formatPercent(data.total > 0 ? 100 : 0) })] }) }) }), _jsx(Card, { title: "Category mix", subtitle: "Top categories in this period", children: _jsx(DonutChart, { slices: data.rows.slice(0, 6).map((row) => ({ label: row.accountName, value: row.amount })), currency: currency }) })] }));
}
