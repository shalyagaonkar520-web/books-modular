import { useState } from 'react';

import { platformApi, type PlatformSettings, type UpdatePlatformSettingsBody } from '@/api/platform';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CheckboxField, TextField } from '@/components/ui/Field';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { RazorpayIntegrationSettings, type RazorpayIntegrationApi } from '@/pages/settings/RazorpayIntegrationSettings';
import { titleCase } from '@/utils/format';

// The Razorpay keys are platform-wide, so they are set here and nowhere else.
const RAZORPAY_KEYS_API: RazorpayIntegrationApi = {
  loadStatus: platformApi.razorpay.status,
  connect: platformApi.razorpay.connect,
  disconnect: platformApi.razorpay.disconnect,
};

export function PlatformSettingsPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync((signal) => platformApi.settings.get(signal), []);
  const saveSubmit = useSubmit();

  const toggle = async (key: 'allowPublicSignup' | 'requireOrgApproval', next: boolean) => {
    const updated = await saveSubmit.run(() => platformApi.settings.update({ [key]: next }));
    if (updated) {
      setData(updated);
      if (key === 'allowPublicSignup') {
        toast.success(next ? 'Public tenant signup is now enabled.' : 'Public tenant signup is now disabled.');
      } else {
        toast.success(
          next
            ? 'New organizations now need your approval before they can sign in.'
            : 'New organizations can sign in straight away.',
        );
      }
    } else if (saveSubmit.errorRef.current) {
      toast.error(saveSubmit.errorRef.current);
    }
  };

  const chip = (label: string, ok: boolean) => (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{ok ? <Badge tone="success">Configured</Badge> : <Badge tone="warning">Not configured</Badge>}</dd>
    </div>
  );

  return (
    <>
      <PageHeader title="Settings" subtitle="Platform-wide configuration and integration status." />

      {loading ? (
        <div className="card">
          <LoadingBlock label="Loading settings…" />
        </div>
      ) : error ? (
        <div className="card">
          <ErrorBlock message={error} onRetry={reload} />
        </div>
      ) : data ? (
        <div className="stack">
          <Card title="Tenant signup" subtitle="Control whether new organizations can self-register, and whether they need approval first.">
            <FormError message={saveSubmit.error} />
            <CheckboxField
              label="Allow public tenant signup"
              hint="When enabled, anyone can create a new organization from the public signup page."
              checked={data.allowPublicSignup}
              disabled={saveSubmit.submitting}
              onChange={(event) => void toggle('allowPublicSignup', event.target.checked)}
            />
            <CheckboxField
              label="Require admin approval for new organizations"
              hint="New self-registered organizations stay pending, and their users cannot sign in, until a platform admin approves them."
              checked={Boolean(data.requireOrgApproval)}
              disabled={saveSubmit.submitting}
              onChange={(event) => void toggle('requireOrgApproval', event.target.checked)}
            />
          </Card>

          <FreeTrialCard settings={data} onSaved={setData} />

          <NewOrgDefaultsCard settings={data} onSaved={setData} />

          <RazorpayIntegrationSettings api={RAZORPAY_KEYS_API} />

          <Card title="Environment & integrations" subtitle="Read-only status of the running deployment.">
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Environment</dt>
                <dd>
                  <Badge tone={data.environment === 'production' ? 'danger' : 'info'}>
                    {titleCase(data.environment) || 'Unknown'}
                  </Badge>
                </dd>
              </div>
              {chip('Razorpay', data.razorpayConfigured)}
              {chip('SMTP (email)', data.smtpConfigured)}
            </dl>
          </Card>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Defaults for new organizations
// ---------------------------------------------------------------------------

interface DefaultsForm {
  defaultTaxRate: string;
  defaultPaymentTermsDays: string;
  defaultCurrency: string;
}

function toDefaultsForm(settings: PlatformSettings): DefaultsForm {
  return {
    defaultTaxRate: typeof settings.defaultTaxRate === 'number' ? String(settings.defaultTaxRate) : '',
    defaultPaymentTermsDays: typeof settings.defaultPaymentTermsDays === 'number' ? String(settings.defaultPaymentTermsDays) : '',
    defaultCurrency: settings.defaultCurrency ?? '',
  };
}

function validateDefaults(form: DefaultsForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const rate = Number(form.defaultTaxRate);
  if (!form.defaultTaxRate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    errors.defaultTaxRate = 'Enter a percentage between 0 and 100.';
  }
  const days = Number(form.defaultPaymentTermsDays);
  if (!form.defaultPaymentTermsDays.trim() || !Number.isInteger(days) || days < 0 || days > 365) {
    errors.defaultPaymentTermsDays = 'Enter whole days between 0 and 365.';
  }
  if (!/^[A-Z]{3}$/.test(form.defaultCurrency.trim())) errors.defaultCurrency = 'Use a 3-letter code, e.g. INR.';
  return errors;
}

function NewOrgDefaultsCard({ settings, onSaved }: { settings: PlatformSettings; onSaved: (settings: PlatformSettings) => void }) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [form, setForm] = useState<DefaultsForm>(() => toDefaultsForm(settings));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const set = (key: keyof DefaultsForm) => (event: { target: { value: string } }) => {
    const value = key === 'defaultCurrency' ? event.target.value.toUpperCase() : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const errorFor = (key: keyof DefaultsForm) => localErrors[key] ?? fieldErrors[key];

  const save = async () => {
    const errors = validateDefaults(form);
    setLocalErrors(errors);
    if (Object.keys(errors).length) return;
    const body: UpdatePlatformSettingsBody = {
      defaultTaxRate: Number(form.defaultTaxRate),
      defaultPaymentTermsDays: Number(form.defaultPaymentTermsDays),
      defaultCurrency: form.defaultCurrency.trim(),
    };
    const updated = await run(() => platformApi.settings.update(body));
    if (updated) {
      setForm(toDefaultsForm(updated));
      onSaved(updated);
      toast.success('Defaults for new organizations saved.');
    }
  };

  return (
    <Card
      title="Defaults for new organizations"
      subtitle="Applied when an organization is created. Existing organizations keep their own settings."
    >
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FormError message={error} />
        <div className="form-grid-3">
          <TextField
            label="Default tax rate (%)"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="0.01"
            required
            value={form.defaultTaxRate}
            error={errorFor('defaultTaxRate')}
            hint="0 – 100"
            onChange={set('defaultTaxRate')}
          />
          <TextField
            label="Default payment terms (days)"
            type="number"
            inputMode="numeric"
            min={0}
            max={365}
            step={1}
            required
            value={form.defaultPaymentTermsDays}
            error={errorFor('defaultPaymentTermsDays')}
            hint="0 – 365"
            onChange={set('defaultPaymentTermsDays')}
          />
          <TextField
            label="Default currency"
            required
            maxLength={3}
            autoCapitalize="characters"
            value={form.defaultCurrency}
            error={errorFor('defaultCurrency')}
            hint="3-letter ISO code, e.g. INR"
            onChange={set('defaultCurrency')}
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={() => {
              setForm(toDefaultsForm(settings));
              setLocalErrors({});
            }}
          >
            Reset
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            Save defaults
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Free trial
// ---------------------------------------------------------------------------

const TRIAL_DAYS_MAX = 90;
const DEFAULT_TRIAL_DAYS = 3;

function FreeTrialCard({ settings, onSaved }: { settings: PlatformSettings; onSaved: (settings: PlatformSettings) => void }) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const initial = String(settings.trialDays ?? DEFAULT_TRIAL_DAYS);
  const [value, setValue] = useState(initial);
  const [localError, setLocalError] = useState<string | null>(null);

  const save = async () => {
    const days = Number(value);
    if (!value.trim() || !Number.isInteger(days) || days < 0 || days > TRIAL_DAYS_MAX) {
      setLocalError(`Enter whole days between 0 and ${TRIAL_DAYS_MAX}.`);
      return;
    }
    setLocalError(null);
    const updated = await run(() => platformApi.settings.update({ trialDays: days }));
    if (updated) {
      setValue(String(updated.trialDays ?? days));
      onSaved(updated);
      toast.success(`New organizations now get a ${days}-day free trial.`);
    }
  };

  return (
    <Card
      title="Free trial"
      subtitle="Approved organizations get every module for this many days. After that, the app is locked until their admin's plan request is approved."
    >
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FormError message={localError || fieldErrors.trialDays ? null : error} />
        <div className="form-grid-3">
          <TextField
            label="Trial length (days)"
            type="number"
            inputMode="numeric"
            min={0}
            max={TRIAL_DAYS_MAX}
            step={1}
            required
            value={value}
            error={localError ?? fieldErrors.trialDays}
            hint={`0 – ${TRIAL_DAYS_MAX}. Existing trials are not changed; extend one from the organization.`}
            onChange={(event) => {
              setValue(event.target.value);
              setLocalError(null);
            }}
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="primary" type="submit" loading={submitting} disabled={value === initial}>
            Save trial length
          </Button>
        </div>
      </form>
    </Card>
  );
}
