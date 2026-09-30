import { useEffect, useId, useState, type FormEvent } from 'react';

import { contactsApi, projectsApi } from '@/api/endpoints';
import type { Project } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber } from '@/utils/format';

/** `label` values are content keys; resolve them with `t()` at render. */
const BILLING_METHODS = [
  { value: 'hourly', label: 'timeTracking.projectModal.billing.hourly' },
  { value: 'fixed', label: 'timeTracking.projectModal.billing.fixed' },
];

const PROJECT_STATUSES = [
  { value: 'active', label: 'timeTracking.projectStatus.active' },
  { value: 'on_hold', label: 'timeTracking.projectStatus.onHold' },
  { value: 'completed', label: 'timeTracking.projectStatus.completed' },
];

interface FormState {
  name: string;
  customerId: string;
  description: string;
  billingMethod: 'hourly' | 'fixed';
  hourlyRate: string;
  budgetHours: string;
  status: Project['status'];
}

const BLANK: FormState = { name: '', customerId: '', description: '', billingMethod: 'hourly', hourlyRate: '0', budgetHours: '0', status: 'active' };

interface ProjectModalProps {
  open: boolean;
  /** `null` opens the modal in "new project" mode. */
  project: Project | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function ProjectModal({ open, project, onClose, onSaved }: ProjectModalProps) {
  const { t } = useAppContent();
  const formId = useId();
  const { submitting, error, fieldErrors, run, reset } = useSubmit();
  const [form, setForm] = useState<FormState>(BLANK);

  const customers = useAsync(() => contactsApi.list({ type: 'customer', page_size: 200 }), []);

  useEffect(() => {
    if (!open) return;
    reset();
    setForm(
      project
        ? {
            name: project.name,
            customerId: project.customerId ?? '',
            description: project.description ?? '',
            billingMethod: project.billingMethod,
            hourlyRate: String(project.hourlyRate),
            budgetHours: String(project.budgetHours),
            status: project.status,
          }
        : BLANK,
    );
  }, [open, project, reset]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      customerId: form.customerId || null,
      description: form.description.trim() || null,
      billingMethod: form.billingMethod,
      hourlyRate: parseNumber(form.hourlyRate),
      budgetHours: parseNumber(form.budgetHours),
    };
    const saved = await run(() =>
      project ? projectsApi.update(project.id, { ...payload, status: form.status }) : projectsApi.create(payload),
    );
    if (saved) onSaved(project ? t('timeTracking.projectModal.toast.updated') : t('timeTracking.projectModal.toast.created'));
  };

  return (
    <Modal
      open={open}
      title={project ? t('timeTracking.projectModal.editTitle') : t('timeTracking.projectModal.newTitle')}
      subtitle={project ? project.name : t('timeTracking.projectModal.newSubtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('timeTracking.projectModal.cancel')}
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            {project ? t('timeTracking.projectModal.saveChanges') : t('timeTracking.projectModal.create')}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        {customers.error ? <FormError message={customers.error} /> : null}
        <div className="form-grid">
          <TextField label={t('timeTracking.projectModal.name')} required value={form.name} error={fieldErrors.name} onChange={(event) => set('name', event.target.value)} />
          <SelectField
            label={t('timeTracking.projectModal.customer')}
            placeholder={customers.loading ? t('timeTracking.projectModal.loadingCustomers') : t('timeTracking.projectModal.noCustomer')}
            options={(customers.data?.items ?? []).map((customer) => ({ value: customer.id, label: customer.displayName }))}
            value={form.customerId}
            error={fieldErrors.customerId}
            hint={t('timeTracking.projectModal.customerHint')}
            onChange={(event) => set('customerId', event.target.value)}
          />
          <SelectField
            label={t('timeTracking.projectModal.billingMethod')}
            required
            options={BILLING_METHODS.map((option) => ({ ...option, label: t(option.label) }))}
            value={form.billingMethod}
            error={fieldErrors.billingMethod}
            onChange={(event) => set('billingMethod', event.target.value as 'hourly' | 'fixed')}
          />
          <TextField
            label={t('timeTracking.projectModal.hourlyRate')}
            type="number"
            step="0.01"
            min="0"
            value={form.hourlyRate}
            error={fieldErrors.hourlyRate}
            disabled={form.billingMethod !== 'hourly'}
            onChange={(event) => set('hourlyRate', event.target.value)}
          />
          <TextField
            label={t('timeTracking.projectModal.budgetHours')}
            type="number"
            step="0.25"
            min="0"
            value={form.budgetHours}
            error={fieldErrors.budgetHours}
            onChange={(event) => set('budgetHours', event.target.value)}
          />
          {project ? (
            <SelectField
              label={t('timeTracking.projectModal.status')}
              options={PROJECT_STATUSES.map((option) => ({ ...option, label: t(option.label) }))}
              value={form.status}
              error={fieldErrors.status}
              onChange={(event) => set('status', event.target.value as Project['status'])}
            />
          ) : null}
        </div>
        <TextAreaField
          label={t('timeTracking.projectModal.description')}
          rows={2}
          value={form.description}
          error={fieldErrors.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </form>
    </Modal>
  );
}
