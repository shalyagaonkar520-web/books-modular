/** What a customer sees when they open a shared invoice or quote link (no login). */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download, XCircle } from 'lucide-react';

import { type PortalDocument, portalApi } from '@/api/automation';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, formatQuantity } from '@/utils/format';

export function DocumentPortalPage() {
  const { t } = useAppContent();
  const { token = '' } = useParams<{ token: string }>();
  const doc = useAsync(() => portalApi.get(token), [token]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (doc.loading) return <LoadingBlock />;
  if (doc.error || !doc.data) return <div className="portal-shell"><ErrorBlock message={doc.error ?? t('portal.doc.invalid')} /></div>;
  const d: PortalDocument = doc.data;
  const money = (v: number) => formatCurrency(v, d.currency);
  const accent = d.brandColor ?? 'var(--primary)';

  const respond = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await portalApi.respond(token, accept, { name: name.trim() || undefined, note: note.trim() || undefined });
      setAnswer(res.message);
      doc.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-shell">
      <div className="portal-card" style={{ borderTopColor: accent }}>
        <header className="row-between">
          <div>
            {d.logoUrl ? <img src={d.logoUrl} alt="" className="portal-logo" /> : null}
            <h1 style={{ margin: 0 }}>{d.organizationName}</h1>
            {d.organizationGstin ? <div className="small text-subtle">GSTIN {d.organizationGstin}</div> : null}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="small text-subtle">{t(d.kind === 'invoice' ? 'portal.doc.invoice' : 'portal.doc.quote')}</div>
            <strong style={{ fontSize: '1.3rem', color: accent }}>{d.number}</strong>
            <div className="small">{t(`common.status.${d.status}`)}</div>
          </div>
        </header>

        <div className="grid-2 form-section">
          <div>
            <div className="small text-subtle">{t('portal.doc.billedTo')}</div>
            <strong>{d.customerName}</strong>
          </div>
          <dl className="detail-list">
            <dt>{t('portal.doc.date')}</dt>
            <dd>{formatDate(d.date)}</dd>
            {d.dueDate ? (
              <>
                <dt>{t('portal.doc.due')}</dt>
                <dd>{formatDate(d.dueDate)}</dd>
              </>
            ) : null}
            {d.expiryDate ? (
              <>
                <dt>{t('portal.doc.validUntil')}</dt>
                <dd>{formatDate(d.expiryDate)}</dd>
              </>
            ) : null}
          </dl>
        </div>

        <div className="table-wrap form-section">
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
              {d.lines.map((line, i) => (
                <tr key={i}>
                  <td>{line.description}</td>
                  <td className="align-right">{formatQuantity(line.quantity)}</td>
                  <td className="align-right">{money(line.rate)}</td>
                  <td className="align-right">{line.taxRate}%</td>
                  <td className="align-right">{money(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="totals-list form-section" style={{ maxWidth: 360, marginLeft: 'auto' }}>
          <div>
            <span>{t('docflow.totals.subtotal')}</span>
            <span>{money(d.subtotal)}</span>
          </div>
          {d.discount ? (
            <div>
              <span>{t('docflow.totals.discount')}</span>
              <span>- {money(d.discount)}</span>
            </div>
          ) : null}
          <div>
            <span>{t('docflow.totals.tax')}</span>
            <span>{money(d.taxTotal)}</span>
          </div>
          <div className="grand">
            <span>{t('docflow.totals.total')}</span>
            <span>{money(d.total)}</span>
          </div>
          {d.kind === 'invoice' ? (
            <>
              <div>
                <span>{t('portal.doc.paid')}</span>
                <span>{money(d.amountPaid)}</span>
              </div>
              <div className="grand">
                <span>{t('portal.doc.balance')}</span>
                <span style={{ color: accent }}>{money(d.balanceDue)}</span>
              </div>
            </>
          ) : null}
        </div>

        {d.notes ? <p className="pre-line small form-section">{d.notes}</p> : null}
        {d.terms ? (
          <div className="form-section small">
            <strong>{t('docflow.form.terms')}</strong>
            <p className="pre-line">{d.terms}</p>
          </div>
        ) : null}

        <div className="row wrap form-section">
          <a className="btn btn-secondary btn-md" href={portalApi.pdfUrl(token)}>
            <Download size={15} aria-hidden="true" /> <span>{t('portal.doc.download')}</span>
          </a>
        </div>

        {d.kind === 'estimate' && d.canRespond && !answer ? (
          <div className="form-section">
            <h3>{t('portal.doc.respondTitle')}</h3>
            <div className="form-grid">
              <TextField label={t('portal.doc.yourName')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              <TextField label={t('portal.doc.note')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </div>
            {error ? <div className="alert alert-warning">{error}</div> : null}
            <div className="row">
              <Button variant="primary" icon={<CheckCircle2 size={15} />} loading={busy} onClick={() => respond(true)}>
                {t('portal.doc.accept')}
              </Button>
              <Button variant="danger" icon={<XCircle size={15} />} disabled={busy} onClick={() => respond(false)}>
                {t('portal.doc.decline')}
              </Button>
            </div>
          </div>
        ) : null}
        {answer ? <div className="alert alert-warning form-section">{answer}</div> : null}
      </div>
      <p className="small text-subtle" style={{ textAlign: 'center' }}>{t('portal.doc.poweredBy')}</p>
    </div>
  );
}
