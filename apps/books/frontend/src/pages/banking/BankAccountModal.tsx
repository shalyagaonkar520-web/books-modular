import { useEffect, useId, useState, type FormEvent } from 'react';

import { bankingApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import type { BankAccount, BankAccountType } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber, todayIso } from '@/utils/format';

const ACCOUNT_TYPES = [
  { value: 'bank', labelKey: 'banking.accountModal.type.bank' },
  { value: 'cash', labelKey: 'banking.accountModal.type.cash' },
  { value: 'credit_card', labelKey: 'banking.accountModal.type.creditCard' },
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
  const { t } = useAppContent();
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
    if (saved) onSaved(account ? t('banking.accountModal.toast.updated') : t('banking.accountModal.toast.added'));
  };

  return (
    <Modal
      open={open}
      title={account ? t('banking.accountModal.editTitle') : t('banking.accountModal.addTitle')}
      subtitle={account ? account.name : t('banking.accountModal.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('banking.accountModal.cancel')}
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            {account ? t('banking.accountModal.saveChanges') : t('banking.accountModal.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid">
          <TextField
            label={t('banking.accountModal.name')}
            required
            value={form.name}
            error={fieldErrors.name}
            onChange={(event) => set('name', event.target.value)}
          />
          {account ? null : (
            <SelectField
              label={t('banking.accountModal.typeLabel')}
              required
              options={ACCOUNT_TYPES.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              value={form.type}
              error={fieldErrors.type}
              onChange={(event) => set('type', event.target.value as BankAccountType)}
            />
          )}
          <TextField label={t('banking.accountModal.bankName')} value={form.bankName} error={fieldErrors.bankName} onChange={(event) => set('bankName', event.target.value)} />
          <TextField
            label={t('banking.accountModal.accountNumber')}
            value={form.accountNumber}
            error={fieldErrors.accountNumber}
            hint={account ? t('banking.accountModal.accountNumberHint') : undefined}
            onChange={(event) => set('accountNumber', event.target.value)}
          />
          <TextField label={t('banking.accountModal.ifsc')} value={form.ifsc} error={fieldErrors.ifsc} onChange={(event) => set('ifsc', event.target.value.toUpperCase())} />
          {account ? null : (
            <>
              <TextField
                label={t('banking.accountModal.openingBalance')}
                type="number"
                step="0.01"
                value={form.openingBalance}
                error={fieldErrors.openingBalance}
                onChange={(event) => set('openingBalance', event.target.value)}
              />
              <TextField
                label={t('banking.accountModal.openingBalanceDate')}
                type="date"
                required
                value={form.openingBalanceDate}
                error={fieldErrors.openingBalanceDate}
                onChange={(event) => set('openingBalanceDate', event.target.value)}
              />
            </>
          )}
        </div>
        <CheckboxField label={t('banking.accountModal.primary')} checked={form.isPrimary} onChange={(event) => set('isPrimary', event.target.checked)} />
        {account ? <CheckboxField label={t('banking.accountModal.active')} checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} /> : null}
      </form>
    </Modal>
  );
}
