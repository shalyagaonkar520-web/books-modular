import { useEffect, useState } from 'react';
import { MailCheck, Send } from 'lucide-react';

import { orgApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
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
  const { t } = useAppContent();
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
      setError(t('settings.email.portInvalid'));
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
      toast.success(t('settings.email.saved'));
      setForm((current) => ({ ...current, password: '' }));
      settings.reload();
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) {
      toast.error(t('settings.email.testToRequired'));
      return;
    }
    const result = await testSubmit.run(() => orgApi.sendSmtpTest(testTo.trim()));
    if (result) toast.success(result.message);
  };

  if (settings.loading) return <LoadingBlock label={t('settings.email.loading')} />;
  if (settings.error) return <ErrorBlock message={settings.error} onRetry={settings.reload} />;

  return (
    <div className="stack">
      <Card
        title={t('settings.email.title')}
        subtitle={t('settings.email.subtitle')}
        actions={
          settings.data?.configured ? (
            <Badge tone="success">{t('settings.email.configured')}</Badge>
          ) : (
            <Badge tone="warning">{t('settings.email.notConfigured')}</Badge>
          )
        }
      >
        <div className="stack">
          <FormError message={error} />
          <div className="form-grid">
            <TextField
              label={t('settings.email.senderEmail')}
              type="email"
              required
              value={form.username}
              error={fieldErrors.username}
              hint={t('settings.email.senderEmailHint')}
              onChange={(event) => set('username', event.target.value)}
            />
            <TextField
              label={t('settings.email.senderName')}
              required
              value={form.senderName}
              error={fieldErrors.senderName}
              hint={t('settings.email.senderNameHint')}
              onChange={(event) => set('senderName', event.target.value)}
            />
            <TextField
              label={t('settings.email.appPassword')}
              type="password"
              autoComplete="new-password"
              value={form.password}
              error={fieldErrors.password}
              hint={settings.data?.configured ? t('settings.email.appPasswordKeep') : t('settings.email.appPasswordHint')}
              onChange={(event) => set('password', event.target.value)}
            />
            <TextField
              label={t('settings.email.host')}
              required
              value={form.host}
              error={fieldErrors.host}
              onChange={(event) => set('host', event.target.value)}
            />
            <TextField
              label={t('settings.email.port')}
              inputMode="numeric"
              required
              value={form.port}
              error={fieldErrors.port}
              hint={t('settings.email.portHint')}
              onChange={(event) => set('port', event.target.value)}
            />
          </div>
          <p className="small text-muted">{t('settings.email.verifyNote')}</p>
          <div>
            <Button variant="primary" loading={submitting} icon={<MailCheck size={15} />} onClick={() => void save()}>
              {t('settings.email.save')}
            </Button>
          </div>
        </div>
      </Card>

      <Card title={t('settings.email.test.title')} subtitle={t('settings.email.test.subtitle')}>
        <div className="stack">
          <FormError message={testSubmit.error} />
          <div className="form-grid">
            <TextField
              label={t('settings.email.test.to')}
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
              {t('settings.email.test.submit')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
