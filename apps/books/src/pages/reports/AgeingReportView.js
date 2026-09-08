import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate } from '@/utils/format';
export function AgeingReportView({ kind, asOf }) {
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const { data, loading, error, reload } = useAsync(() => (kind === 'receivables' ? reportsApi.receivablesAging({ as_of: asOf }) : reportsApi.payablesAging({ as_of: asOf })), [kind, asOf]);
    if (loading)
        return _jsx(LoadingBlock, { label: "Building the ageing report\u2026" });
    if (error)
        return _jsx(ErrorBlock, { message: error, onRetry: reload });
    if (!data)
        return null;
    const isReceivables = kind === 'receivables';
    const contactHeader = isReceivables ? 'Customer' : 'Vendor';
    if (!data.rows.length) {
        return (_jsx(EmptyState, { title: isReceivables ? 'Nothing outstanding from customers' : 'Nothing outstanding to vendors', description: isReceivables
                ? 'Every sent invoice has been paid as of this date.'
                : 'Every open bill has been paid as of this date.' }));
    }
    const totals = data.rows.reduce((sum, row) => ({
        current: sum.current + row.current,
        days1To30: sum.days1To30 + row.days1To30,
        days31To60: sum.days31To60 + row.days31To60,
        days61To90: sum.days61To90 + row.days61To90,
        daysOver90: sum.daysOver90 + row.daysOver90,
        total: sum.total + row.total,
    }), { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, daysOver90: 0, total: 0 });
    const money = (value) => _jsx("span", { className: "num", children: formatCurrency(value, currency) });
    const columns = [
        { key: 'contact', header: contactHeader, render: (row) => _jsx("span", { className: "strong", children: row.contactName }) },
        { key: 'current', header: 'Current', align: 'right', render: (row) => money(row.current) },
        { key: 'd1', header: '1–30 days', align: 'right', render: (row) => money(row.days1To30) },
        { key: 'd2', header: '31–60 days', align: 'right', render: (row) => money(row.days31To60) },
        { key: 'd3', header: '61–90 days', align: 'right', render: (row) => money(row.days61To90) },
        { key: 'd4', header: '> 90 days', align: 'right', render: (row) => _jsx("span", { className: row.daysOver90 > 0 ? 'num text-danger' : 'num', children: formatCurrency(row.daysOver90, currency) }) },
        { key: 'total', header: 'Total', align: 'right', render: (row) => _jsx("span", { className: "num strong", children: formatCurrency(row.total, currency) }) },
    ];
    return (_jsxs("div", { className: "stack", children: [_jsx("div", { className: "stat-grid", children: data.buckets.map((bucket) => (_jsx(StatTile, { label: bucket.label, value: formatCurrency(bucket.amount, currency), sublabel: `${bucket.count} ${bucket.count === 1 ? 'document' : 'documents'}`, tone: bucket.label === 'Current' ? 'neutral' : bucket.amount > 0 ? 'negative' : 'neutral' }, bucket.label))) }), _jsx(Card, { title: isReceivables ? 'Receivables ageing' : 'Payables ageing', subtitle: `As of ${formatDate(data.asOf)} · ${formatCurrency(data.total, currency)} outstanding`, children: _jsx(DataTable, { columns: columns, rows: data.rows, rowKey: (row) => row.contactId, caption: isReceivables ? 'Receivables ageing by customer' : 'Payables ageing by vendor', footer: _jsxs("tr", { children: [_jsx("td", { children: "Total" }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.current, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.days1To30, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.days31To60, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.days61To90, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.daysOver90, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.total, currency) })] }) }) })] }));
}
