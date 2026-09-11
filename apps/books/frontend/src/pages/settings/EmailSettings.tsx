import { useEffect, useState } from 'react';
import { MailCheck, Send } from 'lucide-react';

import { orgApi } from '@/api/endpoints';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

interface FormState {
  host: string;
  port: string;
  username: string;
  password: string;
  senderName: string;
}

const EMPTY: FormState = { host: '', port: '587', username: '', password: '', senderName: '' };

export function EmailSettings() {
  const toast = useToast();
  const settings = useAsync(() => orgApi.smtpSettings(), []);
  const { submitting, error, fieldErrors, run, setError } = useSubmit();
  const testSubmit = useSubmit();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (!settings.data) return;
    setForm({
      host: settings.data.host,
      port: String(settings.data.port),
      username: settings.data.username,
      password: '',
      senderName: settings.data.senderName,
    });
    setTestTo((current) => current || settings.data!.username);
  }, [settings.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const port = Number.parseInt(form.port, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      setError('Port must be a number between 1 and 65535.');
      return;
    }
    const saved = await run(() =>
      orgApi.updateSmtpSettings({
        host: form.host.trim(),
        port,
        username: form.username.trim(),
        password: form.password.trim() || undefined,
        senderName: form.senderName.trim(),
      }),
    );
    if (saved) {
      toast.success('Sender account saved and verified.');
      setForm((current) => ({ ...current, password: '' }));
      settings.reload();
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) {
      toast.error('Enter an address to send the test to.');
      return;
    }
    const result = await testSubmit.run(() => orgApi.sendSmtpTest(testTo.trim()));
    if (result) toast.success(result.message);
  };

  if (settings.loading) return <LoadingBlock label="Loading email settings…" />;
  if (settings.error) return <ErrorBlock message={settings.error} onRetry={settings.reload} />;

  return (
    <div className="stack">
      <Card
        title="Outbound email (SMTP)"
        subtitle="The account invites, invoices and payment reminders are sent from"
        actions={
          settings.data?.configured ? (
            <Badge tone="success">Configured</Badge>
          ) : (
            <Badge tone="warning">Not configured</Badge>
          )
        }
      >
        <div className="stack">
          <FormError message={error} />
          <div className="form-grid">
            <TextField
              label="Sender email"
              type="email"
              required
              value={form.username}
              error={fieldErrors.username}
              hint="Emails are sent from this address"
              onChange={(event) => set('username', event.target.value)}
            />
            <TextField
              label="Sender name"
              required
              value={form.senderName}
              error={fieldErrors.senderName}
              hint="Shown as the From name in the inbox"
              onChange={(event) => set('senderName', event.target.value)}
            />
            <TextField
              label="App password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              error={fieldErrors.password}
              hint={settings.data?.configured ? 'Leave blank to keep the saved password' : 'Gmail requires an app password, not your normal one'}
              onChange={(event) => set('password', event.target.value)}
            />
            <TextField
              label="SMTP host"
              required
              value={form.host}
              error={fieldErrors.host}
              onChange={(event) => set('host', event.target.value)}
            />
            <TextField
              label="SMTP port"
              inputMode="numeric"
              required
              value={form.port}
              error={fieldErrors.port}
              hint="587 for TLS"
              onChange={(event) => set('port', event.target.value)}
            />
          </div>
          <p className="small text-muted">
            The details are checked against the mail server before they are saved, so a wrong password is caught here rather
            than silently breaking every outbound email.
          </p>
          <div>
            <Button variant="primary" loading={submitting} icon={<MailCheck size={15} />} onClick={() => void save()}>
              Save and verify
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Send a test email" subtitle="Confirm delivery actually reaches an inbox">
        <div className="stack">
          <FormError message={testSubmit.error} />
          <div className="form-grid">
            <TextField
              label="Send to"
              type="email"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
          </div>
          <div>
            <Button
              variant="secondary"
              loading={testSubmit.submitting}
              disabled={!settings.data?.configured}
              icon={<Send size={15} />}
              onClick={() => void sendTest()}
            >
              Send test email
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
