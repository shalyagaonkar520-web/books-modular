import { useEffect, useState } from 'react';

import { accountingApi } from '@/api/endpoints';
import type { Account, LedgerLine } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, titleCase } from '@/utils/format';

interface GeneralLedgerTabProps {
  accounts: Account[];
  accountsLoading: boolean;
  accountsError: string | null;
  onRetryAccounts: () => void;
}

export function GeneralLedgerTab({ accounts, accountsLoading, accountsError, onRetryAccounts }: GeneralLedgerTabProps) {
  const { t } = useAppContent();
  const [accountId, setAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const ledger = useAsync(
    () =>
      accountId
        ? accountingApi.ledger(accountId, { start_date: startDate || undefined, end_date: endDate || undefined })
        : Promise.resolve(null),
    [accountId, startDate, endDate],
  );

  const columns: Array<Column<LedgerLine>> = [
    { key: 'date', header: t('accounting.ledger.col.date'), render: (line) => formatDate(line.date) },
    { key: 'entryNumber', header: t('accounting.ledger.col.entryNumber'), render: (line) => <span className="code-tag">{line.entryNumber}</span> },
    { key: 'source', header: t('accounting.ledger.col.source'), render: (line) => titleCase(line.sourceType) },
    {
      key: 'description',
      header: t('accounting.ledger.col.description'),
      render: (line) => (
        <div className="cell-stack">
          <span>{line.description ?? '—'}</span>
          {line.reference ? <small>{t('accounting.ledger.reference', { reference: line.reference })}</small> : null}
        </div>
      ),
    },
    { key: 'debit', header: t('accounting.ledger.col.debit'), align: 'right', render: (line) => <span className="num">{line.debit ? formatCurrency(line.debit) : '—'}</span> },
    { key: 'credit', header: t('accounting.ledger.col.credit'), align: 'right', render: (line) => <span className="num">{line.credit ? formatCurrency(line.credit) : '—'}</span> },
    { key: 'balance', header: t('accounting.ledger.col.runningBalance'), align: 'right', render: (line) => <span className="num">{formatCurrency(line.balance)}</span> },
  ];

  if (accountsError) return <ErrorBlock message={accountsError} onRetry={onRetryAccounts} />;
  if (accountsLoading) return <LoadingBlock label={t('accounting.ledger.loadingAccounts')} />;
  if (!accounts.length) return <EmptyState title={t('accounting.ledger.noAccounts.title')} description={t('accounting.ledger.noAccounts.body')} />;

  const report = ledger.data;

  return (
    <>
      <Toolbar>
        <FilterSelect
          label={t('accounting.ledger.filter.account')}
          value={accountId}
          options={accounts.map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` }))}
          onChange={setAccountId}
        />
        <label className="filter-select">
          <span>{t('accounting.ledger.filter.from')}</span>
          <input type="date" className="select select-sm" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="filter-select">
          <span>{t('accounting.ledger.filter.to')}</span>
          <input type="date" className="select select-sm" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </Toolbar>

      {ledger.loading ? (
        <SkeletonRows rows={8} columns={7} />
      ) : ledger.error ? (
        <ErrorBlock message={ledger.error} onRetry={ledger.reload} />
      ) : !report ? (
        <EmptyState title={t('accounting.ledger.selectAccount.title')} description={t('accounting.ledger.selectAccount.body')} />
      ) : (
        <>
          <div className="stat-grid">
            <StatTile
              label={t('accounting.ledger.stat.openingBalance')}
              value={formatCurrency(report.openingBalance)}
              sublabel={startDate ? t('accounting.ledger.stat.before', { date: formatDate(startDate) }) : t('accounting.ledger.stat.fromInception')}
            />
            <StatTile
              label={t('accounting.ledger.stat.movements')}
              value={String(report.lines.length)}
              sublabel={t('accounting.ledger.stat.accountType', { type: titleCase(report.account.type) })}
            />
            <StatTile
              label={t('accounting.ledger.stat.closingBalance')}
              value={formatCurrency(report.closingBalance)}
              sublabel={endDate ? t('accounting.ledger.stat.asAt', { date: formatDate(endDate) }) : t('accounting.ledger.stat.toDate')}
              tone={report.closingBalance < 0 ? 'negative' : 'positive'}
            />
          </div>
          <Card title={`${report.account.code} · ${report.account.name}`} subtitle={`${titleCase(report.account.type)}${report.account.subtype ? ` · ${titleCase(report.account.subtype)}` : ''}`}>
            {!report.lines.length ? (
              <EmptyState title={t('accounting.ledger.noMovements.title')} description={t('accounting.ledger.noMovements.body')} />
            ) : (
              <DataTable
                columns={columns}
                rows={report.lines}
                rowKey={(line) => `${line.entryId}-${line.date}-${line.debit}-${line.credit}-${line.balance}`}
                caption={t('accounting.ledger.tableCaption')}
                footer={
                  <tr>
                    <td colSpan={6} className="strong">
                      {t('accounting.ledger.footer.closingBalance')}
                    </td>
                    <td className="align-right num strong">{formatCurrency(report.closingBalance)}</td>
                  </tr>
                }
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
