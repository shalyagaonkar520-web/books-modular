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
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(
    () => reportsApi.profitAndLoss({ start_date: startDate, end_date: endDate }),
    [startDate, endDate],
  );

  if (loading) return <LoadingBlock label="Preparing the profit and loss statement…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const sections = [data.income, data.costOfGoodsSold, data.operatingExpenses, data.otherIncome];
  if (!sections.some((section) => section.lines.length)) {
    return (
      <EmptyState
        title="No ledger activity in this period"
        description="Send an invoice, open a bill or record an expense and the profit and loss statement will fill in."
      />
    );
  }

  const rows: StatementRow[] = [
    ...sectionRows('income', data.income),
    ...sectionRows('cogs', data.costOfGoodsSold),
    profitRow('gross-profit', 'Gross profit', data.grossProfit),
    ...sectionRows('opex', data.operatingExpenses),
    profitRow('operating-profit', 'Operating profit', data.operatingProfit),
    ...sectionRows('other-income', data.otherIncome),
    profitRow('net-profit', 'Net profit', data.netProfit),
  ];

  const expenseSlices = [...data.operatingExpenses.lines, ...data.costOfGoodsSold.lines]
    .filter((line) => line.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((line) => ({ label: line.name, value: line.amount }));

  return (
    <div className="grid-2">
      <Card title="Profit and loss" subtitle={`${formatDate(startDate)} to ${formatDate(endDate)}`}>
        <StatementTable rows={rows} currency={currency} caption="Profit and loss statement" />
      </Card>
      <div className="stack">
        <Card title="Where the money went" subtitle="Largest expense accounts in this period">
          <DonutChart slices={expenseSlices} currency={currency} />
        </Card>
        <Card title="Summary">
          <div className="totals-list">
            <div>
              <span>Income</span>
              <span className="num">{formatCurrency(data.income.total, currency)}</span>
            </div>
            <div>
              <span>Cost of goods sold</span>
              <span className="num">{formatCurrency(data.costOfGoodsSold.total, currency)}</span>
            </div>
            <div>
              <span>Gross profit</span>
              <span className="num">{formatCurrency(data.grossProfit, currency)}</span>
            </div>
            <div>
              <span>Operating expenses</span>
              <span className="num">{formatCurrency(data.operatingExpenses.total, currency)}</span>
            </div>
            <div>
              <span>Other income</span>
              <span className="num">{formatCurrency(data.otherIncome.total, currency)}</span>
            </div>
            <div className="grand">
              <span>Net profit</span>
              <span className={data.netProfit < 0 ? 'num text-danger' : 'num text-success'}>{formatCurrency(data.netProfit, currency)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
