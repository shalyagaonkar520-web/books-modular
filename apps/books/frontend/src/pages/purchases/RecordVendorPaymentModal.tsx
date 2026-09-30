import { useEffect, useMemo, useState } from 'react';

import { bankingApi, billsApi, contactsApi, vendorPaymentsApi } from '@/api/endpoints';
import type { BillListItem } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { useAppContent } from '@/app/AppContentContext';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, parseNumber, todayIso } from '@/utils/format';
import { PAYMENT_MODES } from '@/utils/status';

/** Minimal shape both `Bill` and `BillListItem` satisfy. */
export interface VendorPaymentBill {
  id: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  balanceDue: number;
}

interface RecordVendorPaymentModalProps {
  /** When set, the payment is locked to this bill and its balance. */
  bill?: VendorPaymentBill | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RecordVendorPaymentModal({ bill, onClose, onSaved }: RecordVendorPaymentModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, fieldErrors, run, setError } = useSubmit();
  // The bank/cash account list is Admin/Viewer-only to read, and a payment must
  // name one. With no staff-readable picker yet, don't fetch (and 403) for Staff;
  // the form shows a message instead of blanking on the error.
  const { can } = useAuth();
  const canReadAccounts = can('admin', 'viewer');

  const refs = useAsync(async () => {
    const [accounts, vendorPage] = await Promise.all([
      canReadAccounts ? bankingApi.accounts() : bankingApi.accountOptions(),
      bill ? Promise.resolve(null) : contactsApi.list({ type: 'vendor', page_size: 200 }),
    ]);
    return { accounts, vendors: vendorPage?.items ?? [] };
  }, [bill?.id, canReadAccounts]);

  const [vendorId, setVendorId] = useState(bill?.vendorId ?? '');
  const [billId, setBillId] = useState(bill?.id ?? '');
  const [bankAccountId, setBankAccountId] = useState('');
  const [date, setDate] = useState(todayIso);
  const [amount, setAmount] = useState(bill ? String(bill.balanceDue) : '');
  const [mode, setMode] = useState<string>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const openBills = useAsync(async () => {
    if (bill || !vendorId) return [] as BillListItem[];
    const page = await billsApi.list({ vendor_id: vendorId, status: 'unpaid', page_size: 200 });
    return page.items;
  }, [bill?.id, vendorId]);

  useEffect(() => {
    const accounts = refs.data?.accounts;
    if (!bankAccountId && accounts && accounts.length > 0) setBankAccountId(accounts[0].id);
  }, [refs.data, bankAccountId]);

  const selectedBill = useMemo(() => {
    if (bill) return bill;
    return openBills.data?.find((row) => row.id === billId) ?? null;
  }, [bill, billId, openBills.data]);

  const maxAmount = selectedBill ? selectedBill.balanceDue : null;
  const parsedAmount = parseNumber(amount, 0);

  const chooseBill = (nextBillId: string) => {
    setBillId(nextBillId);
    const target = openBills.data?.find((row) => row.id === nextBillId);
    setAmount(target ? String(target.balanceDue) : '');
  };

  const submit = async () => {
    if (!vendorId) {
      setError(t('paymentsMade.modal.validate.vendor'));
      return;
    }
    if (!bankAccountId) {
      setError(t('paymentsMade.modal.validate.account'));
      return;
    }
    if (parsedAmount <= 0) {
      setError(t('paymentsMade.modal.validate.amount'));
      return;
    }
    if (maxAmount !== null && parsedAmount > maxAmount) {
      setError(t('paymentsMade.modal.validate.exceeds', { amount: formatCurrency(maxAmount) }));
      return;
    }
    const result = await run(() =>
      vendorPaymentsApi.create({
        vendorId,
        billId: billId || null,
        bankAccountId,
        date,
        amount: parsedAmount,
        mode,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      }),
    );
    if (result) {
      toast.success(t('paymentsMade.modal.toast.recorded', { number: result.paymentNumber }));
      onSaved();
    }
  };

  return (
    <Modal
      open
      title={t('paymentsMade.modal.title')}
      subtitle={
        bill
          ? t('paymentsMade.modal.subtitleBill', { number: bill.billNumber, vendor: bill.vendorName })
          : t('paymentsMade.modal.subtitle')
      }
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('paymentsMade.modal.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={submitting}>
            {t('paymentsMade.modal.submit')}
          </Button>
        </>
      }
    >
      {refs.loading ? (
        <LoadingBlock label={t('paymentsMade.modal.loading')} />
      ) : refs.error ? (
        <ErrorBlock message={refs.error} onRetry={refs.reload} />
      ) : (
        <>
          <FormError message={error} />
          {bill ? (
            <div className="form-grid">
              <TextField label={t('paymentsMade.modal.bill')} value={bill.billNumber} readOnly disabled />
              <TextField label={t('paymentsMade.modal.balanceDue')} value={formatCurrency(bill.balanceDue)} readOnly disabled />
            </div>
          ) : (
            <div className="form-grid">
              <SelectField
                label={t('paymentsMade.modal.vendor')}
                required
                value={vendorId}
                placeholder={t('paymentsMade.modal.vendorPlaceholder')}
                error={fieldErrors.vendorId}
                options={(refs.data?.vendors ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName }))}
                onChange={(event) => {
                  setVendorId(event.target.value);
                  setBillId('');
                  setAmount('');
                }}
              />
              <SelectField
                label={t('paymentsMade.modal.applyToBill')}
                value={billId}
                placeholder={vendorId ? t('paymentsMade.modal.advance') : t('paymentsMade.modal.selectVendorFirst')}
                hint={openBills.loading ? t('paymentsMade.modal.loadingBills') : t('paymentsMade.modal.applyHint')}
                error={fieldErrors.billId}
                options={(openBills.data ?? []).map((row) => ({
                  value: row.id,
                  label: t('paymentsMade.modal.billOption', { number: row.billNumber, amount: formatCurrency(row.balanceDue) }),
                }))}
                onChange={(event) => chooseBill(event.target.value)}
              />
            </div>
          )}

          <div className="form-grid">
            <SelectField
              label={t('paymentsMade.modal.paidThrough')}
              required
              value={bankAccountId}
              placeholder={t('paymentsMade.modal.accountPlaceholder')}
              error={fieldErrors.bankAccountId}
              options={(refs.data?.accounts ?? []).map((account) => {
                const balance = (account as { currentBalance?: number }).currentBalance;
                return {
                  value: account.id,
                  label: typeof balance === 'number' ? `${account.name} · ${formatCurrency(balance)}` : account.name,
                };
              })}
              onChange={(event) => setBankAccountId(event.target.value)}
            />
            <TextField
              label={t('paymentsMade.modal.date')}
              type="date"
              required
              value={date}
              error={fieldErrors.date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="form-grid">
            <TextField
              label={t('paymentsMade.modal.amount')}
              type="number"
              min="0"
              step="0.01"
              max={maxAmount !== null ? String(maxAmount) : undefined}
              required
              value={amount}
              error={fieldErrors.amount}
              hint={maxAmount !== null ? t('paymentsMade.modal.amountHint', { amount: formatCurrency(maxAmount) }) : undefined}
              onChange={(event) => setAmount(event.target.value)}
            />
            <SelectField
              label={t('paymentsMade.modal.mode')}
              value={mode}
              error={fieldErrors.mode}
              options={PAYMENT_MODES.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              onChange={(event) => setMode(event.target.value)}
            />
          </div>

          <TextField
            label={t('paymentsMade.modal.reference')}
            value={reference}
            error={fieldErrors.reference}
            hint={t('paymentsMade.modal.referenceHint')}
            onChange={(event) => setReference(event.target.value)}
          />
          <TextAreaField label={t('paymentsMade.modal.notes')} value={notes} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />
        </>
      )}
    </Modal>
  );
}
