import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { orgApi } from '@/api/endpoints';
import type { Organization } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface FormState {
  name: string;
  legalName: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  fiscalYearStartMonth: string;
  invoiceTerms: string;
  invoiceNotes: string;
}

function toForm(org: Organization): FormState {
  return {
    name: org.name,
    legalName: org.legalName ?? '',
    gstin: org.gstin ?? '',
    pan: org.pan ?? '',
    email: org.email ?? '',
    phone: org.phone ?? '',
    address: org.address ?? '',
    city: org.city ?? '',
    state: org.state ?? '',
    postalCode: org.postalCode ?? '',
    country: org.country,
    fiscalYearStartMonth: String(org.fiscalYearStartMonth),
    invoiceTerms: org.invoiceTerms ?? '',
    invoiceNotes: org.invoiceNotes ?? '',
  };
}

export function OrganizationSettings() {
  const toast = useToast();
  const { refreshOrganization } = useAuth();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const { data, loading, error: loadError, reload, setData } = useAsync(() => orgApi.get(), []);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const set = (key: keyof FormState) => (event: { target: { value: string } }) =>
    setForm((current) => (current ? { ...current, [key]: event.target.value } : current));

  if (loading) return <LoadingBlock label="Loading organization profile…" />;
  if (loadError) return <ErrorBlock message={loadError} onRetry={reload} />;
  if (!data || !form) return null;

  const save = async () => {
    const body: Partial<Organization> = {
      name: form.name.trim(),
      legalName: form.legalName.trim() || null,
      gstin: form.gstin.trim().toUpperCase() || null,
      pan: form.pan.trim().toUpperCase() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      postalCode: form.postalCode.trim() || null,
      country: form.country.trim() || 'India',
      fiscalYearStartMonth: Number(form.fiscalYearStartMonth),
      invoiceTerms: form.invoiceTerms.trim() || null,
      invoiceNotes: form.invoiceNotes.trim() || null,
    };
    const saved = await run(() => orgApi.update(body));
    if (saved) {
      setData(saved);
      await refreshOrganization();
      toast.success('Organization profile saved.');
    }
  };

  return (
    <Card
      title="Organization profile"
      subtitle="These details appear on invoices, bills and payslips"
      footer={
        <div className="row-between">
          <span className="text-muted small">Base currency: {data.currency}</span>
          <Button variant="primary" onClick={save} loading={submitting} disabled={form.name.trim().length < 2}>
            Save changes
          </Button>
        </div>
      }
    >
      <div className="stack">
        <FormError message={error} />

        <div className="form-grid">
          <TextField label="Display name" value={form.name} onChange={set('name')} error={fieldErrors.name} required maxLength={200} />
          <TextField label="Legal name" value={form.legalName} onChange={set('legalName')} error={fieldErrors.legalName} />
          <TextField
            label="GSTIN"
            value={form.gstin}
            onChange={set('gstin')}
            error={fieldErrors.gstin}
            maxLength={15}
            hint="15 characters, e.g. 29AABCR1234F1Z5"
          />
          <TextField label="PAN" value={form.pan} onChange={set('pan')} error={fieldErrors.pan} maxLength={10} hint="10 characters, e.g. AABCR1234F" />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={fieldErrors.email} />
          <TextField
            label="Phone"
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={set('phone')}
            error={fieldErrors.phone}
            maxLength={10}
            hint="10 digits, no spaces or country code"
          />
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Registered address</h3>
          <TextAreaField label="Address" value={form.address} rows={2} onChange={set('address')} error={fieldErrors.address} />
          <div className="form-grid">
            <TextField label="City" value={form.city} onChange={set('city')} error={fieldErrors.city} />
            <TextField label="State" value={form.state} onChange={set('state')} error={fieldErrors.state} />
            <TextField
              label="Postal code"
              type="text"
              inputMode="numeric"
              value={form.postalCode}
              onChange={set('postalCode')}
              error={fieldErrors.postalCode}
              maxLength={6}
              hint="6 digits"
            />
            <TextField label="Country" value={form.country} onChange={set('country')} error={fieldErrors.country} />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Accounting and invoicing defaults</h3>
          <div className="form-grid">
            <SelectField
              label="Fiscal year starts in"
              value={form.fiscalYearStartMonth}
              options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
              onChange={set('fiscalYearStartMonth')}
              error={fieldErrors.fiscalYearStartMonth}
              hint="Used for fiscal-year reports and the dashboard"
            />
          </div>
          <TextAreaField
            label="Default invoice terms"
            value={form.invoiceTerms}
            rows={3}
            onChange={set('invoiceTerms')}
            error={fieldErrors.invoiceTerms}
          />
          <TextAreaField
            label="Default invoice notes"
            value={form.invoiceNotes}
            rows={3}
            onChange={set('invoiceNotes')}
            error={fieldErrors.invoiceNotes}
          />
        </div>
      </div>
    </Card>
  );
}
