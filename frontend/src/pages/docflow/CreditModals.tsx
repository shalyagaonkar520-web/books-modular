/** Dialogs for using credits: apply them to invoices / bills, and record refunds. */
import { useEffect, useMemo, useState } from 'react';

import { advancesApi, docApi, type FlowDocument, type RefundInput } from '@/api/docFlow';
import { bankingApi, billsApi, invoicesApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, parseNumber, round2, todayIso } from '@/utils/format';
import { PAYMENT_MODES, paymentModeLabel } from '@/utils/status';

interface OpenDoc {
  id: string;
  number: string;
  date: string;
  balanceDue: number;
}

/** Open invoices of a customer, or open bills of a vendor. */
async function openDocuments(party: 'customer' | 'vendor', contactId: string): Promise<OpenDoc[]> {
  if (party === 'customer') {
    const page = await invoicesApi.list({ customer_id: contactId, status: 'unpaid', page_size: 100 });
    return page.items.map((inv) => ({ id: inv.id, number: inv.invoiceNumber, date: inv.date, balanceDue: inv.balanceDue }));
  }
  const page = await billsApi.list({ vendor_id: contactId, page_size: 100 });
  return page.items
    .filter((bill) => ['open', 'partially_paid', 'overdue'].includes(bill.status))
    .map((bill) => ({ id: bill.id, number: bill.billNumber, date: bill.date, balanceDue: bill.balanceDue }));
}

interface ApplyProps {
  open: boolean;
  credit: FlowDocument;
  onClose: () => void;
  onSaved: () => void;
}

/** Spread a credit note's (vendor credit's) balance over the contact's open invoices (bills). */
export function ApplyCreditModal({ open, credit, onClose, onSaved }: ApplyProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const party = credit.kind === 'credit_note' ? 'customer' : 'vendor';
  const { submitting, error, run, setError, reset } = useSubmit();
  const docs = useAsync(async () => (open ? openDocuments(party, credit.contactId) : []), [open, credit.contactId, party]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(todayIso());
  const available = credit.balance ?? 0;

  // Fill oldest first, the way a payment is applied, as a starting point.
  useEffect(() => {
    if (!open || !docs.data) return;
    reset();
    let left = available;
    const next: Record<string, string> = {};
    for (const doc of [...docs.data].sort((a, b) => a.date.localeCompare(b.date))) {
      const take = round2(Math.min(left, doc.balanceDue));
      next[doc.id] = take > 0 ? String(take) : '';
      left = round2(left - take);
    }
    setAmounts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docs.data, available]);

  const total = round2(Object.values(amounts).reduce((sum, value) => sum + parseNumber(value), 0));

  const submit = async () => {
    const applications = Object.entries(amounts)
      .map(([documentId, value]) => ({ documentId, amount: round2(parseNumber(value)) }))
      .filter((entry) => entry.amount > 0);
    if (!applications.length) {
      setError(t('docflow.apply.nothing'));
      return;
    }
    if (total > available) {
      setError(t('docflow.apply.tooMuch', { amount: formatCurrency(available) }));
      return;
    }
    const saved = await run(() => docApi(credit.kind).apply(credit.id, applications, date));
    if (saved) {
      toast.success(t('docflow.apply.done', { amount: formatCurrency(total) }));
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      size="lg"
      title={t('docflow.apply.title', { number: credit.number })}
      subtitle={t('docflow.apply.subtitle', { amount: formatCurrency(available) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            {t('docflow.apply.submit', { amount: formatCurrency(total) })}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <TextField label={t('docflow.apply.date')} type="date" value={date} min={credit.date} onChange={(e) => setDate(e.target.value)} />
      {docs.loading ? (
        <LoadingBlock />
      ) : docs.error ? (
        <ErrorBlock message={docs.error} onRetry={docs.reload} />
      ) : !docs.data?.length ? (
        <p className="text-subtle">{t(party === 'customer' ? 'docflow.apply.noInvoices' : 'docflow.apply.noBills')}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('docflow.col.number')}</th>
                <th>{t('docflow.col.date')}</th>
                <th className="align-right">{t('docflow.apply.balanceDue')}</th>
                <th className="align-right">{t('docflow.apply.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {docs.data.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.number}</td>
                  <td>{formatDate(doc.date)}</td>
                  <td className="align-right">{formatCurrency(doc.balanceDue)}</td>
                  <td className="align-right">
                    <input
                      className="input num"
                      type="number"
                      min="0"
                      step="0.01"
                      max={doc.balanceDue}
                      aria-label={t('docflow.apply.amountFor', { number: doc.number })}
                      value={amounts[doc.id] ?? ''}
                      onChange={(e) => setAmounts((current) => ({ ...current, [doc.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

interface RefundProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Refund against this credit; otherwise refund the contact's advance. */
  credit?: FlowDocument;
  advance?: { partyType: 'customer' | 'vendor'; contactId: string; contactName: string; balance: number };
}

export function RefundModal({ open, onClose, onSaved, credit, advance }: RefundProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, fieldErrors, run, setError, reset } = useSubmit();
  const accounts = useAsync(async () => (open ? bankingApi.accountOptions() : []), [open]);
  const max = credit ? (credit.balance ?? 0) : (advance?.balance ?? 0);
  const party = credit ? (credit.kind === 'credit_note' ? 'customer' : 'vendor') : advance?.partyType;
  const [bankAccountId, setBankAccountId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<string>(PAYMENT_MODES[0].value);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    reset();
    setAmount(max > 0 ? String(max) : '');
    setDate(todayIso());
    setReference('');
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, max]);
  useEffect(() => {
    if (!bankAccountId && accounts.data?.length) setBankAccountId(accounts.data[0].id);
  }, [accounts.data, bankAccountId]);

  const options = useMemo(() => (accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })), [accounts.data]);

  const submit = async () => {
    const value = round2(parseNumber(amount));
    if (!bankAccountId) {
      setError(t('docflow.refund.needAccount'));
      return;
    }
    if (value <= 0 || value > max) {
      setError(t('docflow.refund.badAmount', { amount: formatCurrency(max) }));
      return;
    }
    const body: RefundInput = { bankAccountId, date, amount: value, mode, reference: reference.trim() || null, notes: notes.trim() || null };
    const saved = await run(() =>
      credit
        ? docApi(credit.kind).refund(credit.id, body)
        : advancesApi.refund({ ...body, partyType: advance!.partyType, contactId: advance!.contactId }),
    );
    if (saved) {
      toast.success(t('docflow.refund.done', { number: saved.refundNumber }));
      onSaved();
      onClose();
    }
  };

  const name = credit?.contactName ?? advance?.contactName ?? '';
  return (
    <Modal
      open={open}
      title={t(party === 'vendor' ? 'docflow.refund.titleVendor' : 'docflow.refund.titleCustomer', { name })}
      subtitle={t('docflow.refund.subtitle', { amount: formatCurrency(max) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            {t('docflow.refund.submit')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      {accounts.error ? <ErrorBlock message={accounts.error} onRetry={accounts.reload} /> : null}
      <div className="form-grid">
        <SelectField
          label={t(party === 'vendor' ? 'docflow.refund.depositTo' : 'docflow.refund.paidFrom')}
          required
          value={bankAccountId}
          options={options}
          error={fieldErrors.bankAccountId}
          onChange={(e) => setBankAccountId(e.target.value)}
        />
        <TextField label={t('docflow.refund.date')} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        <TextField label={t('docflow.refund.amount')} type="number" min="0" step="0.01" prefix="₹" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <SelectField
          label={t('docflow.refund.mode')}
          value={mode}
          options={PAYMENT_MODES.map((m) => ({ value: m.value, label: paymentModeLabel(m.value, t) }))}
          onChange={(e) => setMode(e.target.value)}
        />
        <TextField label={t('docflow.refund.reference')} value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <TextAreaField label={t('docflow.refund.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Modal>
  );
}
