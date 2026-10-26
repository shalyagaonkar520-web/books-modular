/** Mileage claim: distance x rate per km, recorded as a travel expense. */
import { useState } from 'react';

import { mileageApi } from '@/api/operations';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';
import type { ExpenseRefs } from '@/pages/purchases/ExpenseFormModal';
import { formatCurrency, parseNumber, round2, todayIso } from '@/utils/format';

import { BranchSelect, ProjectSelect } from './BranchSelect';

export function MileageModal({ refs, onClose, onSaved }: { refs: ExpenseRefs; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { organization } = useAuth();
  const defaultRate = organization?.mileageRate ?? null;
  const [form, setForm] = useState({
    date: todayIso(),
    distance: '',
    rate: defaultRate ? String(defaultRate) : '',
    paidThrough: refs.bankAccounts[0]?.id ?? '',
    from: '',
    to: '',
    purpose: '',
    customerId: '',
    isBillable: false,
    branchId: '',
    projectId: '',
  });
  const { submitting, error, run, setError } = useSubmit();
  const total = round2(parseNumber(form.distance, 0) * parseNumber(form.rate, 0));
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const save = async () => {
    if (parseNumber(form.distance, 0) <= 0) {
      setError(t('ops.mileage.needDistance'));
      return;
    }
    if (form.isBillable && !form.customerId) {
      setError(t('expenses.form.validate.customer'));
      return;
    }
    const saved = await run(() =>
      mileageApi.create({
        date: form.date,
        distanceKm: parseNumber(form.distance, 0),
        ratePerKm: parseNumber(form.rate, 0) > 0 ? parseNumber(form.rate, 0) : null,
        paidThroughAccountId: form.paidThrough,
        fromPlace: form.from.trim() || null,
        toPlace: form.to.trim() || null,
        purpose: form.purpose.trim() || null,
        customerId: form.customerId || null,
        isBillable: form.isBillable,
        branchId: form.branchId || null,
        projectId: form.projectId || null,
      }),
    );
    if (saved) {
      toast.success(t('ops.mileage.saved', { number: saved.expenseNumber, amount: formatCurrency(saved.total) }));
      onSaved();
    }
  };

  return (
    <Modal
      open
      title={t('ops.mileage.title')}
      subtitle={t('ops.mileage.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={save}>
            {t('ops.mileage.submit')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('expenses.form.date')} type="date" value={form.date} onChange={set('date')} />
        <SelectField
          label={t('expenses.form.paidThrough')}
          value={form.paidThrough}
          options={refs.bankAccounts.map((a) => ({ value: a.id, label: a.name }))}
          onChange={set('paidThrough')}
        />
        <TextField label={t('ops.mileage.distance')} type="number" min="0" step="0.1" value={form.distance} onChange={set('distance')} />
        <TextField
          label={t('ops.mileage.rate')}
          type="number"
          min="0"
          step="0.01"
          value={form.rate}
          hint={defaultRate ? t('ops.mileage.rateDefault', { rate: formatCurrency(defaultRate) }) : t('ops.mileage.rateHint')}
          onChange={set('rate')}
        />
        <TextField label={t('ops.mileage.from')} value={form.from} maxLength={120} onChange={set('from')} />
        <TextField label={t('ops.mileage.to')} value={form.to} maxLength={120} onChange={set('to')} />
      </div>
      <TextField label={t('ops.mileage.purpose')} value={form.purpose} maxLength={500} onChange={set('purpose')} />
      <div className="form-grid">
        <BranchSelect value={form.branchId} onChange={(v) => setForm({ ...form, branchId: v })} />
        <ProjectSelect value={form.projectId} onChange={(v) => setForm({ ...form, projectId: v })} />
        <SelectField
          label={t('expenses.form.customer')}
          value={form.customerId}
          placeholder={t('expenses.form.customerPlaceholder')}
          options={refs.customers.map((c) => ({ value: c.id, label: c.displayName }))}
          onChange={set('customerId')}
        />
      </div>
      <CheckboxField label={t('expenses.form.billable')} checked={form.isBillable} onChange={(e) => setForm({ ...form, isBillable: e.target.checked })} />
      <div className="totals-list">
        <div className="grand">
          <span>{t('ops.mileage.total')}</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </Modal>
  );
}
