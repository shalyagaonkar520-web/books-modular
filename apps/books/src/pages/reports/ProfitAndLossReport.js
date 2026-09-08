import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Card } from '@/components/ui/Card';
import { DonutChart } from '@/components/ui/Charts';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate } from '@/utils/format';
import { StatementTable, profitRow, sectionRows } from './StatementTable';
export function ProfitAndLossReport({ startDate, endDate }) {
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const { data, loading, error, reload } = useAsync(() => reportsApi.profitAndLoss({ start_date: startDate, end_date: endDate }), [startDate, endDate]);
    if (loading)
        return _jsx(LoadingBlock, { label: "Preparing the profit and loss statement\u2026" });
    if (error)
        return _jsx(ErrorBlock, { message: error, onRetry: reload });
    if (!data)
        return null;
    const sections = [data.income, data.costOfGoodsSold, data.operatingExpenses, data.otherIncome];
    if (!sections.some((section) => section.lines.length)) {
        return (_jsx(EmptyState, { title: "No ledger activity in this period", description: "Send an invoice, open a bill or record an expense and the profit and loss statement will fill in." }));
    }
    const rows = [
        ...sectionRows('income', data.income),
        ...sectionRows('cogs', data.costOfGoodsSold),
        profitRow('gross-profit', 'Gross profit', data.grossProfit),
        ...sectionRows('opex', data.operatingExpenses),
        profitRow('operating-profit', 'Operating profit', data.operatingProfit),
        ...sectionRows('other-income', data.otherIncome),
        profitRow('net-profit', 'Net profit', data.netProfit),
    ];
    const expenseSlices = [...data.operatingExpenses.lines, ...data.costOfGoodsSold.lines]
        .filter((line) => line.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6)
        .map((line) => ({ label: line.name, value: line.amount }));
    return (_jsxs("div", { className: "grid-2", children: [_jsx(Card, { title: "Profit and loss", subtitle: `${formatDate(startDate)} to ${formatDate(endDate)}`, children: _jsx(StatementTable, { rows: rows, currency: currency, caption: "Profit and loss statement" }) }), _jsxs("div", { className: "stack", children: [_jsx(Card, { title: "Where the money went", subtitle: "Largest expense accounts in this period", children: _jsx(DonutChart, { slices: expenseSlices, currency: currency }) }), _jsx(Card, { title: "Summary", children: _jsxs("div", { className: "totals-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Income" }), _jsx("span", { className: "num", children: formatCurrency(data.income.total, currency) })] }), _jsxs("div", { children: [_jsx("span", { children: "Cost of goods sold" }), _jsx("span", { className: "num", children: formatCurrency(data.costOfGoodsSold.total, currency) })] }), _jsxs("div", { children: [_jsx("span", { children: "Gross profit" }), _jsx("span", { className: "num", children: formatCurrency(data.grossProfit, currency) })] }), _jsxs("div", { children: [_jsx("span", { children: "Operating expenses" }), _jsx("span", { className: "num", children: formatCurrency(data.operatingExpenses.total, currency) })] }), _jsxs("div", { children: [_jsx("span", { children: "Other income" }), _jsx("span", { className: "num", children: formatCurrency(data.otherIncome.total, currency) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Net profit" }), _jsx("span", { className: data.netProfit < 0 ? 'num text-danger' : 'num text-success', children: formatCurrency(data.netProfit, currency) })] })] }) })] })] }));
}
