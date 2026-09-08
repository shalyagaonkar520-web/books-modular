import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Clock, Landmark, Package, Wallet, } from 'lucide-react';
import { dashboardApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Card, StatTile } from '@/components/ui/Card';
import { DonutChart, GroupedBarChart, SplitBar } from '@/components/ui/Charts';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect } from '@/components/ui/Toolbar';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber, titleCase } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';
const PERIOD_OPTIONS = [
    { value: 'this_fiscal_year', label: 'This fiscal year' },
    { value: 'last_fiscal_year', label: 'Last fiscal year' },
    { value: 'this_quarter', label: 'This quarter' },
    { value: 'this_month', label: 'This month' },
    { value: 'last_month', label: 'Last month' },
];
const ACTIVITY_ROUTES = {
    invoice: '/invoices',
    bill: '/bills',
    customer_payment: '/payments-received',
    vendor_payment: '/payments-made',
    expense: '/expenses',
};
export function DashboardPage() {
    const { organization, user } = useAuth();
    const [period, setPeriod] = useState('this_fiscal_year');
    const currency = organization?.currency ?? 'INR';
    const { data, loading, error, reload } = useAsync(() => dashboardApi.summary(period), [period]);
    if (loading && !data)
        return _jsx(LoadingBlock, { label: "Building your dashboard\u2026" });
    if (error)
        return _jsx(ErrorBlock, { message: error, onRetry: reload });
    if (!data)
        return null;
    const { receivables, payables, cashFlow, incomeExpense, inventory, bankBalances, topCustomers, recentActivity } = data;
    const hasAnyActivity = receivables.totalReceivables > 0 ||
        payables.totalPayables > 0 ||
        data.totalCash !== 0 ||
        recentActivity.length > 0 ||
        inventory.totalItemsCount > 0;
    const activityColumns = [
        {
            key: 'document',
            header: 'Document',
            render: (row) => (_jsxs(Link, { to: ACTIVITY_ROUTES[row.type] ?? '/', className: "cell-stack", children: [_jsx("span", { className: "strong", children: row.number }), _jsx("small", { children: titleCase(row.type) })] })),
        },
        { key: 'contact', header: 'Contact', render: (row) => row.contactName ?? '—' },
        { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
        {
            key: 'status',
            header: 'Status',
            render: (row) => (row.status ? _jsx(Badge, { tone: statusTone(row.status), children: statusLabel(row.status) }) : _jsx("span", { className: "text-subtle", children: "\u2014" })),
        },
        { key: 'amount', header: 'Amount', align: 'right', render: (row) => _jsx("span", { className: "num", children: formatCurrency(row.amount, currency) }) },
    ];
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: `Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`, subtitle: `Live position for ${organization?.name ?? 'your organization'}. Every figure below comes from your posted transactions.`, actions: _jsx(FilterSelect, { label: "Period", value: period, onChange: (value) => setPeriod(value), options: PERIOD_OPTIONS }) }), !hasAnyActivity ? (_jsx(Card, { children: _jsx(EmptyState, { title: "Your books are empty", description: "Add a customer and raise your first invoice, or record a bill or expense. The dashboard fills in from real transactions as you go.", action: _jsxs("div", { className: "row", children: [_jsx(Link, { to: "/customers?new=1", className: "btn btn-primary btn-md", children: _jsx("span", { children: "Add a customer" }) }), _jsx(Link, { to: "/items?new=1", className: "btn btn-secondary btn-md", children: _jsx("span", { children: "Add an item" }) })] }) }) })) : null, _jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Cash on hand", value: formatCurrency(data.totalCash, currency), sublabel: `${bankBalances.length} account(s)`, icon: _jsx(Landmark, { size: 16 }) }), _jsx(StatTile, { label: "Receivables", value: formatCurrency(receivables.totalReceivables, currency), sublabel: `${receivables.totalUnpaidInvoices} unpaid invoice(s)`, tone: receivables.overdueAmount > 0 ? 'warning' : 'neutral', icon: _jsx(ArrowUpRight, { size: 16 }) }), _jsx(StatTile, { label: "Payables", value: formatCurrency(payables.totalPayables, currency), sublabel: `${payables.totalUnpaidBills} unpaid bill(s)`, icon: _jsx(ArrowDownRight, { size: 16 }) }), _jsx(StatTile, { label: `Net ${incomeExpense.totalIncome >= incomeExpense.totalExpense ? 'profit' : 'loss'}`, value: formatCurrency(Math.abs(incomeExpense.net), currency), sublabel: `${formatDate(incomeExpense.startDate)} – ${formatDate(incomeExpense.endDate)}`, tone: incomeExpense.net >= 0 ? 'positive' : 'negative', icon: _jsx(Wallet, { size: 16 }) })] }), _jsxs("div", { className: "grid-2", children: [_jsxs(Card, { title: "Receivables", subtitle: "What your customers owe you", actions: _jsxs(Link, { to: "/invoices?status=unpaid", className: "btn btn-link btn-sm", children: [_jsx("span", { children: "View invoices" }), _jsx(ArrowRight, { size: 13 })] }), children: [_jsx("div", { className: "stat-value num", children: formatCurrency(receivables.totalReceivables, currency) }), _jsx(SplitBar, { total: receivables.totalReceivables, segments: [
                                    { label: 'Current', value: receivables.currentAmount, tone: 'current' },
                                    { label: 'Overdue', value: receivables.overdueAmount, tone: 'overdue' },
                                ] }), _jsxs("dl", { className: "detail-grid", children: [_jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Current" }), _jsx("dd", { className: "num", children: formatCurrency(receivables.currentAmount, currency) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Overdue" }), _jsx("dd", { className: `num ${receivables.overdueAmount > 0 ? 'text-danger' : ''}`, children: formatCurrency(receivables.overdueAmount, currency) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Unpaid invoices" }), _jsx("dd", { className: "num", children: receivables.totalUnpaidInvoices })] })] })] }), _jsxs(Card, { title: "Payables", subtitle: "What you owe your vendors", actions: _jsxs(Link, { to: "/bills?status=unpaid", className: "btn btn-link btn-sm", children: [_jsx("span", { children: "View bills" }), _jsx(ArrowRight, { size: 13 })] }), children: [_jsx("div", { className: "stat-value num", children: formatCurrency(payables.totalPayables, currency) }), _jsx(SplitBar, { total: payables.totalPayables, segments: [
                                    { label: 'Current', value: payables.currentAmount, tone: 'current' },
                                    { label: 'Overdue', value: payables.overdueAmount, tone: 'overdue' },
                                ] }), _jsxs("dl", { className: "detail-grid", children: [_jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Current" }), _jsx("dd", { className: "num", children: formatCurrency(payables.currentAmount, currency) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Overdue" }), _jsx("dd", { className: `num ${payables.overdueAmount > 0 ? 'text-warning' : ''}`, children: formatCurrency(payables.overdueAmount, currency) })] }), _jsxs("div", { className: "detail-item", children: [_jsx("dt", { children: "Unpaid bills" }), _jsx("dd", { className: "num", children: payables.totalUnpaidBills })] })] })] })] }), _jsxs(Card, { title: "Cash flow", subtitle: `Bank movement from ${formatDate(cashFlow.startDate)} to ${formatDate(cashFlow.endDate)}`, children: [_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Opening balance", value: formatCurrency(cashFlow.openingBalance, currency) }), _jsx(StatTile, { label: "Money in", value: formatCurrency(cashFlow.incomingAmount, currency), tone: "positive" }), _jsx(StatTile, { label: "Money out", value: formatCurrency(cashFlow.outgoingAmount, currency), tone: "negative" }), _jsx(StatTile, { label: "Closing balance", value: formatCurrency(cashFlow.closingBalance, currency), tone: cashFlow.netCashFlow >= 0 ? 'positive' : 'negative' })] }), _jsx(GroupedBarChart, { data: cashFlow.breakdown.map((point) => ({ label: point.label, incoming: point.incoming, outgoing: point.outgoing })), currency: currency })] }), _jsxs(Card, { title: "Income and expense", subtitle: "Accrual view from your ledger, by period", children: [_jsx(GroupedBarChart, { data: incomeExpense.breakdown.map((point) => ({ label: point.label, incoming: point.incoming, outgoing: point.outgoing })), incomingLabel: "Income", outgoingLabel: "Expense", currency: currency }), _jsxs("div", { className: "row-between", style: { marginTop: 8 }, children: [_jsxs("span", { className: "text-muted small", children: ["Income ", formatCurrency(incomeExpense.totalIncome, currency), " \u00B7 Expense ", formatCurrency(incomeExpense.totalExpense, currency)] }), _jsxs(Link, { to: "/reports", className: "btn btn-link btn-sm", children: [_jsx("span", { children: "Open profit and loss" }), _jsx(ArrowRight, { size: 13 })] })] })] }), _jsxs("div", { className: "grid-2", children: [_jsx(Card, { title: "Bank and cash balances", actions: _jsxs(Link, { to: "/banking", className: "btn btn-link btn-sm", children: [_jsx("span", { children: "Banking" }), _jsx(ArrowRight, { size: 13 })] }), children: bankBalances.length === 0 ? (_jsx("p", { className: "text-muted small", children: "No bank or cash accounts yet." })) : (_jsx("ul", { className: "plain-list", children: bankBalances.map((account) => (_jsxs("li", { children: [_jsxs("span", { className: "cell-stack", children: [_jsx("span", { className: "strong", children: account.name }), _jsx("small", { children: titleCase(account.type) })] }), _jsx("span", { className: "num strong", children: formatCurrency(account.balance, currency) })] }, account.bankAccountId))) })) }), _jsx(Card, { title: "Top customers", subtitle: "By invoiced value in this period", children: topCustomers.length === 0 ? (_jsx("p", { className: "text-muted small", children: "No invoices in this period yet." })) : (_jsx(DonutChart, { slices: topCustomers.map((customer) => ({ label: customer.contactName, value: customer.amount })), currency: currency })) })] }), _jsxs("div", { className: "grid-2", children: [_jsx(Card, { title: "Inventory", subtitle: "Stock position across tracked items", actions: _jsxs(Link, { to: "/items", className: "btn btn-link btn-sm", children: [_jsx("span", { children: "Items" }), _jsx(ArrowRight, { size: 13 })] }), children: _jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Items", value: formatNumber(inventory.totalItemsCount, 0), sublabel: `${inventory.goodsCount} goods · ${inventory.serviceCount} services`, icon: _jsx(Package, { size: 16 }) }), _jsx(StatTile, { label: "Tracked", value: formatNumber(inventory.trackedCount, 0) }), _jsx(StatTile, { label: "Stock value", value: formatCurrencyCompact(inventory.totalInventoryValuation, currency) }), _jsx(StatTile, { label: "Low stock", value: formatNumber(inventory.lowStockItemsCount, 0), tone: inventory.lowStockItemsCount > 0 ? 'warning' : 'neutral', icon: _jsx(AlertTriangle, { size: 16 }) })] }) }), _jsx(Card, { title: "Unbilled time", subtitle: "Billable hours logged but not yet invoiced", actions: _jsxs(Link, { to: "/time-tracking", className: "btn btn-link btn-sm", children: [_jsx("span", { children: "Time tracking" }), _jsx(ArrowRight, { size: 13 })] }), children: _jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Unbilled hours", value: formatNumber(data.unbilledHours, 2), icon: _jsx(Clock, { size: 16 }) }), _jsx(StatTile, { label: "Value at project rates", value: formatCurrency(data.unbilledAmount, currency), tone: data.unbilledAmount > 0 ? 'warning' : 'neutral' })] }) })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-header", children: _jsxs("div", { children: [_jsx("h2", { className: "card-title", children: "Recent activity" }), _jsx("p", { className: "card-subtitle", children: "Latest invoices, bills, payments and expenses" })] }) }), recentActivity.length === 0 ? (_jsx("div", { className: "card-body", children: _jsx("p", { className: "text-muted small", children: "Nothing recorded yet." }) })) : (_jsx(DataTable, { columns: activityColumns, rows: recentActivity, rowKey: (row) => `${row.type}-${row.id}`, caption: "Recent activity" }))] })] }));
}
