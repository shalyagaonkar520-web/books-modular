import { useAppContent } from '@/app/AppContentContext';
import { Card } from '@/components/ui/Card';
import { DonutChart } from '@/components/ui/Charts';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate } from '@/utils/format';

import { StatementTable, profitRow, sectionRows, type StatementRow } from './StatementTable';

interface ProfitAndLossReportProps {
  startDate: string;
  endDate: string;
}

export function ProfitAndLossReport({ startDate, endDate }: ProfitAndLossReportProps) {
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(
    () => reportsApi.profitAndLoss({ start_date: startDate, end_date: endDate }),
    [startDate, endDate],
  );

  if (loading) return <LoadingBlock label={t('reports.profitAndLoss.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const sections = [data.income, data.costOfGoodsSold, data.operatingExpenses, data.otherIncome];
  if (!sections.some((section) => section.lines.length)) {
    return <EmptyState title={t('reports.profitAndLoss.empty.title')} description={t('reports.profitAndLoss.empty.body')} />;
  }

  const rows: StatementRow[] = [
    ...sectionRows('income', data.income, t),
    ...sectionRows('cogs', data.costOfGoodsSold, t),
    profitRow('gross-profit', t('reports.profitAndLoss.row.grossProfit'), data.grossProfit),
    ...sectionRows('opex', data.operatingExpenses, t),
    profitRow('operating-profit', t('reports.profitAndLoss.row.operatingProfit'), data.operatingProfit),
    ...sectionRows('other-income', data.otherIncome, t),
    profitRow('net-profit', t('reports.profitAndLoss.row.netProfit'), data.netProfit),
  ];

  const expenseSlices = [...data.operatingExpenses.lines, ...data.costOfGoodsSold.lines]
    .filter((line) => line.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((line) => ({ label: line.name, value: line.amount }));

  return (
    <div className="grid-2">
      <Card title={t('reports.profitAndLoss.cardTitle')} subtitle={t('reports.dateRange', { start: formatDate(startDate), end: formatDate(endDate) })}>
        <StatementTable rows={rows} currency={currency} caption={t('reports.profitAndLoss.tableCaption')} />
      </Card>
      <div className="stack">
        <Card title={t('reports.profitAndLoss.spendTitle')} subtitle={t('reports.profitAndLoss.spendSubtitle')}>
          <DonutChart slices={expenseSlices} currency={currency} />
        </Card>
        <Card title={t('reports.profitAndLoss.summaryTitle')}>
          <div className="totals-list">
            <div>
              <span>{t('reports.profitAndLoss.summary.income')}</span>
              <span className="num">{formatCurrency(data.income.total, currency)}</span>
            </div>
            <div>
              <span>{t('reports.profitAndLoss.summary.cogs')}</span>
              <span className="num">{formatCurrency(data.costOfGoodsSold.total, currency)}</span>
            </div>
            <div>
              <span>{t('reports.profitAndLoss.summary.grossProfit')}</span>
              <span className="num">{formatCurrency(data.grossProfit, currency)}</span>
            </div>
            <div>
              <span>{t('reports.profitAndLoss.summary.operatingExpenses')}</span>
              <span className="num">{formatCurrency(data.operatingExpenses.total, currency)}</span>
            </div>
            <div>
              <span>{t('reports.profitAndLoss.summary.otherIncome')}</span>
              <span className="num">{formatCurrency(data.otherIncome.total, currency)}</span>
            </div>
            <div className="grand">
              <span>{t('reports.profitAndLoss.summary.netProfit')}</span>
              <span className={data.netProfit < 0 ? 'num text-danger' : 'num text-success'}>{formatCurrency(data.netProfit, currency)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
