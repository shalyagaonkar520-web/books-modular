import { cashFlowApi, type CashFlowSection } from '@/api/docFlow';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate } from '@/utils/format';

import { StatementTable, profitRow, totalRow, type StatementRow } from './StatementTable';

function rowsFor(key: string, section: CashFlowSection, title: string, totalLabel: string, emptyLabel: string): StatementRow[] {
  const rows: StatementRow[] = [{ id: `${key}-head`, kind: 'section', label: title }];
  if (section.lines.length) {
    section.lines.forEach((line, index) => rows.push({ id: `${key}-${line.accountId ?? index}`, kind: 'line', code: line.code, label: line.label, amount: line.amount }));
  } else {
    rows.push({ id: `${key}-none`, kind: 'note', label: emptyLabel });
  }
  rows.push(totalRow(`${key}-total`, totalLabel, section.total));
  return rows;
}

export function CashFlowReport({ startDate, endDate }: { startDate: string; endDate: string }) {
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(() => cashFlowApi.get({ startDate, endDate }), [startDate, endDate]);

  if (loading) return <LoadingBlock label={t('reports.cashFlow.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const none = t('reports.statement.noActivity');
  const rows: StatementRow[] = [
    ...rowsFor('op', data.operating, t('reports.cashFlow.operating'), t('reports.cashFlow.operatingTotal'), none),
    ...rowsFor('inv', data.investing, t('reports.cashFlow.investing'), t('reports.cashFlow.investingTotal'), none),
    ...rowsFor('fin', data.financing, t('reports.cashFlow.financing'), t('reports.cashFlow.financingTotal'), none),
    profitRow('net', t('reports.cashFlow.netChange'), data.netChange),
    totalRow('open', t('reports.cashFlow.opening'), data.openingCash),
    totalRow('close', t('reports.cashFlow.closing'), data.closingCash),
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        <Card>
          <div className="text-subtle small">{t('reports.cashFlow.opening')}</div>
          <strong>{formatCurrency(data.openingCash, currency)}</strong>
        </Card>
        <Card>
          <div className="text-subtle small">{t('reports.cashFlow.netChange')}</div>
          <strong className={data.netChange >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(data.netChange, currency)}</strong>
        </Card>
        <Card>
          <div className="text-subtle small">{t('reports.cashFlow.closing')}</div>
          <strong>{formatCurrency(data.closingCash, currency)}</strong>
        </Card>
      </div>
      <Card title={t('reports.cashFlow.cardTitle')} subtitle={t('reports.cashFlow.period', { from: formatDate(data.startDate), to: formatDate(data.endDate) })}>
        <StatementTable rows={rows} caption={t('reports.cashFlow.label')} currency={currency} />
      </Card>
    </div>
  );
}
