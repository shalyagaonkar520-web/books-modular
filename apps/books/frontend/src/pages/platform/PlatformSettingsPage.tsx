import { platformApi } from '@/api/platform';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { CheckboxField } from '@/components/ui/Field';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { titleCase } from '@/utils/format';

export function PlatformSettingsPage() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync((signal) => platformApi.settings.get(signal), []);
  const saveSubmit = useSubmit();

  const toggleSignup = async (next: boolean) => {
    const updated = await saveSubmit.run(() => platformApi.settings.update({ allowPublicSignup: next }));
    if (updated) {
      setData(updated);
      toast.success(next ? 'Public tenant signup is now enabled.' : 'Public tenant signup is now disabled.');
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
          <Card title="Tenant signup" subtitle="Control whether new organizations can self-register.">
            <FormError message={saveSubmit.error} />
            <CheckboxField
              label="Allow public tenant signup"
              hint="When enabled, anyone can create a new organization from the public signup page."
              checked={data.allowPublicSignup}
              disabled={saveSubmit.submitting}
              onChange={(event) => void toggleSignup(event.target.checked)}
            />
          </Card>

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
