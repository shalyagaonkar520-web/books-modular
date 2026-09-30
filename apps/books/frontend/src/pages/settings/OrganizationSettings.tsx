import { useEffect, useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
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

/** App-content keys for the month names (January … December); translated at render. */
const MONTH_KEYS = Array.from({ length: 12 }, (_, index) => `settings.org.month.${index + 1}`);

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
  defaultTaxRate: string;
  defaultPaymentTermsDays: string;
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
    defaultTaxRate: org.defaultTaxRate !== undefined && org.defaultTaxRate !== null ? String(org.defaultTaxRate) : '',
    defaultPaymentTermsDays:
      org.defaultPaymentTermsDays !== undefined && org.defaultPaymentTermsDays !== null ? String(org.defaultPaymentTermsDays) : '',
  };
}

export function OrganizationSettings() {
  const { t } = useAppContent();
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

  if (loading) return <LoadingBlock label={t('settings.org.loading')} />;
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
    // Only send the defaults when filled in, so a blank field leaves the stored value alone.
    if (form.defaultTaxRate.trim() !== '') body.defaultTaxRate = Number(form.defaultTaxRate);
    if (form.defaultPaymentTermsDays.trim() !== '') body.defaultPaymentTermsDays = Number.parseInt(form.defaultPaymentTermsDays, 10);
    const saved = await run(() => orgApi.update(body));
    if (saved) {
      setData(saved);
      await refreshOrganization();
      toast.success(t('settings.org.saved'));
    }
  };

  return (
    <Card
      title={t('settings.org.title')}
      subtitle={t('settings.org.subtitle')}
      footer={
        <div className="row-between">
          <span className="text-muted small">{t('settings.org.baseCurrency', { currency: data.currency })}</span>
          <Button variant="primary" onClick={save} loading={submitting} disabled={form.name.trim().length < 2}>
            {t('settings.org.save')}
          </Button>
        </div>
      }
    >
      <div className="stack">
        <FormError message={error} />

        <div className="form-grid">
          <TextField label={t('settings.org.displayName')} value={form.name} onChange={set('name')} error={fieldErrors.name} required maxLength={200} />
          <TextField label={t('settings.org.legalName')} value={form.legalName} onChange={set('legalName')} error={fieldErrors.legalName} />
          <TextField
            label={t('settings.org.gstin')}
            value={form.gstin}
            onChange={set('gstin')}
            error={fieldErrors.gstin}
            maxLength={15}
            hint={t('settings.org.gstinHint')}
          />
          <TextField label={t('settings.org.pan')} value={form.pan} onChange={set('pan')} error={fieldErrors.pan} maxLength={10} hint={t('settings.org.panHint')} />
          <TextField label={t('settings.org.email')} type="email" value={form.email} onChange={set('email')} error={fieldErrors.email} />
          <TextField
            label={t('settings.org.phone')}
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={set('phone')}
            error={fieldErrors.phone}
            maxLength={10}
            hint={t('settings.org.phoneHint')}
          />
        </div>

        <div className="form-section">
          <h3 className="form-section-title">{t('settings.org.addressSection')}</h3>
          <TextAreaField label={t('settings.org.address')} value={form.address} rows={2} onChange={set('address')} error={fieldErrors.address} />
          <div className="form-grid">
            <TextField label={t('settings.org.city')} value={form.city} onChange={set('city')} error={fieldErrors.city} />
            <TextField label={t('settings.org.state')} value={form.state} onChange={set('state')} error={fieldErrors.state} />
            <TextField
              label={t('settings.org.postalCode')}
              type="text"
              inputMode="numeric"
              value={form.postalCode}
              onChange={set('postalCode')}
              error={fieldErrors.postalCode}
              maxLength={6}
              hint={t('settings.org.postalCodeHint')}
            />
            <TextField label={t('settings.org.country')} value={form.country} onChange={set('country')} error={fieldErrors.country} />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">{t('settings.org.defaultsSection')}</h3>
          <div className="form-grid">
            <SelectField
              label={t('settings.org.fiscalYearStart')}
              value={form.fiscalYearStartMonth}
              options={MONTH_KEYS.map((key, index) => ({ value: String(index + 1), label: t(key) }))}
              onChange={set('fiscalYearStartMonth')}
              error={fieldErrors.fiscalYearStartMonth}
              hint={t('settings.org.fiscalYearStartHint')}
            />
            <TextField
              label={t('settings.org.defaultTaxRate')}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={form.defaultTaxRate}
              onChange={set('defaultTaxRate')}
              error={fieldErrors.defaultTaxRate}
              hint={t('settings.org.defaultTaxRateHint')}
            />
            <TextField
              label={t('settings.org.defaultPaymentTerms')}
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              step={1}
              value={form.defaultPaymentTermsDays}
              onChange={set('defaultPaymentTermsDays')}
              error={fieldErrors.defaultPaymentTermsDays}
              hint={t('settings.org.defaultPaymentTermsHint')}
            />
          </div>
          <TextAreaField
            label={t('settings.org.invoiceTerms')}
            value={form.invoiceTerms}
            rows={3}
            onChange={set('invoiceTerms')}
            error={fieldErrors.invoiceTerms}
          />
          <TextAreaField
            label={t('settings.org.invoiceNotes')}
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
