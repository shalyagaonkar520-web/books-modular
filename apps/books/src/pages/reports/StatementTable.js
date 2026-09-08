import { jsx as _jsx } from "react/jsx-runtime";
import { DataTable } from '@/components/ui/DataTable';
import { formatCurrency } from '@/utils/format';
/** Flattens an API report section into header / line / total rows. */
export function sectionRows(key, section) {
    const rows = [{ id: `${key}-head`, kind: 'section', label: section.title }];
    if (section.lines.length) {
        section.lines.forEach((line, index) => {
            rows.push({
                id: `${key}-line-${line.accountId ?? line.code ?? index}`,
                kind: 'line',
                code: line.code,
                label: line.name,
                amount: line.amount,
            });
        });
    }
    else {
        rows.push({ id: `${key}-none`, kind: 'note', label: 'No activity for this period' });
    }
    rows.push({ id: `${key}-total`, kind: 'total', label: `Total ${section.title.toLowerCase()}`, amount: section.total });
    return rows;
}
export function totalRow(id, label, amount) {
    return { id, kind: 'total', label, amount };
}
export function profitRow(id, label, amount) {
    return { id, kind: 'profit', label, amount };
}
function labelClass(kind) {
    if (kind === 'section')
        return 'strong';
    if (kind === 'total' || kind === 'profit')
        return 'strong';
    if (kind === 'note')
        return 'text-muted';
    return '';
}
function amountClass(row) {
    if (row.kind === 'profit') {
        const amount = row.amount ?? 0;
        if (amount > 0)
            return 'num strong text-success';
        if (amount < 0)
            return 'num strong text-danger';
        return 'num strong';
    }
    if (row.kind === 'total')
        return 'num strong';
    return 'num';
}
export function StatementTable({ rows, caption, currency = 'INR' }) {
    const columns = [
        {
            key: 'code',
            header: 'Code',
            width: '90px',
            render: (row) => (row.code ? _jsx("span", { className: "code-tag", children: row.code }) : null),
        },
        {
            key: 'label',
            header: 'Particulars',
            render: (row) => _jsx("span", { className: labelClass(row.kind), children: row.label }),
        },
        {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            width: '180px',
            render: (row) => (typeof row.amount === 'number' ? _jsx("span", { className: amountClass(row), children: formatCurrency(row.amount, currency) }) : null),
        },
    ];
    return _jsx(DataTable, { columns: columns, rows: rows, rowKey: (row) => row.id, caption: caption });
}
