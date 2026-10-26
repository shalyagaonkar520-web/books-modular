/** On an invoice: credit notes and advances used against it, and applying more. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, Trash2, WalletCards } from 'lucide-react';

import { advancesApi, creditApplicationsApi, docApi } from '@/api/docFlow';
import type { Invoice } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, parseNumber, round2 } from '@/utils/format';

export function InvoiceCreditsCard({ invoice, onChanged }: { invoice: Invoice; onChanged: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const { submitting, run, errorRef } = useSubmit();
  const [applyOpen, setApplyOpen] = useState(false);
  const apps = useAsync(() => creditApplicationsApi.list({ invoiceId: invoice.id }), [invoice.id, invoice.amountPaid]);
  const issued = invoice.status !== 'draft' && invoice.status !== 'void';
  const canApply = canWrite && issued && invoice.balanceDue > 0;

  const remove = async (id: string) => {
    const ok = await run(() => creditApplicationsApi.remove(id));
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t('docflow.view.unapplied'));
      apps.reload();
      onChanged();
    }
  };

  if (!issued && !apps.data?.length) return null;
  return (
    <Card
      title={t('docflow.invoiceCredits.title')}
      subtitle={t('docflow.invoiceCredits.subtitle')}
      footer={
        canWrite && issued ? (
          <div className="row wrap">
            {canApply ? (
              <Button icon={<WalletCards size={15} />} onClick={() => setApplyOpen(true)}>
                {t('docflow.invoiceCredits.apply')}
              </Button>
            ) : null}
            <Button icon={<FilePlus2 size={15} />} onClick={() => navigate(`/credit-notes/new?invoiceId=${invoice.id}`)}>
              {t('docflow.invoiceCredits.createCreditNote')}
            </Button>
          </div>
        ) : undefined
      }
    >
      {apps.loading && !apps.data ? (
        <LoadingBlock />
      ) : !apps.data?.length ? (
        <p className="text-subtle small">{t('docflow.invoiceCredits.none')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('docflow.col.date')}</th>
                <th>{t('docflow.invoiceCredits.source')}</th>
                <th className="align-right">{t('docflow.apply.amount')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {apps.data.map((app) => (
                <tr key={app.id}>
                  <td>{formatDate(app.date)}</td>
                  <td>{app.creditId ? <Link to={`/credit-notes/${app.creditId}`}>{app.creditNumber}</Link> : t('docflow.invoiceCredits.advance')}</td>
                  <td className="align-right">{formatCurrency(app.amount)}</td>
                  <td className="align-right">
                    {canWrite ? (
                      <button type="button" className="action-btn is-danger" disabled={submitting} aria-label={t('docflow.view.unapply')} onClick={() => remove(app.id)}>
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {applyOpen ? (
        <ApplyToInvoiceModal
          invoice={invoice}
          onClose={() => setApplyOpen(false)}
          onPartial={() => {
            apps.reload();
            onChanged();
          }}
          onSaved={() => {
            setApplyOpen(false);
            apps.reload();
            onChanged();
          }}
        />
      ) : null}
    </Card>
  );
}

/** Pick open credit notes of the customer (and the unused advance) to settle this invoice. */
function ApplyToInvoiceModal({ invoice, onClose, onSaved, onPartial }: { invoice: Invoice; onClose: () => void; onSaved: () => void; onPartial: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, run, setError } = useSubmit();
  const credits = useAsync(() => docApi('credit_note').list({ contactId: invoice.customerId, status: 'open', page_size: 100 }), [invoice.customerId]);
  const advance = useAsync(() => advancesApi.balance('customer', invoice.customerId), [invoice.customerId]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const total = round2(Object.values(amounts).reduce((sum, v) => sum + parseNumber(v), 0));

  const submit = async () => {
    if (total <= 0) {
      setError(t('docflow.apply.nothing'));
      return;
    }
    if (total > invoice.balanceDue) {
      setError(t('docflow.apply.overInvoice', { amount: formatCurrency(invoice.balanceDue) }));
      return;
    }
    // Sources are applied one by one: remember which went through so a failure part-way
    // never leaves an already-applied amount in the form to be applied twice on retry.
    const applied: string[] = [];
    const ok = await run(async () => {
      for (const [key, value] of Object.entries(amounts)) {
        const amount = round2(parseNumber(value));
        if (amount <= 0) continue;
        if (key === 'advance') {
          await advancesApi.apply({ partyType: 'customer', contactId: invoice.customerId, documentId: invoice.id, amount });
        } else {
          await docApi('credit_note').apply(key, [{ documentId: invoice.id, amount }]);
        }
        applied.push(key);
      }
      return true;
    });
    if (!ok && applied.length) {
      setAmounts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !applied.includes(key))));
      credits.reload();
      advance.reload();
      onPartial();
    }
    if (ok) {
      toast.success(t('docflow.apply.done', { amount: formatCurrency(total) }));
      onSaved();
    }
  };

  const rows = [
    ...(advance.data && advance.data.balance > 0 ? [{ key: 'advance', label: t('docflow.invoiceCredits.advance'), available: advance.data.balance }] : []),
    ...(credits.data?.items ?? []).map((cn) => ({ key: cn.id, label: cn.number, available: cn.balance ?? 0 })),
  ];

  return (
    <Modal
      open
      title={t('docflow.invoiceCredits.applyTitle', { number: invoice.invoiceNumber })}
      subtitle={t('docflow.invoiceCredits.applySubtitle', { amount: formatCurrency(invoice.balanceDue) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} disabled={!rows.length} onClick={submit}>
            {t('docflow.apply.submit', { amount: formatCurrency(total) })}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      {credits.loading || advance.loading ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <p className="text-subtle">{t('docflow.invoiceCredits.nothingAvailable')}</p>
      ) : (
        rows.map((row) => (
          <TextField
            key={row.key}
            label={`${row.label} · ${t('docflow.invoiceCredits.available', { amount: formatCurrency(row.available) })}`}
            type="number"
            min="0"
            step="0.01"
            max={row.available}
            prefix="₹"
            value={amounts[row.key] ?? ''}
            onChange={(e) => setAmounts((current) => ({ ...current, [row.key]: e.target.value }))}
          />
        ))
      )}
    </Modal>
  );
}

