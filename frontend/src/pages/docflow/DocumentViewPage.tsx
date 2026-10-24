/** One quote, sales order, credit note, purchase order or vendor credit, with its actions. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRightLeft, Download, Pencil, Trash2 } from 'lucide-react';

import { creditApplicationsApi, docApi, type DocKindKey, refundsApi } from '@/api/docFlow';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDownload } from '@/hooks/useDownload';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatQuantity } from '@/utils/format';
import { paymentModeLabel } from '@/utils/status';

import { DOC_CONFIGS } from './config';
import { ApplyCreditModal, RefundModal } from './CreditModals';
import { flowStatusLabel, flowStatusTone } from './status';

type Pending = { action: 'delete' } | { action: 'status'; status: string } | { action: 'unapply'; id: string } | { action: 'unrefund'; id: string };

export function DocumentViewPage({ kind }: { kind: DocKindKey }) {
  const cfg = DOC_CONFIGS[kind];
  const api = docApi(kind);
  const { t } = useAppContent();
  const { docId = '' } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { canWrite } = useAuth();
  const { download } = useDownload();
  const { submitting, run, errorRef } = useSubmit();
  const doc = useAsync(() => api.get(docId), [docId, kind]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const k = (key: string) => `${cfg.texts}.${key}`;

  if (doc.loading && !doc.data) return <LoadingBlock label={t('common.loading')} />;
  if (doc.error || !doc.data) return <ErrorBlock message={doc.error ?? t('common.error.loadPage')} onRetry={doc.reload} />;
  const d = doc.data;
  const status = d.status;
  const used = (d.amountApplied ?? 0) > 0 || (d.amountRefunded ?? 0) > 0;

  const act = async (label: string, action: () => Promise<unknown>, after?: (result: unknown) => void) => {
    const result = await run(action);
    if (result === null) {
      toast.error(errorRef.current ?? t('common.error.generic'));
      return;
    }
    toast.success(label);
    if (after) after(result);
    else doc.reload();
  };

  const convert = (target: 'invoice' | 'bill' | 'sales-order', issue: boolean) =>
    act(t('docflow.view.converted'), () => api.convert(d.id, target, issue), (result) => {
      const r = result as { kind: string; id: string };
      navigate(r.kind === 'invoice' ? `/invoices/${r.id}` : r.kind === 'bill' ? `/bills` : `/sales-orders/${r.id}`);
    });

  const confirm = async () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.action === 'delete') await act(t('docflow.view.deleted'), () => api.remove(d.id), () => navigate(cfg.route));
    else if (p.action === 'status') await act(t('docflow.view.statusChanged', { status: flowStatusLabel(p.status, t) }), () => api.setStatus(d.id, p.status));
    else if (p.action === 'unapply') await act(t('docflow.view.unapplied'), () => creditApplicationsApi.remove(p.id));
    else await act(t('docflow.view.refundDeleted'), () => refundsApi.remove(p.id));
  };

  // Which buttons this document offers in its current status.
  const buttons: Array<{ key: string; label: string; onClick: () => void; variant?: 'primary' | 'secondary' | 'danger' }> = [];
  const status_ = (next: string, label: string, variant?: 'primary' | 'secondary' | 'danger') =>
    buttons.push({ key: `s-${next}`, label, variant, onClick: () => setPending({ action: 'status', status: next }) });
  if (canWrite) {
    if (kind === 'estimate') {
      if (status === 'draft') status_('sent', t('docflow.action.markSent'));
      if (['draft', 'sent', 'expired', 'declined'].includes(status)) status_('accepted', t('docflow.action.markAccepted'));
      if (['draft', 'sent', 'expired', 'accepted'].includes(status) && !d.salesOrderId) status_('declined', t('docflow.action.markDeclined'));
      if (!d.invoiceId && !d.salesOrderId && status !== 'declined') {
        buttons.push({ key: 'to-so', label: t('docflow.action.toSalesOrder'), onClick: () => convert('sales-order', false) });
        buttons.push({ key: 'to-inv', label: t('docflow.action.toInvoice'), variant: 'primary', onClick: () => convert('invoice', false) });
      }
    } else if (kind === 'sales_order') {
      if (status === 'draft') status_('confirmed', t('docflow.action.confirm'));
      if (['draft', 'confirmed'].includes(status)) {
        buttons.push({ key: 'to-inv', label: t('docflow.action.toInvoice'), variant: 'primary', onClick: () => convert('invoice', false) });
        status_('void', t('docflow.action.void'), 'danger');
      }
    } else if (kind === 'purchase_order') {
      if (status === 'draft') status_('issued', t('docflow.action.issue'));
      if (['draft', 'issued'].includes(status)) {
        buttons.push({ key: 'to-bill', label: t('docflow.action.toBill'), variant: 'primary', onClick: () => convert('bill', false) });
        status_('cancelled', t('docflow.action.cancel'), 'danger');
      }
    } else {
      if (status === 'draft') status_('open', t('docflow.action.open'), 'primary');
      if (status === 'open') {
        buttons.push({ key: 'apply', label: t(kind === 'credit_note' ? 'docflow.action.applyToInvoices' : 'docflow.action.applyToBills'), variant: 'primary', onClick: () => setApplyOpen(true) });
        buttons.push({ key: 'refund', label: t('docflow.action.refund'), onClick: () => setRefundOpen(true) });
      }
      if (['draft', 'open'].includes(status) && !used) status_('void', t('docflow.action.void'), 'danger');
    }
  }
  const canEdit = canWrite && cfg.editable.includes(status) && !used;
  const canDelete = canWrite && !used && !d.invoiceId && !d.billId && !(kind === 'estimate' && d.salesOrderId);

  const links: Array<{ label: string; to: string; text: string }> = [];
  if (d.estimateId) links.push({ label: t('docflow.view.fromQuote'), to: `/quotes/${d.estimateId}`, text: d.estimateNumber ?? '' });
  if (d.salesOrderId && kind === 'estimate') links.push({ label: t('docflow.view.salesOrder'), to: `/sales-orders/${d.salesOrderId}`, text: d.salesOrderNumber ?? '' });
  if (d.invoiceId) links.push({ label: cfg.isCredit ? t('docflow.form.againstInvoice') : t('docflow.view.invoice'), to: `/invoices/${d.invoiceId}`, text: d.invoiceNumber ?? '' });
  if (d.billId) links.push({ label: cfg.isCredit ? t('docflow.form.againstBill') : t('docflow.view.bill'), to: `/bills/${d.billId}/edit`, text: d.billNumber ?? '' });

  return (
    <>
      <PageHeader
        title={`${t(k('singular'))} ${d.number}`}
        subtitle={d.contactName}
        breadcrumb={[t(`sidebar.${cfg.group}`), t(k('title'))]}
        actions={
          <div className="row wrap">
            <Button icon={<Download size={15} />} onClick={() => download(() => api.downloadPdf(d.id, `${cfg.filePrefix}-${d.number}.pdf`))}>
              {t('docflow.action.pdf')}
            </Button>
            {canEdit ? (
              <Button icon={<Pencil size={15} />} onClick={() => navigate(`${cfg.route}/${d.id}/edit`)}>
                {t('docflow.action.edit')}
              </Button>
            ) : null}
            {buttons.map((b) => (
              <Button key={b.key} variant={b.variant ?? 'secondary'} disabled={submitting} icon={b.key.startsWith('to-') ? <ArrowRightLeft size={15} /> : undefined} onClick={b.onClick}>
                {b.label}
              </Button>
            ))}
            {canDelete ? (
              <Button variant="danger" icon={<Trash2 size={15} />} disabled={submitting} onClick={() => setPending({ action: 'delete' })}>
                {t('docflow.action.delete')}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="stack">
        <Card>
          <div className="grid-2">
            <div>
              <div className="text-subtle small">{t(`docflow.form.${cfg.party}`)}</div>
              <strong>{d.contactName}</strong>
              {d.contactBillingAddress ? <div className="small pre-line">{d.contactBillingAddress}</div> : null}
              {d.contactGstin ? <div className="small">GSTIN {d.contactGstin}</div> : null}
            </div>
            <dl className="detail-list">
              <dt>{t('docflow.col.status')}</dt>
              <dd>
                <Badge tone={flowStatusTone(status)}>{flowStatusLabel(status, t)}</Badge>
              </dd>
              <dt>{t('docflow.form.date')}</dt>
              <dd>{formatDate(d.date)}</dd>
              {cfg.secondDate && d[cfg.secondDate] ? (
                <>
                  <dt>{t(`docflow.form.${cfg.secondDate}`)}</dt>
                  <dd>{formatDate(d[cfg.secondDate])}</dd>
                </>
              ) : null}
              {d.reference ? (
                <>
                  <dt>{t('docflow.form.reference')}</dt>
                  <dd>{d.reference}</dd>
                </>
              ) : null}
              {d.reason ? (
                <>
                  <dt>{t('docflow.form.reason')}</dt>
                  <dd>{d.reason}</dd>
                </>
              ) : null}
              {links.map((link) => (
                <span key={link.to} style={{ display: 'contents' }}>
                  <dt>{link.label}</dt>
                  <dd>
                    <Link to={link.to}>{link.text}</Link>
                  </dd>
                </span>
              ))}
            </dl>
          </div>
          {d.subject ? <p className="form-section">{d.subject}</p> : null}
        </Card>

        <Card title={t('docflow.form.lines')}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('docflow.lines.description')}</th>
                  <th className="align-right">{t('docflow.lines.qty')}</th>
                  <th className="align-right">{t('docflow.lines.rate')}</th>
                  <th className="align-right">{t('docflow.lines.tax')}</th>
                  <th className="align-right">{t('docflow.lines.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.itemName && line.itemName !== line.description ? <strong className="block">{line.itemName}</strong> : null}
                      {line.description}
                    </td>
                    <td className="align-right">{formatQuantity(line.quantity)}</td>
                    <td className="align-right">{formatCurrency(line.rate)}</td>
                    <td className="align-right">{line.taxRate}%</td>
                    <td className="align-right">{formatCurrency(line.amount ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="totals-list form-section">
            <div>
              <span>{t('docflow.totals.subtotal')}</span>
              <span>{formatCurrency(d.subtotal)}</span>
            </div>
            {d.discountAmount ? (
              <div>
                <span>{t('docflow.totals.discount')}</span>
                <span>- {formatCurrency(d.discountAmount)}</span>
              </div>
            ) : null}
            <div>
              <span>{t('docflow.totals.tax')}</span>
              <span>{formatCurrency(d.taxTotal)}</span>
            </div>
            <div className="grand">
              <span>{t('docflow.totals.total')}</span>
              <span>{formatCurrency(d.total)}</span>
            </div>
            {cfg.isCredit ? (
              <>
                <div>
                  <span>{t('docflow.totals.applied')}</span>
                  <span>{formatCurrency(d.amountApplied ?? 0)}</span>
                </div>
                <div>
                  <span>{t('docflow.totals.refunded')}</span>
                  <span>{formatCurrency(d.amountRefunded ?? 0)}</span>
                </div>
                <div className="grand">
                  <span>{t('docflow.totals.remaining')}</span>
                  <span>{formatCurrency(d.balance ?? 0)}</span>
                </div>
              </>
            ) : null}
          </div>
        </Card>

        {cfg.isCredit && d.applications.length ? (
          <Card title={t('docflow.view.applications')}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('docflow.col.date')}</th>
                    <th>{t(kind === 'credit_note' ? 'docflow.col.invoice' : 'docflow.col.bill')}</th>
                    <th className="align-right">{t('docflow.apply.amount')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.applications.map((app) => (
                    <tr key={app.id}>
                      <td>{formatDate(app.date)}</td>
                      <td>{kind === 'credit_note' ? <Link to={`/invoices/${app.documentId}`}>{app.documentNumber}</Link> : app.documentNumber}</td>
                      <td className="align-right">{formatCurrency(app.amount)}</td>
                      <td className="align-right">
                        {canWrite ? (
                          <button type="button" className="action-btn is-danger" aria-label={t('docflow.view.unapply')} onClick={() => setPending({ action: 'unapply', id: app.id })}>
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {cfg.isCredit && d.refunds.length ? (
          <Card title={t('docflow.view.refunds')}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('docflow.col.number')}</th>
                    <th>{t('docflow.col.date')}</th>
                    <th>{t('docflow.refund.mode')}</th>
                    <th>{t('docflow.refund.account')}</th>
                    <th className="align-right">{t('docflow.refund.amount')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.refunds.map((r) => (
                    <tr key={r.id}>
                      <td>{r.refundNumber}</td>
                      <td>{formatDate(r.date)}</td>
                      <td>{paymentModeLabel(r.mode, t)}</td>
                      <td>{r.bankAccountName}</td>
                      <td className="align-right">{formatCurrency(r.amount)}</td>
                      <td className="align-right">
                        {canWrite ? (
                          <button type="button" className="action-btn is-danger" aria-label={t('docflow.view.deleteRefund')} onClick={() => setPending({ action: 'unrefund', id: r.id })}>
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {d.notes || d.terms ? (
          <Card title={t('docflow.form.notesSection')}>
            {d.notes ? <p className="pre-line">{d.notes}</p> : null}
            {d.terms ? (
              <>
                <h4>{t('docflow.form.terms')}</h4>
                <p className="pre-line">{d.terms}</p>
              </>
            ) : null}
          </Card>
        ) : null}
      </div>

      {cfg.isCredit ? (
        <>
          <ApplyCreditModal open={applyOpen} credit={d} onClose={() => setApplyOpen(false)} onSaved={doc.reload} />
          <RefundModal open={refundOpen} credit={d} onClose={() => setRefundOpen(false)} onSaved={doc.reload} />
        </>
      ) : null}
      <ConfirmDialog
        open={pending !== null}
        title={t('docflow.confirm.title')}
        message={
          pending?.action === 'delete'
            ? t('docflow.confirm.delete', { doc: t(k('singular')), number: d.number })
            : pending?.action === 'status'
              ? t('docflow.confirm.status', { doc: t(k('singular')), number: d.number, status: flowStatusLabel(pending.status, t) })
              : pending?.action === 'unapply'
                ? t('docflow.confirm.unapply')
                : t('docflow.confirm.unrefund')
        }
        tone={pending?.action === 'status' && !['void', 'cancelled', 'declined'].includes(pending.status) ? 'primary' : 'danger'}
        busy={submitting}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
