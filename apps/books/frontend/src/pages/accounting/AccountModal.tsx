import { useEffect, useId, useState, type FormEvent } from 'react';

import { accountingApi } from '@/api/endpoints';
import type { Account, AccountType } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';

/** Account-type options; `label` is a content key, resolve it with `t()` at render. */
export const ACCOUNT_TYPE_OPTIONS = [
  { value: 'asset', label: 'accounting.accountType.asset' },
  { value: 'liability', label: 'accounting.accountType.liability' },
  { value: 'equity', label: 'accounting.accountType.equity' },
  { value: 'income', label: 'accounting.accountType.income' },
  { value: 'expense', label: 'accounting.accountType.expense' },
];

interface FormState {
  code: string;
  name: string;
  type: AccountType;
  subtype: string;
  description: string;
  isActive: boolean;
}

const BLANK: FormState = { code: '', name: '', type: 'asset', subtype: '', description: '', isActive: true };

interface AccountModalProps {
  open: boolean;
  /** `null` opens the modal in "create account" mode. */
  account: Account | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function AccountModal({ open, account, onClose, onSaved }: AccountModalProps) {
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
            code: account.code,
            name: account.name,
            type: account.type,
            subtype: account.subtype ?? '',
            description: account.description ?? '',
            isActive: account.isActive,
          }
        : BLANK,
    );
  }, [open, account, reset]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run(() =>
      account
        ? accountingApi.updateAccount(account.id, {
            name: form.name.trim(),
            subtype: form.subtype.trim() || null,
            description: form.description.trim() || null,
            ...(account.isSystem ? {} : { isActive: form.isActive }),
          })
        : accountingApi.createAccount({
            code: form.code.trim(),
            name: form.name.trim(),
            type: form.type,
            subtype: form.subtype.trim() || null,
            description: form.description.trim() || null,
          }),
    );
    if (saved) onSaved(account ? t('accounting.accountModal.toast.updated') : t('accounting.accountModal.toast.created'));
  };

  return (
    <Modal
      open={open}
      title={account ? t('accounting.accountModal.editTitle') : t('accounting.accountModal.newTitle')}
      subtitle={account ? `${account.code} · ${account.name}` : t('accounting.accountModal.newSubtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('accounting.accountModal.cancel')}
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            {account ? t('accounting.accountModal.saveChanges') : t('accounting.accountModal.create')}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid">
          {account ? null : (
            <TextField
              label={t('accounting.accountModal.code')}
              required
              value={form.code}
              error={fieldErrors.code}
              hint={t('accounting.accountModal.codeHint')}
              onChange={(event) => set('code', event.target.value)}
            />
          )}
          <TextField label={t('accounting.accountModal.name')} required value={form.name} error={fieldErrors.name} onChange={(event) => set('name', event.target.value)} />
          {account ? null : (
            <SelectField
              label={t('accounting.accountModal.type')}
              required
              options={ACCOUNT_TYPE_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
              value={form.type}
              error={fieldErrors.type}
              onChange={(event) => set('type', event.target.value as AccountType)}
            />
          )}
          <TextField label={t('accounting.accountModal.subtype')} value={form.subtype} error={fieldErrors.subtype} onChange={(event) => set('subtype', event.target.value)} />
        </div>
        <TextAreaField
          label={t('accounting.accountModal.description')}
          rows={2}
          value={form.description}
          error={fieldErrors.description}
          onChange={(event) => set('description', event.target.value)}
        />
        {account && !account.isSystem ? (
          <CheckboxField label={t('accounting.accountModal.active')} checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} />
        ) : null}
        {account?.isSystem ? <p className="small text-muted">{t('accounting.accountModal.systemNote')}</p> : null}
      </form>
    </Modal>
  );
}
