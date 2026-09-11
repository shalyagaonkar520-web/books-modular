/** Shared "record customer payment" dialog used by the sales pages. */
import { useEffect, useMemo, useState } from 'react';

import { emptyPage } from '@/api/client';
import { bankingApi, customerPaymentsApi, invoicesApi } from '@/api/endpoints';
import type { Contact, InvoiceListItem } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
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
  const toast = useToast();
  const { submitting, error, fieldErrors, run, reset, setError } = useSubmit();
  const customerMode = !invoice;

  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<string>(PAYMENT_MODES[0].value);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const accounts = useAsync(async () => (open ? bankingApi.accounts() : []), [open]);
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
    const list = accounts.data;
    if (!list?.length) return;
    setBankAccountId((current) => (current && list.some((account) => account.id === current) ? current : (list.find((a) => a.isPrimary) ?? list[0]).id));
  }, [accounts.data]);

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
      setError('Select the customer who paid.');
      return;
    }
    if (!bankAccountId) {
      setError('Select the bank or cash account the money landed in.');
      return;
    }
    const value = round2(parseNumber(amount));
    if (value <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    if (maxAmount !== null && value > round2(maxAmount)) {
      setError(`Payment cannot exceed the invoice balance of ${formatCurrency(maxAmount)}.`);
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
      toast.success(`Payment ${result.paymentNumber} recorded`);
      onSaved();
      onClose();
    }
  };

  const bankOptions = (accounts.data ?? []).map((account) => ({
    value: account.id,
    label: account.bankName ? `${account.name} · ${account.bankName}` : account.name,
  }));

  return (
    <Modal
      open={open}
      title="Record payment"
      subtitle={invoice ? `Against invoice ${invoice.invoiceNumber}` : 'Money received from a customer'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={submitting}>
            Record payment
          </Button>
        </>
      }
    >
      {accounts.loading ? (
        <LoadingBlock label="Loading accounts…" />
      ) : accounts.error ? (
        <ErrorBlock message={accounts.error} onRetry={accounts.reload} />
      ) : !bankOptions.length ? (
        <ErrorBlock message="Add a bank or cash account in Banking before recording payments." />
      ) : (
        <div className="stack">
          <FormError message={error} />

          {invoice ? (
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Invoice</dt>
                <dd className="strong">{invoice.invoiceNumber}</dd>
              </div>
              <div className="detail-item">
                <dt>Balance due</dt>
                <dd className="num strong">{formatCurrency(invoice.balanceDue)}</dd>
              </div>
            </dl>
          ) : (
            <div className="form-grid">
              <SelectField
                label="Customer"
                required
                value={customerId}
                placeholder="Select a customer"
                error={fieldErrors.customerId}
                options={customers.map((customer) => ({ value: customer.id, label: customer.displayName }))}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setInvoiceId('');
                  setAmount('');
                }}
              />
              <SelectField
                label="Apply to invoice"
                value={invoiceId}
                placeholder={openInvoices.loading ? 'Loading invoices…' : 'Unapplied advance'}
                hint={customerId ? 'Leave blank to hold the money as a customer advance.' : 'Pick a customer first.'}
                error={fieldErrors.invoiceId}
                disabled={!customerId || openInvoices.loading}
                options={(openInvoices.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.invoiceNumber} · ${formatCurrency(item.balanceDue)} due`,
                }))}
                onChange={(event) => chooseInvoice(event.target.value)}
              />
            </div>
          )}

          <div className="form-grid">
            <SelectField
              label="Deposit to"
              required
              value={bankAccountId}
              options={bankOptions}
              error={fieldErrors.bankAccountId}
              onChange={(event) => setBankAccountId(event.target.value)}
            />
            <TextField label="Payment date" type="date" required value={date} error={fieldErrors.date} onChange={(event) => setDate(event.target.value)} />
            <TextField
              label="Amount"
              type="number"
              min="0"
              step="0.01"
              max={maxAmount !== null ? String(maxAmount) : undefined}
              required
              value={amount}
              prefix="₹"
              error={fieldErrors.amount}
              hint={maxAmount !== null ? `Up to ${formatCurrency(maxAmount)}` : undefined}
              onChange={(event) => setAmount(event.target.value)}
            />
            <SelectField
              label="Payment mode"
              value={mode}
              options={PAYMENT_MODES.map((option) => ({ value: option.value, label: option.label }))}
              error={fieldErrors.mode}
              onChange={(event) => setMode(event.target.value)}
            />
            <TextField
              label="Reference"
              value={reference}
              placeholder="UTR, cheque or transaction number"
              error={fieldErrors.reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
          <TextAreaField label="Notes" value={notes} rows={2} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      )}
    </Modal>
  );
}
