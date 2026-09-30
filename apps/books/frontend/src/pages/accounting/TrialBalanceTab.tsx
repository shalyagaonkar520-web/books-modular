import { useState } from 'react';

import { accountingApi } from '@/api/endpoints';
import type { TrialBalance } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, titleCase, todayIso } from '@/utils/format';

type TrialBalanceRow = TrialBalance['rows'][number];

export function TrialBalanceTab() {
  const { t } = useAppContent();
  const [asOf, setAsOf] = useState(todayIso());
  const trialBalance = useAsync(() => accountingApi.trialBalance({ as_of: asOf }), [asOf]);

  const report = trialBalance.data;
  const balanced = !!report && report.totalDebit === report.totalCredit;

  const columns: Array<Column<TrialBalanceRow>> = [
    { key: 'code', header: t('accounting.trialBalance.col.code'), width: '90px', render: (row) => <span className="code-tag">{row.code}</span> },
    { key: 'name', header: t('accounting.trialBalance.col.account'), render: (row) => row.name },
    { key: 'type', header: t('accounting.trialBalance.col.type'), render: (row) => titleCase(row.type) },
    { key: 'debit', header: t('accounting.trialBalance.col.debit'), align: 'right', render: (row) => <span className="num">{row.debit ? formatCurrency(row.debit) : '—'}</span> },
    { key: 'credit', header: t('accounting.trialBalance.col.credit'), align: 'right', render: (row) => <span className="num">{row.credit ? formatCurrency(row.credit) : '—'}</span> },
  ];

  return (
    <>
      <Toolbar>
        <label className="filter-select">
          <span>{t('accounting.trialBalance.asOf')}</span>
          <input type="date" className="select select-sm" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
        </label>
        {report ? (
          <Badge tone={balanced ? 'success' : 'danger'}>{balanced ? t('accounting.trialBalance.balanced') : t('accounting.trialBalance.outOfBalance')}</Badge>
        ) : null}
      </Toolbar>

      <Card
        title={t('accounting.trialBalance.cardTitle')}
        subtitle={report ? t('accounting.trialBalance.asAt', { date: formatDate(report.asOf) }) : undefined}
        footer={
          report ? (
            <div className="row-between">
              <span className="text-muted">
                {t('accounting.trialBalance.footerTotals', {
                  debit: formatCurrency(report.totalDebit),
                  credit: formatCurrency(report.totalCredit),
                })}
              </span>
              <Badge tone={balanced ? 'success' : 'danger'}>
                {balanced
                  ? t('accounting.trialBalance.debitsEqualCredits')
                  : t('accounting.trialBalance.differenceOf', { amount: formatCurrency(report.totalDebit - report.totalCredit) })}
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
          <EmptyState title={t('accounting.trialBalance.empty.title')} description={t('accounting.trialBalance.empty.body')} />
        ) : (
          <DataTable
            columns={columns}
            rows={report.rows}
            rowKey={(row) => row.accountId}
            caption={t('accounting.trialBalance.tableCaption')}
            footer={
              <tr>
                <td colSpan={3} className="strong">
                  {t('accounting.trialBalance.totals')}
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
