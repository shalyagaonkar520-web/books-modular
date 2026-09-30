import { useAppContent } from '@/app/AppContentContext';
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
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(
    () => reportsApi.taxSummary({ start_date: startDate, end_date: endDate }),
    [startDate, endDate],
  );

  if (loading) return <LoadingBlock label={t('reports.taxSummary.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  if (!data.outputGst && !data.inputGst && !data.taxableSales && !data.taxablePurchases) {
    return <EmptyState title={t('reports.taxSummary.empty.title')} description={t('reports.taxSummary.empty.body')} />;
  }

  const payable = data.netPayable;
  const netLabel = payable > 0 ? t('reports.taxSummary.netPayable') : payable < 0 ? t('reports.taxSummary.netCredit') : t('reports.taxSummary.net');

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile label={t('reports.taxSummary.stat.output')} value={formatCurrency(data.outputGst, currency)} sublabel={t('reports.taxSummary.stat.outputSub')} />
        <StatTile label={t('reports.taxSummary.stat.input')} value={formatCurrency(data.inputGst, currency)} sublabel={t('reports.taxSummary.stat.inputSub')} />
        <StatTile
          label={netLabel}
          value={formatCurrency(Math.abs(payable), currency)}
          tone={payable > 0 ? 'negative' : payable < 0 ? 'positive' : 'neutral'}
          sublabel={
            payable > 0
              ? t('reports.taxSummary.stat.owed')
              : payable < 0
                ? t('reports.taxSummary.stat.carriedForward')
                : t('reports.taxSummary.stat.nothingDue')
          }
        />
      </div>
      <Card title={t('reports.taxSummary.cardTitle')} subtitle={t('reports.dateRange', { start: formatDate(data.startDate), end: formatDate(data.endDate) })}>
        <dl className="detail-grid">
          <div className="detail-item">
            <dt className="detail-label">{t('reports.taxSummary.detail.taxableSales')}</dt>
            <dd className="detail-value num">{formatCurrency(data.taxableSales, currency)}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{t('reports.taxSummary.detail.outputGst')}</dt>
            <dd className="detail-value num">{formatCurrency(data.outputGst, currency)}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{t('reports.taxSummary.detail.taxablePurchases')}</dt>
            <dd className="detail-value num">{formatCurrency(data.taxablePurchases, currency)}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{t('reports.taxSummary.detail.inputGst')}</dt>
            <dd className="detail-value num">{formatCurrency(data.inputGst, currency)}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{netLabel}</dt>
            <dd className={`detail-value num strong ${payable > 0 ? 'text-danger' : payable < 0 ? 'text-success' : ''}`.trim()}>
              {formatCurrency(Math.abs(payable), currency)}
            </dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{t('reports.taxSummary.detail.gstin')}</dt>
            <dd className="detail-value">
              {organization?.gstin ? <span className="mono">{organization.gstin}</span> : <span className="text-muted">{t('reports.taxSummary.detail.notSet')}</span>}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
