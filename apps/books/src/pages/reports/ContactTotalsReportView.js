import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate, formatNumber } from '@/utils/format';
export function ContactTotalsReportView({ kind, startDate, endDate }) {
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const query = { start_date: startDate, end_date: endDate };
    const { data, loading, error, reload } = useAsync(() => (kind === 'sales' ? reportsApi.salesByCustomer(query) : reportsApi.purchasesByVendor(query)), [kind, startDate, endDate]);
    if (loading)
        return _jsx(LoadingBlock, { label: "Crunching the numbers\u2026" });
    if (error)
        return _jsx(ErrorBlock, { message: error, onRetry: reload });
    if (!data)
        return null;
    const isSales = kind === 'sales';
    if (!data.rows.length) {
        return (_jsx(EmptyState, { title: isSales ? 'No invoices in this period' : 'No bills in this period', description: isSales
                ? 'Sales are counted once an invoice is sent. Pick a wider date range or send an invoice.'
                : 'Purchases are counted once a bill is open. Pick a wider date range or open a bill.' }));
    }
    const totals = data.rows.reduce((sum, row) => ({
        documentCount: sum.documentCount + row.documentCount,
        amount: sum.amount + row.amount,
        amountPaid: sum.amountPaid + row.amountPaid,
        balance: sum.balance + row.balance,
    }), { documentCount: 0, amount: 0, amountPaid: 0, balance: 0 });
    const columns = [
        { key: 'contact', header: isSales ? 'Customer' : 'Vendor', render: (row) => _jsx("span", { className: "strong", children: row.contactName }) },
        { key: 'count', header: isSales ? 'Invoices' : 'Bills', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatNumber(row.documentCount, 0) }) },
        { key: 'amount', header: 'Amount', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.amount, currency) }) },
        { key: 'paid', header: 'Paid', align: 'right', render: (row) => _jsx("span", { className: "num text-success", children: formatCurrency(row.amountPaid, currency) }) },
        {
            key: 'balance',
            header: 'Balance',
            align: 'right',
            render: (row) => _jsx("span", { className: row.balance > 0 ? 'num strong text-warning' : 'num strong', children: formatCurrency(row.balance, currency) }),
        },
    ];
    return (_jsx(Card, { title: isSales ? 'Sales by customer' : 'Purchases by vendor', subtitle: `${formatDate(data.startDate)} to ${formatDate(data.endDate)} · ${formatCurrency(data.total, currency)} in total`, children: _jsx(DataTable, { columns: columns, rows: data.rows, rowKey: (row) => row.contactId, caption: isSales ? 'Sales totals by customer' : 'Purchase totals by vendor', footer: _jsxs("tr", { children: [_jsx("td", { children: "Total" }), _jsx("td", { className: "align-right num", children: formatNumber(totals.documentCount, 0) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.amount, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.amountPaid, currency) }), _jsx("td", { className: "align-right num", children: formatCurrency(totals.balance, currency) })] }) }) }));
}
