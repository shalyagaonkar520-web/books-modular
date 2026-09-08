import { useEffect, useId, useState, type FormEvent } from 'react';

import { bankingApi } from '@/api/endpoints';
import type { Account, BankAccount } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber, todayIso } from '@/utils/format';

const TRANSACTION_TYPES = [
  { value: 'deposit', label: 'Deposit (money in)' },
  { value: 'withdrawal', label: 'Withdrawal (money out)' },
];

interface TransactionFormState {
  date: string;
  type: 'deposit' | 'withdrawal';
  amount: string;
  description: string;
  reference: string;
  counterAccountId: string;
}

interface BankTransactionModalProps {
  open: boolean;
  account: BankAccount | null;
  /** Ledger accounts used for the other side of the entry. */
  ledgerAccounts: Account[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function BankTransactionModal({ open, account, ledgerAccounts, onClose, onSaved }: BankTransactionModalProps) {
  const formId = useId();
  const { submitting, error, fieldErrors, run, reset } = useSubmit();
  const [form, setForm] = useState<TransactionFormState>({
    date: todayIso(),
    type: 'deposit',
    amount: '',
    description: '',
    reference: '',
    counterAccountId: '',
  });

  useEffect(() => {
    if (!open) return;
    reset();
    setForm({ date: todayIso(), type: 'deposit', amount: '', description: '', reference: '', counterAccountId: '' });
  }, [open, reset]);

  const set = <K extends keyof TransactionFormState>(key: K, value: TransactionFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const counterOptions = ledgerAccounts
    .filter((ledgerAccount) => ledgerAccount.id !== account?.ledgerAccountId)
    .map((ledgerAccount) => ({ value: ledgerAccount.id, label: `${ledgerAccount.code} · ${ledgerAccount.name}` }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!account) return;
    const saved = await run(() =>
      bankingApi.createTransaction(account.id, {
        date: form.date,
        type: form.type,
        amount: parseNumber(form.amount),
        description: form.description.trim(),
        reference: form.reference.trim() || null,
        counterAccountId: form.counterAccountId,
      }),
    );
    if (saved) onSaved('Transaction recorded.');
  };

  return (
    <Modal
      open={open}
      title="Add transaction"
      subtitle={account ? account.name : undefined}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            Record transaction
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid">
          <TextField label="Date" type="date" required value={form.date} error={fieldErrors.date} onChange={(event) => set('date', event.target.value)} />
          <SelectField
            label="Type"
            required
            options={TRANSACTION_TYPES}
            value={form.type}
            error={fieldErrors.type}
            onChange={(event) => set('type', event.target.value as 'deposit' | 'withdrawal')}
          />
          <TextField
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            required
            value={form.amount}
            error={fieldErrors.amount}
            onChange={(event) => set('amount', event.target.value)}
          />
          <TextField label="Reference" value={form.reference} error={fieldErrors.reference} onChange={(event) => set('reference', event.target.value)} />
          <SelectField
            label="Counter account"
            required
            placeholder="Select the other side of the entry"
            options={counterOptions}
            value={form.counterAccountId}
            error={fieldErrors.counterAccountId}
            hint="Income, expense or balance sheet account this money came from or went to."
            onChange={(event) => set('counterAccountId', event.target.value)}
          />
        </div>
        <TextAreaField
          label="Description"
          required
          rows={2}
          value={form.description}
          error={fieldErrors.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </form>
    </Modal>
  );
}

interface TransferFormState {
  fromAccountId: string;
  toAccountId: string;
  date: string;
  amount: string;
  description: string;
  reference: string;
}

interface BankTransferModalProps {
  open: boolean;
  accounts: BankAccount[];
  defaultFromAccountId?: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function BankTransferModal({ open, accounts, defaultFromAccountId, onClose, onSaved }: BankTransferModalProps) {
  const formId = useId();
  const { submitting, error, fieldErrors, run, reset } = useSubmit();
  const [form, setForm] = useState<TransferFormState>({
    fromAccountId: '',
    toAccountId: '',
    date: todayIso(),
    amount: '',
    description: '',
    reference: '',
  });

  useEffect(() => {
    if (!open) return;
    reset();
    setForm({
      fromAccountId: defaultFromAccountId ?? '',
      toAccountId: '',
      date: todayIso(),
      amount: '',
      description: '',
      reference: '',
    });
  }, [open, defaultFromAccountId, reset]);

  const set = <K extends keyof TransferFormState>(key: K, value: TransferFormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const options = accounts.map((account) => ({ value: account.id, label: account.name }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run(() =>
      bankingApi.transfer({
        fromAccountId: form.fromAccountId,
        toAccountId: form.toAccountId,
        date: form.date,
        amount: parseNumber(form.amount),
        description: form.description.trim() || null,
        reference: form.reference.trim() || null,
      }),
    );
    if (saved) onSaved(saved.message);
  };

  return (
    <Modal
      open={open}
      title="Transfer between accounts"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            Record transfer
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid">
          <SelectField
            label="From account"
            required
            placeholder="Select an account"
            options={options}
            value={form.fromAccountId}
            error={fieldErrors.fromAccountId}
            onChange={(event) => set('fromAccountId', event.target.value)}
          />
          <SelectField
            label="To account"
            required
            placeholder="Select an account"
            options={options.filter((option) => option.value !== form.fromAccountId)}
            value={form.toAccountId}
            error={fieldErrors.toAccountId}
            onChange={(event) => set('toAccountId', event.target.value)}
          />
          <TextField label="Date" type="date" required value={form.date} error={fieldErrors.date} onChange={(event) => set('date', event.target.value)} />
          <TextField
            label="Amount"
            type="number"
            step="0.01"
            min="0"
            required
            value={form.amount}
            error={fieldErrors.amount}
            onChange={(event) => set('amount', event.target.value)}
          />
          <TextField label="Reference" value={form.reference} error={fieldErrors.reference} onChange={(event) => set('reference', event.target.value)} />
          <TextField
            label="Description"
            value={form.description}
            error={fieldErrors.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
