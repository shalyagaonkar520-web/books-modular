import { useEffect, useId, useState, type FormEvent } from 'react';

import { accountingApi } from '@/api/endpoints';
import type { Account, AccountType } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';

export const ACCOUNT_TYPE_OPTIONS = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
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
    if (saved) onSaved(account ? 'Account updated.' : 'Account created.');
  };

  return (
    <Modal
      open={open}
      title={account ? 'Edit account' : 'New account'}
      subtitle={account ? `${account.code} · ${account.name}` : 'Add a ledger account to your chart of accounts.'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            {account ? 'Save changes' : 'Create account'}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid">
          {account ? null : (
            <TextField
              label="Code"
              required
              value={form.code}
              error={fieldErrors.code}
              hint="Must be unique in your chart of accounts."
              onChange={(event) => set('code', event.target.value)}
            />
          )}
          <TextField label="Name" required value={form.name} error={fieldErrors.name} onChange={(event) => set('name', event.target.value)} />
          {account ? null : (
            <SelectField
              label="Type"
              required
              options={ACCOUNT_TYPE_OPTIONS}
              value={form.type}
              error={fieldErrors.type}
              onChange={(event) => set('type', event.target.value as AccountType)}
            />
          )}
          <TextField label="Subtype" value={form.subtype} error={fieldErrors.subtype} onChange={(event) => set('subtype', event.target.value)} />
        </div>
        <TextAreaField
          label="Description"
          rows={2}
          value={form.description}
          error={fieldErrors.description}
          onChange={(event) => set('description', event.target.value)}
        />
        {account && !account.isSystem ? (
          <CheckboxField label="Active" checked={form.isActive} onChange={(event) => set('isActive', event.target.checked)} />
        ) : null}
        {account?.isSystem ? <p className="small text-muted">This is a system account, so it cannot be deactivated or deleted.</p> : null}
      </form>
    </Modal>
  );
}
