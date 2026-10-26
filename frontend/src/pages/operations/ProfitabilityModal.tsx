/** Project profitability: revenue invoiced against the project less bills, expenses and time at cost. */
import { profitabilityApi } from '@/api/operations';
import type { Project } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, formatNumber } from '@/utils/format';

export function ProfitabilityModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useAppContent();
  const data = useAsync(() => profitabilityApi.get(project.id), [project.id]);
  const p = data.data;
  return (
    <Modal open size="lg" title={t('ops.profit.title', { name: project.name })} subtitle={t('ops.profit.subtitle')} onClose={onClose}>
      {data.loading ? <LoadingBlock /> : null}
      {data.error ? <ErrorBlock message={data.error} onRetry={data.reload} /> : null}
      {p ? (
        <div className="stack">
          <div className="stat-grid">
            <div className="card">
              <div className="text-subtle small">{t('ops.profit.revenue')}</div>
              <strong>{formatCurrency(p.revenue)}</strong>
              <div className="small text-subtle">{t('ops.profit.invoices', { count: p.invoiceCount })}</div>
            </div>
            <div className="card">
              <div className="text-subtle small">{t('ops.profit.cost')}</div>
              <strong>{formatCurrency(p.totalCost)}</strong>
            </div>
            <div className="card">
              <div className="text-subtle small">{t('ops.profit.profit')}</div>
              <strong className={p.profit < 0 ? 'text-danger' : 'text-success'}>{formatCurrency(p.profit)}</strong>
              {p.marginPercent !== null && p.marginPercent !== undefined ? <div className="small">{t('ops.profit.margin', { percent: formatNumber(p.marginPercent) })}</div> : null}
            </div>
          </div>
          <div className="totals-list" style={{ maxWidth: 420 }}>
            <div>
              <span>{t('ops.profit.bills')}</span>
              <span>{formatCurrency(p.billCosts)}</span>
            </div>
            <div>
              <span>{t('ops.profit.expenses')}</span>
              <span>{formatCurrency(p.expenseCosts)}</span>
            </div>
            <div>
              <span>{t('ops.profit.labour', { hours: formatNumber(p.labourHours) })}</span>
              <span>{formatCurrency(p.labourCost)}</span>
            </div>
            <div>
              <span>{t('ops.profit.unbilled')}</span>
              <span>{formatCurrency(p.unbilledAmount)}</span>
            </div>
          </div>
          {p.labourHours > 0 && !project.costRate ? <p className="small text-subtle">{t('ops.profit.noCostRate')}</p> : null}
          {p.costs.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('ops.profit.col.date')}</th>
                  <th>{t('ops.profit.col.document')}</th>
                  <th>{t('ops.profit.col.description')}</th>
                  <th className="align-right">{t('ops.profit.col.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {p.costs.map((c) => (
                  <tr key={`${c.kind}-${c.id}`}>
                    <td>{formatDate(c.date)}</td>
                    <td>{c.number}</td>
                    <td>{c.description}</td>
                    <td className="align-right">{formatCurrency(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="small text-subtle">{t('ops.profit.noCosts')}</p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
