import { useEffect, useId, useState, type FormEvent } from 'react';

import { contactsApi, projectsApi } from '@/api/endpoints';
import type { Project } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber } from '@/utils/format';

const BILLING_METHODS = [
  { value: 'hourly', label: 'Hourly rate' },
  { value: 'fixed', label: 'Fixed price' },
];

const PROJECT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
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
    if (saved) onSaved(project ? 'Project updated.' : 'Project created.');
  };

  return (
    <Modal
      open={open}
      title={project ? 'Edit project' : 'New project'}
      subtitle={project ? project.name : 'Track time against a customer project.'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            {project ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        {customers.error ? <FormError message={customers.error} /> : null}
        <div className="form-grid">
          <TextField label="Project name" required value={form.name} error={fieldErrors.name} onChange={(event) => set('name', event.target.value)} />
          <SelectField
            label="Customer"
            placeholder={customers.loading ? 'Loading customers…' : 'No customer'}
            options={(customers.data?.items ?? []).map((customer) => ({ value: customer.id, label: customer.displayName }))}
            value={form.customerId}
            error={fieldErrors.customerId}
            hint="A customer is required before time can be invoiced."
            onChange={(event) => set('customerId', event.target.value)}
          />
          <SelectField
            label="Billing method"
            required
            options={BILLING_METHODS}
            value={form.billingMethod}
            error={fieldErrors.billingMethod}
            onChange={(event) => set('billingMethod', event.target.value as 'hourly' | 'fixed')}
          />
          <TextField
            label="Hourly rate"
            type="number"
            step="0.01"
            min="0"
            value={form.hourlyRate}
            error={fieldErrors.hourlyRate}
            disabled={form.billingMethod !== 'hourly'}
            onChange={(event) => set('hourlyRate', event.target.value)}
          />
          <TextField
            label="Budget hours"
            type="number"
            step="0.25"
            min="0"
            value={form.budgetHours}
            error={fieldErrors.budgetHours}
            onChange={(event) => set('budgetHours', event.target.value)}
          />
          {project ? (
            <SelectField
              label="Status"
              options={PROJECT_STATUSES}
              value={form.status}
              error={fieldErrors.status}
              onChange={(event) => set('status', event.target.value as Project['status'])}
            />
          ) : null}
        </div>
        <TextAreaField
          label="Description"
          rows={2}
          value={form.description}
          error={fieldErrors.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </form>
    </Modal>
  );
}
