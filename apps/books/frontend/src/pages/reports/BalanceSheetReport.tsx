import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { Card, StatTile } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate } from '@/utils/format';

import { StatementTable, profitRow, sectionRows, totalRow, type StatementRow } from './StatementTable';

interface BalanceSheetReportProps {
  asOf: string;
}

export function BalanceSheetReport({ asOf }: BalanceSheetReportProps) {
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(() => reportsApi.balanceSheet({ as_of: asOf }), [asOf]);

  if (loading) return <LoadingBlock label={t('reports.balanceSheet.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const sections = [data.assets, data.liabilities, data.equity];
  if (!sections.some((section) => section.lines.length)) {
    return <EmptyState title={t('reports.balanceSheet.empty.title')} description={t('reports.balanceSheet.empty.body')} />;
  }

  const difference = data.assets.total - data.totalLiabilitiesAndEquity;
  const rows: StatementRow[] = [
    ...sectionRows('assets', data.assets, t),
    ...sectionRows('liabilities', data.liabilities, t),
    ...sectionRows('equity', data.equity, t),
    profitRow('current-earnings', t('reports.balanceSheet.row.currentEarnings'), data.currentPeriodEarnings),
    totalRow('total-le', t('reports.balanceSheet.row.totalLiabilitiesAndEquity'), data.totalLiabilitiesAndEquity),
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile
          label={t('reports.balanceSheet.stat.totalAssets')}
          value={formatCurrency(data.assets.total, currency)}
          sublabel={t('reports.balanceSheet.asOf', { date: formatDate(data.asOf) })}
        />
        <StatTile label={t('reports.balanceSheet.stat.totalLiabilities')} value={formatCurrency(data.liabilities.total, currency)} />
        <StatTile
          label={t('reports.balanceSheet.stat.equity')}
          value={formatCurrency(data.equity.total, currency)}
          sublabel={t('reports.balanceSheet.stat.equityIncludes', { amount: formatCurrency(data.currentPeriodEarnings, currency) })}
        />
        <StatTile
          label={t('reports.balanceSheet.stat.difference')}
          value={formatCurrency(difference, currency)}
          tone={data.isBalanced ? 'positive' : 'negative'}
          sublabel={data.isBalanced ? t('reports.balanceSheet.stat.booksBalance') : t('reports.balanceSheet.stat.reviewLedger')}
        />
      </div>
      <Card
        title={t('reports.balanceSheet.cardTitle')}
        subtitle={t('reports.balanceSheet.asOf', { date: formatDate(data.asOf) })}
        actions={
          <Badge tone={data.isBalanced ? 'success' : 'danger'}>
            {data.isBalanced ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
            {` ${data.isBalanced ? t('reports.balanceSheet.balanced') : t('reports.balanceSheet.outOfBalance')}`}
          </Badge>
        }
      >
        <StatementTable rows={rows} currency={currency} caption={t('reports.balanceSheet.tableCaption')} />
      </Card>
    </div>
  );
}
