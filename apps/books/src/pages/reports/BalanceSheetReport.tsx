import { AlertTriangle, CheckCircle2 } from 'lucide-react';

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
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(() => reportsApi.balanceSheet({ as_of: asOf }), [asOf]);

  if (loading) return <LoadingBlock label="Preparing the balance sheet…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const sections = [data.assets, data.liabilities, data.equity];
  if (!sections.some((section) => section.lines.length)) {
    return (
      <EmptyState
        title="Nothing on the balance sheet yet"
        description="Once transactions are posted to the ledger, assets, liabilities and equity will appear here."
      />
    );
  }

  const difference = data.assets.total - data.totalLiabilitiesAndEquity;
  const rows: StatementRow[] = [
    ...sectionRows('assets', data.assets),
    ...sectionRows('liabilities', data.liabilities),
    ...sectionRows('equity', data.equity),
    profitRow('current-earnings', 'Current period earnings', data.currentPeriodEarnings),
    totalRow('total-le', 'Total liabilities and equity', data.totalLiabilitiesAndEquity),
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile label="Total assets" value={formatCurrency(data.assets.total, currency)} sublabel={`As of ${formatDate(data.asOf)}`} />
        <StatTile label="Total liabilities" value={formatCurrency(data.liabilities.total, currency)} />
        <StatTile
          label="Equity"
          value={formatCurrency(data.equity.total, currency)}
          sublabel={`Includes ${formatCurrency(data.currentPeriodEarnings, currency)} current period earnings`}
        />
        <StatTile
          label="Assets − liabilities & equity"
          value={formatCurrency(difference, currency)}
          tone={data.isBalanced ? 'positive' : 'negative'}
          sublabel={data.isBalanced ? 'The books balance' : 'Review the ledger for unbalanced entries'}
        />
      </div>
      <Card
        title="Balance sheet"
        subtitle={`As of ${formatDate(data.asOf)}`}
        actions={
          <Badge tone={data.isBalanced ? 'success' : 'danger'}>
            {data.isBalanced ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
            {data.isBalanced ? ' Balanced' : ' Out of balance'}
          </Badge>
        }
      >
        <StatementTable rows={rows} currency={currency} caption="Balance sheet" />
      </Card>
    </div>
  );
}
