import { useState } from 'react';

import { expensesApi } from '@/api/endpoints';
import type { Account, Contact, Expense } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAppContent } from '@/app/AppContentContext';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatPercent, parseNumber, round2, todayIso } from '@/utils/format';
import { TAX_RATES } from '@/utils/status';

const TAX_OPTIONS = TAX_RATES.map((rate) => ({ value: String(rate), label: `${rate}%` }));

/** Reference data the expense form needs; loaded once by the page. */
export interface ExpenseRefs {
  // Minimal picker shapes so both the full account lists (admin/viewer) and the
  // balance-free /account-options lists (staff) can populate the form.
  expenseAccounts: Array<Pick<Account, 'id' | 'code' | 'name'>>;
  bankAccounts: Array<{ id: string; name: string; currentBalance?: number }>;
  vendors: Contact[];
  customers: Contact[];
}

interface ExpenseFormModalProps {
  refs: ExpenseRefs;
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ExpenseFormModal({ refs, expense, onClose, onSaved }: ExpenseFormModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, fieldErrors, run, setError } = useSubmit();

  const [date, setDate] = useState(expense?.date ?? todayIso());
  const [accountId, setAccountId] = useState(expense?.accountId ?? '');
  const [paidThroughAccountId, setPaidThroughAccountId] = useState(expense?.paidThroughAccountId ?? refs.bankAccounts[0]?.id ?? '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [taxRate, setTaxRate] = useState(expense ? String(expense.taxRate) : '0');
  const [vendorId, setVendorId] = useState(expense?.vendorId ?? '');
  const [customerId, setCustomerId] = useState(expense?.customerId ?? '');
  const [isBillable, setIsBillable] = useState(expense?.isBillable ?? false);
  const [reference, setReference] = useState(expense?.reference ?? '');
  const [notes, setNotes] = useState(expense?.notes ?? '');
  // These are recorded on the expense but this form does not expose them. Carry
  // the loaded values so they are echoed back on update - otherwise ExpenseUpdate
  // resets category/paymentMethod/receiptUrl/status to its defaults on save.
  const [category] = useState(expense?.category ?? '');
  const [paymentMethod] = useState(expense?.paymentMethod ?? '');
  const [receiptUrl] = useState(expense?.receiptUrl ?? '');
  const [status] = useState(expense?.status ?? '');

  const parsedAmount = parseNumber(amount, 0);
  const taxAmount = round2((parsedAmount * parseNumber(taxRate, 0)) / 100);
  const total = round2(parsedAmount + taxAmount);

  const save = async () => {
    if (!accountId) {
      setError(t('expenses.form.validate.account'));
      return;
    }
    if (!paidThroughAccountId) {
      setError(t('expenses.form.validate.paidThrough'));
      return;
    }
    if (parsedAmount <= 0) {
      setError(t('expenses.form.validate.amount'));
      return;
    }
    if (isBillable && !customerId) {
      setError(t('expenses.form.validate.customer'));
      return;
    }
    const body: Record<string, unknown> = {
      date,
      accountId,
      paidThroughAccountId,
      vendorId: vendorId || null,
      customerId: customerId || null,
      amount: parsedAmount,
      taxRate: parseNumber(taxRate, 0),
      reference: reference.trim() || null,
      notes: notes.trim() || null,
      isBillable,
    };
    if (expense) {
      // Preserve the fields this form does not edit; otherwise the server's
      // ExpenseUpdate defaults would silently overwrite them on save.
      body.category = category || null;
      body.paymentMethod = paymentMethod || null;
      body.receiptUrl = receiptUrl || null;
      if (status) body.status = status;
    }
    const result = await run(() => (expense ? expensesApi.update(expense.id, body) : expensesApi.create(body)));
    if (result) {
      toast.success(
        expense
          ? t('expenses.form.toast.updated', { number: result.expenseNumber })
          : t('expenses.form.toast.recorded', { number: result.expenseNumber }),
      );
      onSaved();
    }
  };

  return (
    <Modal
      open
      title={expense ? t('expenses.form.editTitle', { number: expense.expenseNumber }) : t('expenses.form.newTitle')}
      subtitle={t('expenses.form.subtitle')}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('expenses.form.cancel')}
          </Button>
          <Button variant="primary" onClick={save} loading={submitting}>
            {expense ? t('expenses.form.saveChanges') : t('expenses.form.submit')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('expenses.form.date')} type="date" required value={date} error={fieldErrors.date} onChange={(event) => setDate(event.target.value)} />
        <SelectField
          label={t('expenses.form.account')}
          required
          value={accountId}
          placeholder={t('expenses.form.accountPlaceholder')}
          error={fieldErrors.accountId}
          options={refs.expenseAccounts.map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` }))}
          onChange={(event) => setAccountId(event.target.value)}
        />
      </div>
      <div className="form-grid">
        <SelectField
          label={t('expenses.form.paidThrough')}
          required
          value={paidThroughAccountId}
          placeholder={t('expenses.form.paidThroughPlaceholder')}
          error={fieldErrors.paidThroughAccountId}
          options={refs.bankAccounts.map((account) => ({
            value: account.id,
            label: typeof account.currentBalance === 'number' ? `${account.name} · ${formatCurrency(account.currentBalance)}` : account.name,
          }))}
          onChange={(event) => setPaidThroughAccountId(event.target.value)}
        />
        <SelectField
          label={t('expenses.form.vendor')}
          value={vendorId}
          placeholder={t('expenses.form.vendorPlaceholder')}
          error={fieldErrors.vendorId}
          options={refs.vendors.map((vendor) => ({ value: vendor.id, label: vendor.displayName }))}
          onChange={(event) => setVendorId(event.target.value)}
        />
      </div>
      <div className="form-grid">
        <TextField
          label={t('expenses.form.amount')}
          type="number"
          min="0"
          step="0.01"
          required
          value={amount}
          error={fieldErrors.amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <SelectField
          label={t('expenses.form.taxRate')}
          value={taxRate}
          error={fieldErrors.taxRate}
          options={TAX_OPTIONS}
          onChange={(event) => setTaxRate(event.target.value)}
        />
      </div>

      <div className="totals-list">
        <div>
          <span>{t('expenses.form.summaryAmount')}</span>
          <span>{formatCurrency(parsedAmount)}</span>
        </div>
        <div>
          <span>{t('expenses.form.summaryTax', { rate: formatPercent(parseNumber(taxRate, 0)) })}</span>
          <span>{formatCurrency(taxAmount)}</span>
        </div>
        <div className="grand">
          <span>{t('expenses.form.summaryTotal')}</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="form-section">
        <CheckboxField
          label={t('expenses.form.billable')}
          checked={isBillable}
          onChange={(event) => setIsBillable(event.target.checked)}
        />
        <SelectField
          label={t('expenses.form.customer')}
          value={customerId}
          placeholder={t('expenses.form.customerPlaceholder')}
          error={fieldErrors.customerId}
          hint={t('expenses.form.customerHint')}
          options={refs.customers.map((customer) => ({ value: customer.id, label: customer.displayName }))}
          onChange={(event) => setCustomerId(event.target.value)}
        />
      </div>

      <TextField
        label={t('expenses.form.reference')}
        value={reference}
        error={fieldErrors.reference}
        hint={t('expenses.form.referenceHint')}
        onChange={(event) => setReference(event.target.value)}
      />
      <TextAreaField label={t('expenses.form.notes')} value={notes} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />
      {expense ? (
        <p className="text-subtle small">
          {t('expenses.form.editNote')} <Badge tone="info">{expense.expenseNumber}</Badge>
        </p>
      ) : null}
    </Modal>
  );
}
