/** Shared "record customer payment" dialog used by the sales pages. */
import { useEffect, useMemo, useState } from 'react';

import { emptyPage } from '@/api/client';
import { bankingApi, customerPaymentsApi, invoicesApi } from '@/api/endpoints';
import type { Contact, InvoiceListItem } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useAppContent } from '@/app/AppContentContext';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, parseNumber, round2, todayIso } from '@/utils/format';
import { PAYMENT_MODES } from '@/utils/status';

/** The invoice a payment is locked to, when opened from an invoice row. */
export interface PaymentInvoiceContext {
  id: string;
  invoiceNumber: string;
  customerId: string;
  balanceDue: number;
}

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** When set, the payment is applied to this invoice and the amount is capped at its balance. */
  invoice?: PaymentInvoiceContext;
  /** Customers to choose from when no invoice context is supplied. */
  customers?: Contact[];
}

export function RecordPaymentModal({ open, onClose, onSaved, invoice, customers = [] }: RecordPaymentModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, fieldErrors, run, reset, setError } = useSubmit();
  // The bank/cash account list is Admin/Viewer-only to read. A payment must name
  // one, and there is no staff-readable account picker yet, so for Staff the form
  // cannot be completed - don't fetch (and 403), and show a message instead.
  const { can } = useAuth();
  const canReadAccounts = can('admin', 'viewer');
  const customerMode = !invoice;

  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<string>(PAYMENT_MODES[0].value);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  // Admin/viewer read the full banking list (with balances); staff use the
  // balance-free options endpoint so they can still record payments.
  const accounts = useAsync(
    async () => (open ? (canReadAccounts ? bankingApi.accounts() : bankingApi.accountOptions()) : []),
    [open, canReadAccounts],
  );
  const accountList = useMemo(
    () =>
      (accounts.data ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        label: 'bankName' in a && a.bankName ? `${a.name} · ${a.bankName}` : a.name,
        isPrimary: 'isPrimary' in a ? a.isPrimary : false,
      })),
    [accounts.data],
  );
  const openInvoices = useAsync(
    async (signal) =>
      open && customerMode && customerId
        ? invoicesApi.list({ customer_id: customerId, status: 'unpaid', page_size: 200 }, signal)
        : emptyPage<InvoiceListItem>(),
    [open, customerMode, customerId],
  );

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    reset();
    setCustomerId(invoice?.customerId ?? '');
    setInvoiceId('');
    setDate(todayIso());
    setAmount(invoice ? String(invoice.balanceDue) : '');
    setMode(PAYMENT_MODES[0].value);
    setReference('');
    setNotes('');
  }, [open, invoice, reset]);

  // Default to the primary bank account once the list arrives.
  useEffect(() => {
    const list = accountList;
    if (!list.length) return;
    setBankAccountId((current) => (current && list.some((account) => account.id === current) ? current : (list.find((a) => a.isPrimary) ?? list[0]).id));
  }, [accountList]);

  const selectedInvoice = useMemo(
    () => (customerMode ? openInvoices.data?.items.find((item) => item.id === invoiceId) ?? null : null),
    [customerMode, openInvoices.data, invoiceId],
  );
  const maxAmount = invoice ? invoice.balanceDue : selectedInvoice?.balanceDue ?? null;

  const chooseInvoice = (value: string) => {
    setInvoiceId(value);
    const picked = openInvoices.data?.items.find((item) => item.id === value);
    setAmount(picked ? String(picked.balanceDue) : '');
  };

  const submit = async () => {
    const payerId = invoice ? invoice.customerId : customerId;
    if (!payerId) {
      setError(t('paymentsReceived.recordModal.selectCustomer'));
      return;
    }
    if (!bankAccountId) {
      setError(t('paymentsReceived.recordModal.selectAccount'));
      return;
    }
    const value = round2(parseNumber(amount));
    if (value <= 0) {
      setError(t('paymentsReceived.recordModal.amountPositive'));
      return;
    }
    if (maxAmount !== null && value > round2(maxAmount)) {
      setError(t('paymentsReceived.recordModal.exceedsBalance', { amount: formatCurrency(maxAmount) }));
      return;
    }
    const result = await run(() =>
      customerPaymentsApi.create({
        customerId: payerId,
        invoiceId: invoice ? invoice.id : invoiceId || null,
        bankAccountId,
        date,
        amount: value,
        mode,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      }),
    );
    if (result) {
      toast.success(t('paymentsReceived.recordModal.recorded', { number: result.paymentNumber }));
      onSaved();
      onClose();
    }
  };

  const bankOptions = accountList.map((account) => ({ value: account.id, label: account.label }));

  return (
    <Modal
      open={open}
      title={t('paymentsReceived.recordModal.title')}
      subtitle={invoice ? t('paymentsReceived.recordModal.subtitleInvoice', { number: invoice.invoiceNumber }) : t('paymentsReceived.recordModal.subtitleCustomer')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('paymentsReceived.recordModal.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={submitting}>
            {t('paymentsReceived.recordModal.submit')}
          </Button>
        </>
      }
    >
      {accounts.loading ? (
        <LoadingBlock label={t('paymentsReceived.recordModal.loadingAccounts')} />
      ) : accounts.error ? (
        <ErrorBlock message={accounts.error} onRetry={accounts.reload} />
      ) : !bankOptions.length ? (
        <ErrorBlock message={t('paymentsReceived.recordModal.noAccounts')} />
      ) : (
        <div className="stack">
          <FormError message={error} />

          {invoice ? (
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>{t('paymentsReceived.recordModal.invoice')}</dt>
                <dd className="strong">{invoice.invoiceNumber}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('paymentsReceived.recordModal.balanceDue')}</dt>
                <dd className="num strong">{formatCurrency(invoice.balanceDue)}</dd>
              </div>
            </dl>
          ) : (
            <div className="form-grid">
              <SelectField
                label={t('paymentsReceived.recordModal.customer')}
                required
                value={customerId}
                placeholder={t('paymentsReceived.recordModal.customerPlaceholder')}
                error={fieldErrors.customerId}
                options={customers.map((customer) => ({ value: customer.id, label: customer.displayName }))}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setInvoiceId('');
                  setAmount('');
                }}
              />
              <SelectField
                label={t('paymentsReceived.recordModal.applyTo')}
                value={invoiceId}
                placeholder={openInvoices.loading ? t('paymentsReceived.recordModal.loadingInvoices') : t('paymentsReceived.recordModal.unapplied')}
                hint={customerId ? t('paymentsReceived.recordModal.applyHint') : t('paymentsReceived.recordModal.pickCustomerFirst')}
                error={fieldErrors.invoiceId}
                disabled={!customerId || openInvoices.loading}
                options={(openInvoices.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: t('paymentsReceived.recordModal.invoiceOption', { number: item.invoiceNumber, amount: formatCurrency(item.balanceDue) }),
                }))}
                onChange={(event) => chooseInvoice(event.target.value)}
              />
            </div>
          )}

          <div className="form-grid">
            <SelectField
              label={t('paymentsReceived.recordModal.depositTo')}
              required
              value={bankAccountId}
              options={bankOptions}
              error={fieldErrors.bankAccountId}
              onChange={(event) => setBankAccountId(event.target.value)}
            />
            <TextField label={t('paymentsReceived.recordModal.date')} type="date" required value={date} error={fieldErrors.date} onChange={(event) => setDate(event.target.value)} />
            <TextField
              label={t('paymentsReceived.recordModal.amount')}
              type="number"
              min="0"
              step="0.01"
              max={maxAmount !== null ? String(maxAmount) : undefined}
              required
              value={amount}
              prefix="₹"
              error={fieldErrors.amount}
              hint={maxAmount !== null ? t('paymentsReceived.recordModal.amountHint', { amount: formatCurrency(maxAmount) }) : undefined}
              onChange={(event) => setAmount(event.target.value)}
            />
            <SelectField
              label={t('paymentsReceived.recordModal.mode')}
              value={mode}
              options={PAYMENT_MODES.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              error={fieldErrors.mode}
              onChange={(event) => setMode(event.target.value)}
            />
            <TextField
              label={t('paymentsReceived.recordModal.reference')}
              value={reference}
              placeholder={t('paymentsReceived.recordModal.referencePlaceholder')}
              error={fieldErrors.reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
          <TextAreaField label={t('paymentsReceived.recordModal.notes')} value={notes} rows={2} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      )}
    </Modal>
  );
}
