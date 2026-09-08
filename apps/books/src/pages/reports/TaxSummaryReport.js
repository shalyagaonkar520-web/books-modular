import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card, StatTile } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate } from '@/utils/format';
export function TaxSummaryReport({ startDate, endDate }) {
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const { data, loading, error, reload } = useAsync(() => reportsApi.taxSummary({ start_date: startDate, end_date: endDate }), [startDate, endDate]);
    if (loading)
        return _jsx(LoadingBlock, { label: "Adding up GST\u2026" });
    if (error)
        return _jsx(ErrorBlock, { message: error, onRetry: reload });
    if (!data)
        return null;
    if (!data.outputGst && !data.inputGst && !data.taxableSales && !data.taxablePurchases) {
        return (_jsx(EmptyState, { title: "No taxable activity in this period", description: "Send an invoice, open a bill or record an expense with GST to see the tax position." }));
    }
    const payable = data.netPayable;
    const netLabel = payable > 0 ? 'Net GST payable' : payable < 0 ? 'Net GST credit' : 'Net GST';
    return (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Output GST (on sales)", value: formatCurrency(data.outputGst, currency), sublabel: "Collected from customers" }), _jsx(StatTile, { label: "Input GST (on purchases)", value: formatCurrency(data.inputGst, currency), sublabel: "Paid on bills and expenses" }), _jsx(StatTile, { label: netLabel, value: formatCurrency(Math.abs(payable), currency), tone: payable > 0 ? 'negative' : payable < 0 ? 'positive' : 'neutral', sublabel: payable > 0 ? 'Owed to the tax authority' : payable < 0 ? 'Input credit carried forward' : 'Nothing due for this period' })] }), _jsx(Card, { title: "Tax summary (GST)", subtitle: `${formatDate(data.startDate)} to ${formatDate(data.endDate)}`, children: _jsxs("dl", { className: "detail-grid", children: [_jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: "Taxable sales" }), _jsx("dd", { className: "detail-value num", children: formatCurrency(data.taxableSales, currency) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: "Output GST" }), _jsx("dd", { className: "detail-value num", children: formatCurrency(data.outputGst, currency) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: "Taxable purchases" }), _jsx("dd", { className: "detail-value num", children: formatCurrency(data.taxablePurchases, currency) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: "Input GST" }), _jsx("dd", { className: "detail-value num", children: formatCurrency(data.inputGst, currency) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: netLabel }), _jsx("dd", { className: `detail-value num strong ${payable > 0 ? 'text-danger' : payable < 0 ? 'text-success' : ''}`.trim(), children: formatCurrency(Math.abs(payable), currency) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { className: "detail-label", children: "GSTIN" }), _jsx("dd", { className: "detail-value", children: organization?.gstin ? _jsx("span", { className: "mono", children: organization.gstin }) : _jsx("span", { className: "text-muted", children: "Not set" }) })] })] }) })] }));
}
