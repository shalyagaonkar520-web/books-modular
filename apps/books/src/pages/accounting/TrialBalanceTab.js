import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { accountingApi } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, titleCase, todayIso } from '@/utils/format';
export function TrialBalanceTab() {
    const [asOf, setAsOf] = useState(todayIso());
    const trialBalance = useAsync(() => accountingApi.trialBalance({ as_of: asOf }), [asOf]);
    const report = trialBalance.data;
    const balanced = !!report && report.totalDebit === report.totalCredit;
    const columns = [
        { key: 'code', header: 'Code', width: '90px', render: (row) => _jsx("span", { className: "code-tag", children: row.code }) },
        { key: 'name', header: 'Account', render: (row) => row.name },
        { key: 'type', header: 'Type', render: (row) => titleCase(row.type) },
        { key: 'debit', header: 'Debit', align: 'right', render: (row) => _jsx("span", { className: "num", children: row.debit ? formatCurrency(row.debit) : '—' }) },
        { key: 'credit', header: 'Credit', align: 'right', render: (row) => _jsx("span", { className: "num", children: row.credit ? formatCurrency(row.credit) : '—' }) },
    ];
    return (_jsxs(_Fragment, { children: [_jsxs(Toolbar, { children: [_jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "As of" }), _jsx("input", { type: "date", className: "select select-sm", value: asOf, onChange: (event) => setAsOf(event.target.value) })] }), report ? (_jsx(Badge, { tone: balanced ? 'success' : 'danger', children: balanced ? 'Balanced' : 'Out of balance' })) : null] }), _jsx(Card, { title: "Trial balance", subtitle: report ? `As at ${formatDate(report.asOf)}` : undefined, footer: report ? (_jsxs("div", { className: "row-between", children: [_jsxs("span", { className: "text-muted", children: ["Total debit ", formatCurrency(report.totalDebit), " \u00B7 Total credit ", formatCurrency(report.totalCredit)] }), _jsx(Badge, { tone: balanced ? 'success' : 'danger', children: balanced ? 'Debits equal credits' : `Difference of ${formatCurrency(report.totalDebit - report.totalCredit)}` })] })) : null, children: trialBalance.loading ? (_jsx(SkeletonRows, { rows: 8, columns: 5 })) : trialBalance.error ? (_jsx(ErrorBlock, { message: trialBalance.error, onRetry: trialBalance.reload })) : !report?.rows.length ? (_jsx(EmptyState, { title: "Nothing posted yet", description: "Once transactions hit the ledger they will show up here." })) : (_jsx(DataTable, { columns: columns, rows: report.rows, rowKey: (row) => row.accountId, caption: "Trial balance", footer: _jsxs("tr", { children: [_jsx("td", { colSpan: 3, className: "strong", children: "Totals" }), _jsx("td", { className: "align-right num strong", children: formatCurrency(report.totalDebit) }), _jsx("td", { className: "align-right num strong", children: formatCurrency(report.totalCredit) })] }) })) })] }));
}
