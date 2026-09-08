import { Card, StatTile } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate } from '@/utils/format';

interface TaxSummaryReportProps {
  startDate: string;
  endDate: string;
}

export function TaxSummaryReport({ startDate, endDate }: TaxSummaryReportProps) {
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(
    () => reportsApi.taxSummary({ start_date: startDate, end_date: endDate }),
    [startDate, endDate],
  );

  if (loading) return <LoadingBlock label="Adding up GST…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  if (!data.outputGst && !data.inputGst && !data.taxableSales && !data.taxablePurchases) {
    return (
      <EmptyState
        title="No taxable activity in this period"
        description="Send an invoice, open a bill or record an expense with GST to see the tax position."
      />
    );
  }

  const payable = data.netPayable;
  const netLabel = payable > 0 ? 'Net GST payable' : payable < 0 ? 'Net GST credit' : 'Net GST';

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile label="Output GST (on sales)" value={formatCurrency(data.outputGst, currency)} sublabel="Collected from customers" />
        <StatTile label="Input GST (on purchases)" value={formatCurrency(data.inputGst, currency)} sublabel="Paid on bills and expenses" />
        <StatTile
          label={netLabel}
          value={formatCurrency(Math.abs(payable), currency)}
          tone={payable > 0 ? 'negative' : payable < 0 ? 'positive' : 'neutral'}
          sublabel={payable > 0 ? 'Owed to the tax authority' : payable < 0 ? 'Input credit carried forward' : 'Nothing due for this period'}
        />
      </div>
      <Card title="Tax summary (GST)" subtitle={`${formatDate(data.startDate)} to ${formatDate(data.endDate)}`}>
        <dl className="detail-grid">
          <div className="detail-item">
            <dt className="detail-label">Taxable sales</dt>
            <dd className="detail-value num">{formatCurrency(data.taxableSales, currency)}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Output GST</dt>
            <dd className="detail-value num">{formatCurrency(data.outputGst, currency)}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Taxable purchases</dt>
            <dd className="detail-value num">{formatCurrency(data.taxablePurchases, currency)}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Input GST</dt>
            <dd className="detail-value num">{formatCurrency(data.inputGst, currency)}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{netLabel}</dt>
            <dd className={`detail-value num strong ${payable > 0 ? 'text-danger' : payable < 0 ? 'text-success' : ''}`.trim()}>
              {formatCurrency(Math.abs(payable), currency)}
            </dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">GSTIN</dt>
            <dd className="detail-value">{organization?.gstin ? <span className="mono">{organization.gstin}</span> : <span className="text-muted">Not set</span>}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
