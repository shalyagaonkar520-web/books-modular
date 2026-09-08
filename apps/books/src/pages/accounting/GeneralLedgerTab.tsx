import { useEffect, useState } from 'react';

import { accountingApi } from '@/api/endpoints';
import type { Account, LedgerLine } from '@/api/types';
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
    { key: 'date', header: 'Date', render: (line) => formatDate(line.date) },
    { key: 'entryNumber', header: 'Entry #', render: (line) => <span className="code-tag">{line.entryNumber}</span> },
    { key: 'source', header: 'Source', render: (line) => titleCase(line.sourceType) },
    {
      key: 'description',
      header: 'Description',
      render: (line) => (
        <div className="cell-stack">
          <span>{line.description ?? '—'}</span>
          {line.reference ? <small>Ref: {line.reference}</small> : null}
        </div>
      ),
    },
    { key: 'debit', header: 'Debit', align: 'right', render: (line) => <span className="num">{line.debit ? formatCurrency(line.debit) : '—'}</span> },
    { key: 'credit', header: 'Credit', align: 'right', render: (line) => <span className="num">{line.credit ? formatCurrency(line.credit) : '—'}</span> },
    { key: 'balance', header: 'Running balance', align: 'right', render: (line) => <span className="num">{formatCurrency(line.balance)}</span> },
  ];

  if (accountsError) return <ErrorBlock message={accountsError} onRetry={onRetryAccounts} />;
  if (accountsLoading) return <LoadingBlock label="Loading accounts…" />;
  if (!accounts.length) return <EmptyState title="No accounts yet" description="Create a ledger account to view its general ledger." />;

  const report = ledger.data;

  return (
    <>
      <Toolbar>
        <FilterSelect
          label="Account"
          value={accountId}
          options={accounts.map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` }))}
          onChange={setAccountId}
        />
        <label className="filter-select">
          <span>From</span>
          <input type="date" className="select select-sm" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="filter-select">
          <span>To</span>
          <input type="date" className="select select-sm" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </Toolbar>

      {ledger.loading ? (
        <SkeletonRows rows={8} columns={7} />
      ) : ledger.error ? (
        <ErrorBlock message={ledger.error} onRetry={ledger.reload} />
      ) : !report ? (
        <EmptyState title="Select an account" description="Pick an account above to see its movements." />
      ) : (
        <>
          <div className="stat-grid">
            <StatTile label="Opening balance" value={formatCurrency(report.openingBalance)} sublabel={startDate ? `Before ${formatDate(startDate)}` : 'From inception'} />
            <StatTile label="Movements" value={String(report.lines.length)} sublabel={`${titleCase(report.account.type)} account`} />
            <StatTile
              label="Closing balance"
              value={formatCurrency(report.closingBalance)}
              sublabel={endDate ? `As at ${formatDate(endDate)}` : 'To date'}
              tone={report.closingBalance < 0 ? 'negative' : 'positive'}
            />
          </div>
          <Card title={`${report.account.code} · ${report.account.name}`} subtitle={`${titleCase(report.account.type)}${report.account.subtype ? ` · ${titleCase(report.account.subtype)}` : ''}`}>
            {!report.lines.length ? (
              <EmptyState title="No movements in this period" description="Widen the date range to see earlier activity." />
            ) : (
              <DataTable
                columns={columns}
                rows={report.lines}
                rowKey={(line) => `${line.entryId}-${line.date}-${line.debit}-${line.credit}-${line.balance}`}
                caption="General ledger movements"
                footer={
                  <tr>
                    <td colSpan={6} className="strong">
                      Closing balance
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
