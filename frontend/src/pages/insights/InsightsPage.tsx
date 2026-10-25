/** Insights: alerts worth a second look, customer credit risk, and the daily digest. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Sparkles } from 'lucide-react';

import { type Alert, insightsApi } from '@/api/insights';
import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate } from '@/utils/format';

type Tab = 'alerts' | 'credit' | 'digest';

const SEVERITY_TONE: Record<Alert['severity'], 'danger' | 'warning' | 'neutral'> = { high: 'danger', medium: 'warning', low: 'neutral' };
const GRADE_TONE = { A: 'success', B: 'info', C: 'warning', D: 'danger' } as const;

function docLink(alert: Alert): string | null {
  if (!alert.docId) return null;
  if (alert.docType === 'bill') return `/bills/${alert.docId}/edit`;
  if (alert.docType === 'invoice') return `/invoices/${alert.docId}`;
  if (alert.docType === 'expense') return '/expenses';
  if (alert.docType === 'bank_account') return '/banking';
  return null;
}

export function InsightsPage() {
  const { t } = useAppContent();
  const [tab, setTab] = useState<Tab>('alerts');
  return (
    <div className="stack">
      <PageHeader title={t('insights.title')} subtitle={t('insights.subtitle')} />
      <Tabs tabs={(['alerts', 'credit', 'digest'] as Tab[]).map((id) => ({ id, label: t(`insights.tab.${id}`) }))} active={tab} onChange={(id) => setTab(id as Tab)} />
      {tab === 'alerts' ? <AlertsTab /> : null}
      {tab === 'credit' ? <CreditTab /> : null}
      {tab === 'digest' ? <DigestTab /> : null}
    </div>
  );
}

function AlertsTab() {
  const { t } = useAppContent();
  const data = useAsync(() => insightsApi.anomalies(), []);
  if (data.loading) return <LoadingBlock />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={data.reload} />;
  if (!data.data?.length) return <EmptyState title={t('insights.alerts.none')} description={t('insights.alerts.noneHint')} />;
  return (
    <div className="stack">
      {data.data.map((a, i) => {
        const to = docLink(a);
        return (
          <Card key={`${a.kind}-${a.docId ?? i}`}>
            <div className="row-between wrap">
              <div className="cell-stack">
                <span className="strong">
                  <AlertTriangle size={14} aria-hidden="true" /> {a.title}
                </span>
                <span className="small">{a.detail}</span>
              </div>
              <div className="row">
                <Badge tone={SEVERITY_TONE[a.severity]}>{t(`insights.severity.${a.severity}`)}</Badge>
                {to ? (
                  <Link className="btn btn-secondary btn-sm" to={to}>
                    {t('insights.alerts.open')}
                  </Link>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CreditTab() {
  const { t } = useAppContent();
  const data = useAsync(() => insightsApi.creditRisk(), []);
  if (data.loading) return <LoadingBlock />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={data.reload} />;
  if (!data.data?.length) return <EmptyState title={t('insights.credit.none')} description={t('insights.credit.noneHint')} />;
  return (
    <Card title={t('insights.credit.title')} subtitle={t('insights.credit.subtitle')}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('insights.credit.customer')}</th>
              <th className="align-right">{t('insights.credit.score')}</th>
              <th className="align-right">{t('insights.credit.outstanding')}</th>
              <th className="align-right">{t('insights.credit.overdue')}</th>
              <th className="align-right">{t('insights.credit.onTime')}</th>
              <th>{t('insights.credit.advice')}</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((r) => (
              <tr key={r.customerId}>
                <td>
                  <div className="cell-stack">
                    <span className="strong">{r.customerName}</span>
                    <small className="text-subtle">{r.reasons.join(' · ')}</small>
                  </div>
                </td>
                <td className="align-right">
                  <Badge tone={GRADE_TONE[r.grade]}>
                    {r.grade} · {r.score}
                  </Badge>
                </td>
                <td className="align-right">{formatCurrency(r.outstanding)}</td>
                <td className={`align-right ${r.overdue > 0 ? 'text-danger' : ''}`}>{formatCurrency(r.overdue)}</td>
                <td className="align-right">{r.onTimePercent !== null && r.onTimePercent !== undefined ? `${Math.round(r.onTimePercent)}%` : '—'}</td>
                <td className="small">{r.advice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DigestTab() {
  const { t } = useAppContent();
  const [withAi, setWithAi] = useState(false);
  const data = useAsync(() => insightsApi.digest(withAi), [withAi]);
  return (
    <Card
      title={data.data ? t('insights.digest.title', { date: formatDate(data.data.date) }) : t('insights.tab.digest')}
      subtitle={t('insights.digest.subtitle')}
      actions={
        <div className="row">
          <Button size="sm" icon={<Sparkles size={13} />} disabled={withAi} onClick={() => setWithAi(true)}>
            {t('insights.digest.ai')}
          </Button>
          <Link className="btn btn-secondary btn-sm" to="/automation">
            <CalendarClock size={13} aria-hidden="true" /> {t('insights.digest.schedule')}
          </Link>
        </div>
      }
    >
      {data.loading ? <LoadingBlock /> : null}
      {data.error ? <ErrorBlock message={data.error} onRetry={data.reload} /> : null}
      {data.data ? (
        <>
          {data.data.headline ? <div className="alert alert-info">{data.data.headline}</div> : null}
          <ul className="plain-list">
            {data.data.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
