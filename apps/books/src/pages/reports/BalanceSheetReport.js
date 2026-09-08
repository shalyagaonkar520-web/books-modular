import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, StatTile } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate } from '@/utils/format';
import { StatementTable, profitRow, sectionRows, totalRow } from './StatementTable';
export function BalanceSheetReport({ asOf }) {
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const { data, loading, error, reload } = useAsync(() => reportsApi.balanceSheet({ as_of: asOf }), [asOf]);
    if (loading)
        return _jsx(LoadingBlock, { label: "Preparing the balance sheet\u2026" });
    if (error)
        return _jsx(ErrorBlock, { message: error, onRetry: reload });
    if (!data)
        return null;
    const sections = [data.assets, data.liabilities, data.equity];
    if (!sections.some((section) => section.lines.length)) {
        return (_jsx(EmptyState, { title: "Nothing on the balance sheet yet", description: "Once transactions are posted to the ledger, assets, liabilities and equity will appear here." }));
    }
    const difference = data.assets.total - data.totalLiabilitiesAndEquity;
    const rows = [
        ...sectionRows('assets', data.assets),
        ...sectionRows('liabilities', data.liabilities),
        ...sectionRows('equity', data.equity),
        profitRow('current-earnings', 'Current period earnings', data.currentPeriodEarnings),
        totalRow('total-le', 'Total liabilities and equity', data.totalLiabilitiesAndEquity),
    ];
    return (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Total assets", value: formatCurrency(data.assets.total, currency), sublabel: `As of ${formatDate(data.asOf)}` }), _jsx(StatTile, { label: "Total liabilities", value: formatCurrency(data.liabilities.total, currency) }), _jsx(StatTile, { label: "Equity", value: formatCurrency(data.equity.total, currency), sublabel: `Includes ${formatCurrency(data.currentPeriodEarnings, currency)} current period earnings` }), _jsx(StatTile, { label: "Assets \u2212 liabilities & equity", value: formatCurrency(difference, currency), tone: data.isBalanced ? 'positive' : 'negative', sublabel: data.isBalanced ? 'The books balance' : 'Review the ledger for unbalanced entries' })] }), _jsx(Card, { title: "Balance sheet", subtitle: `As of ${formatDate(data.asOf)}`, actions: _jsxs(Badge, { tone: data.isBalanced ? 'success' : 'danger', children: [data.isBalanced ? _jsx(CheckCircle2, { size: 13, "aria-hidden": "true" }) : _jsx(AlertTriangle, { size: 13, "aria-hidden": "true" }), data.isBalanced ? ' Balanced' : ' Out of balance'] }), children: _jsx(StatementTable, { rows: rows, currency: currency, caption: "Balance sheet" }) })] }));
}
