import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { accountingApi } from '@/api/endpoints';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, titleCase } from '@/utils/format';
export function GeneralLedgerTab({ accounts, accountsLoading, accountsError, onRetryAccounts }) {
    const [accountId, setAccountId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    useEffect(() => {
        if (!accountId && accounts.length)
            setAccountId(accounts[0].id);
    }, [accounts, accountId]);
    const ledger = useAsync(() => accountId
        ? accountingApi.ledger(accountId, { start_date: startDate || undefined, end_date: endDate || undefined })
        : Promise.resolve(null), [accountId, startDate, endDate]);
    const columns = [
        { key: 'date', header: 'Date', render: (line) => formatDate(line.date) },
        { key: 'entryNumber', header: 'Entry #', render: (line) => _jsx("span", { className: "code-tag", children: line.entryNumber }) },
        { key: 'source', header: 'Source', render: (line) => titleCase(line.sourceType) },
        {
            key: 'description',
            header: 'Description',
            render: (line) => (_jsxs("div", { className: "cell-stack", children: [_jsx("span", { children: line.description ?? '—' }), line.reference ? _jsxs("small", { children: ["Ref: ", line.reference] }) : null] })),
        },
        { key: 'debit', header: 'Debit', align: 'right', render: (line) => _jsx("span", { className: "num", children: line.debit ? formatCurrency(line.debit) : '—' }) },
        { key: 'credit', header: 'Credit', align: 'right', render: (line) => _jsx("span", { className: "num", children: line.credit ? formatCurrency(line.credit) : '—' }) },
        { key: 'balance', header: 'Running balance', align: 'right', render: (line) => _jsx("span", { className: "num", children: formatCurrency(line.balance) }) },
    ];
    if (accountsError)
        return _jsx(ErrorBlock, { message: accountsError, onRetry: onRetryAccounts });
    if (accountsLoading)
        return _jsx(LoadingBlock, { label: "Loading accounts\u2026" });
    if (!accounts.length)
        return _jsx(EmptyState, { title: "No accounts yet", description: "Create a ledger account to view its general ledger." });
    const report = ledger.data;
    return (_jsxs(_Fragment, { children: [_jsxs(Toolbar, { children: [_jsx(FilterSelect, { label: "Account", value: accountId, options: accounts.map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` })), onChange: setAccountId }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "From" }), _jsx("input", { type: "date", className: "select select-sm", value: startDate, onChange: (event) => setStartDate(event.target.value) })] }), _jsxs("label", { className: "filter-select", children: [_jsx("span", { children: "To" }), _jsx("input", { type: "date", className: "select select-sm", value: endDate, onChange: (event) => setEndDate(event.target.value) })] })] }), ledger.loading ? (_jsx(SkeletonRows, { rows: 8, columns: 7 })) : ledger.error ? (_jsx(ErrorBlock, { message: ledger.error, onRetry: ledger.reload })) : !report ? (_jsx(EmptyState, { title: "Select an account", description: "Pick an account above to see its movements." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "stat-grid", children: [_jsx(StatTile, { label: "Opening balance", value: formatCurrency(report.openingBalance), sublabel: startDate ? `Before ${formatDate(startDate)}` : 'From inception' }), _jsx(StatTile, { label: "Movements", value: String(report.lines.length), sublabel: `${titleCase(report.account.type)} account` }), _jsx(StatTile, { label: "Closing balance", value: formatCurrency(report.closingBalance), sublabel: endDate ? `As at ${formatDate(endDate)}` : 'To date', tone: report.closingBalance < 0 ? 'negative' : 'positive' })] }), _jsx(Card, { title: `${report.account.code} · ${report.account.name}`, subtitle: `${titleCase(report.account.type)}${report.account.subtype ? ` · ${titleCase(report.account.subtype)}` : ''}`, children: !report.lines.length ? (_jsx(EmptyState, { title: "No movements in this period", description: "Widen the date range to see earlier activity." })) : (_jsx(DataTable, { columns: columns, rows: report.lines, rowKey: (line) => `${line.entryId}-${line.date}-${line.debit}-${line.credit}-${line.balance}`, caption: "General ledger movements", footer: _jsxs("tr", { children: [_jsx("td", { colSpan: 6, className: "strong", children: "Closing balance" }), _jsx("td", { className: "align-right num strong", children: formatCurrency(report.closingBalance) })] }) })) })] }))] }));
}
