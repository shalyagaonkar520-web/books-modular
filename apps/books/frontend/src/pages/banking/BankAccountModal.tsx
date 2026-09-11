import { useEffect, useId, useState, type FormEvent } from 'react';

import { bankingApi } from '@/api/endpoints';
import type { BankAccount, BankAccountType } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber, todayIso } from '@/utils/format';

const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
];

interface FormState {
  name: string;
  type: BankAccountType;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  openingBalance: string;
  openingBalanceDate: string;
  isPrimary: boolean;
  isActive: boolean;
}

const BLANK: FormState = {
  name: '',
  type: 'bank',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  openingBalance: '0',
  openingBalanceDate: todayIso(),
  isPrimary: false,
  isActive: true,
};

interface BankAccountModalProps {
  open: boolean;
  /** `null` opens the modal in "add account" mode. */
  account: BankAccount | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function BankAccountModal({ open, account, onClose, onSaved }: BankAccountModalProps) {
  const formId = useId();
  const { submitting, error, fieldErrors, run, reset } = useSubmit();
  const [form, setForm] = useState<FormState>(BLANK);

  useEffect(() => {
    if (!open) return;
    reset();
    setForm(
      account
        ? {
            name: account.name,
            type: account.type,
            bankName: account.bankName ?? '',
            accountNumber: '',
            ifsc: account.ifsc ?? '',
            openingBalance: String(account.openingBalance),
            openingBalanceDate: account.openingBalanceDate,
            isPrimary: account.isPrimary,
            isActive: account.isActive,
          }
        : { ...BLANK, openingBalanceDate: todayIso() },
    );
  }, [open, account, reset]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run(() =>
      account
        ? bankingApi.updateAccount(account.id, {
            name: form.name.trim(),
            bankName: form.bankName.trim() || null,
            ifsc: form.ifsc.trim() || null,
            isPrimary: form.isPrimary,
            isActive: form.isActive,
            ...(form.accountNumber.trim() ? { accountNumber: form.accountNumber.trim() } : {}),
          })
        : bankingApi.createAccount({
            name: form.name.trim(),
            type: form.type,
            bankName: form.bankName.trim() || null,
            accountNumber: form.accountNumber.trim() || null,
            ifsc: form.ifsc.trim() || null,
            openingBalance: parseNumber(form.openingBalance),
            openingBalanceDate: form.openingBalanceDate,
            isPrimary: form.isPrimary,
          }),
    );
    if (saved) onSaved(account ? 'Bank account updated.' : 'Bank account added.');
  };

  return (
    <Modal
      open={open}
      title={account ? 'Edit account' : 'Add account'}
      subtitle={account ? account.name : 'Cash, bank and credit card accounts feed the ledger automatically.'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            {account ? 'Save changes' : 'Add account'}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid">
          <TextField
            label="Account name"
            required
            value={form.name}
            error={fieldErrors.name}
            onChange={(event) => set('name', event.target.value)}
          />
          {account ? null : (
            <SelectField
              label="Type"
              required
              options={ACCOUNT_TYPES}
              value={form.type}
              error={fieldErrors.type}
              onChange={(event) => set('type', event.target.value as BankAccountType)}
            />
          )}
          <TextField label="Bank name" value={form.bankName} error={fieldErrors.bankName} onChange={(event) => set('bankName', event.target.value)} />
          <TextField
            label="Account number"
            value={form.accountNumber}
            error={fieldErrors.accountNumber}
            hint={account ? 'Leave blank to keep the stored number' : undefined}
            onChange={(event) => set('accountNumber', event.target.value)}
          />
          <TextField label="IFSC" value={form.ifsc} error={fieldErrors.ifsc} onChange={(event) => set('ifsc', event.target.value.toUpperCase())} />
          {account ? null : (
            <>
              <TextField
                label="Opening balance"
                type="number"
                step="0.01"
                value={form.openingBalance}
                error={fieldErrors.openingBalance}
                onChange={(event) => set('openingBalance', event.target.value)}
              />
              <TextField
                label="Opening balance date"
                type="date"
                required
                value={form.openingBalanceDate}
                error={fieldErrors.openingBalanceDate}
                onChange={(event) => set('openingBalanceDate', event.target.value)}
              />
            </>
          )}
        </div>
        <CheckboxField label="Primary account" checked={form.isPrimary} onChange={(event) => set('isPrimary', event.target.checked)} />
        {account ? <CheckboxField label="Active" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} /> : null}
      </form>
    </Modal>
  );
}
