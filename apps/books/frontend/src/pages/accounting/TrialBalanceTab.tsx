import { useState } from 'react';

import { accountingApi } from '@/api/endpoints';
import type { TrialBalance } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, titleCase, todayIso } from '@/utils/format';

type TrialBalanceRow = TrialBalance['rows'][number];

export function TrialBalanceTab() {
  const [asOf, setAsOf] = useState(todayIso());
  const trialBalance = useAsync(() => accountingApi.trialBalance({ as_of: asOf }), [asOf]);

  const report = trialBalance.data;
  const balanced = !!report && report.totalDebit === report.totalCredit;

  const columns: Array<Column<TrialBalanceRow>> = [
    { key: 'code', header: 'Code', width: '90px', render: (row) => <span className="code-tag">{row.code}</span> },
    { key: 'name', header: 'Account', render: (row) => row.name },
    { key: 'type', header: 'Type', render: (row) => titleCase(row.type) },
    { key: 'debit', header: 'Debit', align: 'right', render: (row) => <span className="num">{row.debit ? formatCurrency(row.debit) : '—'}</span> },
    { key: 'credit', header: 'Credit', align: 'right', render: (row) => <span className="num">{row.credit ? formatCurrency(row.credit) : '—'}</span> },
  ];

  return (
    <>
      <Toolbar>
        <label className="filter-select">
          <span>As of</span>
          <input type="date" className="select select-sm" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
        </label>
        {report ? (
          <Badge tone={balanced ? 'success' : 'danger'}>{balanced ? 'Balanced' : 'Out of balance'}</Badge>
        ) : null}
      </Toolbar>

      <Card
        title="Trial balance"
        subtitle={report ? `As at ${formatDate(report.asOf)}` : undefined}
        footer={
          report ? (
            <div className="row-between">
              <span className="text-muted">
                Total debit {formatCurrency(report.totalDebit)} · Total credit {formatCurrency(report.totalCredit)}
              </span>
              <Badge tone={balanced ? 'success' : 'danger'}>
                {balanced ? 'Debits equal credits' : `Difference of ${formatCurrency(report.totalDebit - report.totalCredit)}`}
              </Badge>
            </div>
          ) : null
        }
      >
        {trialBalance.loading ? (
          <SkeletonRows rows={8} columns={5} />
        ) : trialBalance.error ? (
          <ErrorBlock message={trialBalance.error} onRetry={trialBalance.reload} />
        ) : !report?.rows.length ? (
          <EmptyState title="Nothing posted yet" description="Once transactions hit the ledger they will show up here." />
        ) : (
          <DataTable
            columns={columns}
            rows={report.rows}
            rowKey={(row) => row.accountId}
            caption="Trial balance"
            footer={
              <tr>
                <td colSpan={3} className="strong">
                  Totals
                </td>
                <td className="align-right num strong">{formatCurrency(report.totalDebit)}</td>
                <td className="align-right num strong">{formatCurrency(report.totalCredit)}</td>
              </tr>
            }
          />
        )}
      </Card>
    </>
  );
}
