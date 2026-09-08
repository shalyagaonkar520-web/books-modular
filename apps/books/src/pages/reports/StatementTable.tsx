import { DataTable, type Column } from '@/components/ui/DataTable';
import type { ReportSection } from '@/api/types';
import { formatCurrency } from '@/utils/format';

export type StatementRowKind = 'section' | 'line' | 'note' | 'total' | 'profit';

export interface StatementRow {
  id: string;
  kind: StatementRowKind;
  code?: string | null;
  label: string;
  amount?: number;
}

/** Flattens an API report section into header / line / total rows. */
export function sectionRows(key: string, section: ReportSection): StatementRow[] {
  const rows: StatementRow[] = [{ id: `${key}-head`, kind: 'section', label: section.title }];
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
  } else {
    rows.push({ id: `${key}-none`, kind: 'note', label: 'No activity for this period' });
  }
  rows.push({ id: `${key}-total`, kind: 'total', label: `Total ${section.title.toLowerCase()}`, amount: section.total });
  return rows;
}

export function totalRow(id: string, label: string, amount: number): StatementRow {
  return { id, kind: 'total', label, amount };
}

export function profitRow(id: string, label: string, amount: number): StatementRow {
  return { id, kind: 'profit', label, amount };
}

function labelClass(kind: StatementRowKind): string {
  if (kind === 'section') return 'strong';
  if (kind === 'total' || kind === 'profit') return 'strong';
  if (kind === 'note') return 'text-muted';
  return '';
}

function amountClass(row: StatementRow): string {
  if (row.kind === 'profit') {
    const amount = row.amount ?? 0;
    if (amount > 0) return 'num strong text-success';
    if (amount < 0) return 'num strong text-danger';
    return 'num strong';
  }
  if (row.kind === 'total') return 'num strong';
  return 'num';
}

interface StatementTableProps {
  rows: StatementRow[];
  caption: string;
  currency?: string;
}

export function StatementTable({ rows, caption, currency = 'INR' }: StatementTableProps) {
  const columns: Array<Column<StatementRow>> = [
    {
      key: 'code',
      header: 'Code',
      width: '90px',
      render: (row) => (row.code ? <span className="code-tag">{row.code}</span> : null),
    },
    {
      key: 'label',
      header: 'Particulars',
      render: (row) => <span className={labelClass(row.kind)}>{row.label}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      width: '180px',
      render: (row) => (typeof row.amount === 'number' ? <span className={amountClass(row)}>{formatCurrency(row.amount, currency)}</span> : null),
    },
  ];

  return <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={caption} />;
}
