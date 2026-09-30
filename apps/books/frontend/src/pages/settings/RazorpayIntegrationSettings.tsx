import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link,
  RefreshCw,
  ShieldCheck,
  Unlink,
  XCircle,
} from 'lucide-react';

import { razorpaySyncApi, type IntegrationStatus, type SyncLog } from '@/api/razorpay';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime } from '@/utils/format';

function syncTone(status: SyncLog['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'partial') return 'warning' as const;
  if (status === 'failed') return 'danger' as const;
  return 'info' as const;
}

function LastSync({ log }: { log?: SyncLog | null }) {
  const { t } = useAppContent();
  if (!log) return <span className="small">{t('settings.razorpay.neverSynced')}</span>;
  return (
    <div className="cell-stack">
      <span>{formatDateTime(log.completed_at ?? log.started_at)}</span>
      <span className="small">
        {t('settings.razorpay.syncCounts', { created: log.records_created, updated: log.records_updated, skipped: log.records_skipped })}
      </span>
    </div>
  );
}

export function RazorpayIntegrationSettings() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [mode, setMode] = useState<'test' | 'live'>('test');

  const { data, loading, error, reload, setData } = useAsync<IntegrationStatus>(
    async () => {
      const status = await razorpaySyncApi.getIntegrationStatus();
      if (!status.configured) {
        setFormOpen(true);
      }
      setMode(status.mode || 'test');
      return status;
    },
    [],
  );

  const runSync = useCallback(
    async (full: boolean) => {
      setSyncing(true);
      try {
        const result = await razorpaySyncApi.sync(full);
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
        const refreshed = await razorpaySyncApi.getIntegrationStatus();
        setData(refreshed);
      } catch {
        toast.error(t('settings.razorpay.syncUnreachable'));
      } finally {
        setSyncing(false);
      }
    },
    [setData, toast, t],
  );

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyId.trim() || !keySecret.trim()) {
      toast.error(t('settings.razorpay.keysRequired'));
      return;
    }
    setConnecting(true);
    try {
      const res = await razorpaySyncApi.connectIntegration({
        key_id: keyId.trim(),
        key_secret: keySecret.trim(),
        webhook_secret: webhookSecret.trim(),
        mode,
      });
      if (res.connected) {
        toast.success(res.message);
        setFormOpen(false);
        setKeySecret('');
      } else {
        toast.notify(res.message, 'warning');
      }
      setData(res.status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings.razorpay.connectFailed');
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t('settings.razorpay.disconnectConfirm'))) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await razorpaySyncApi.disconnectIntegration();
      toast.notify(res.message, 'info');
      setData(res.status);
      setFormOpen(true);
      setKeySecret('');
      setKeyId('');
    } catch {
      toast.error(t('settings.razorpay.disconnectFailed'));
    } finally {
      setDisconnecting(false);
    }
  };

  const copyWebhookUrl = () => {
    const origin = window.location.origin;
    const url = `${origin}${data?.webhook_path || '/api/razorpay/webhook'}`;
    void navigator.clipboard.writeText(url);
    toast.success(t('settings.razorpay.webhookCopied'));
  };

  if (loading) return <LoadingBlock label={t('settings.razorpay.loading')} />;
  if (error || !data) return <ErrorBlock message={error ?? t('settings.razorpay.loadFailed')} onRetry={reload} />;

  const connected = data.connected;
  const statusIcon = connected ? (
    <CheckCircle2 size={18} color="var(--color-success, #16a34a)" aria-hidden="true" />
  ) : data.configured ? (
    <AlertTriangle size={18} color="var(--color-warning, #eab308)" aria-hidden="true" />
  ) : (
    <XCircle size={18} color="var(--color-danger, #dc2626)" aria-hidden="true" />
  );

  return (
    <div className="stack" style={{ gap: '24px' }}>
      {/* Overview & Actions Card */}
      <Card
        title={t('settings.razorpay.title')}
        subtitle={t('settings.razorpay.subtitle')}
        actions={
          <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
            {connected && !formOpen && isAdmin ? (
              <Button variant="ghost" size="sm" icon={<KeyRound size={14} />} onClick={() => setFormOpen(true)}>
                {t('settings.razorpay.editCredentials')}
              </Button>
            ) : null}

            {connected && isAdmin ? (
              <Button
                variant="ghost"
                size="sm"
                icon={<Unlink size={14} />}
                loading={disconnecting}
                onClick={handleDisconnect}
                style={{ color: 'var(--color-danger, #dc2626)' }}
              >
                {t('settings.razorpay.disconnect')}
              </Button>
            ) : null}

            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => runSync(true)}
              loading={syncing}
              disabled={!connected}
              title={connected ? t('settings.razorpay.fullReimportHint') : t('settings.razorpay.connectFirst')}
            >
              {t('settings.razorpay.fullReimport')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => runSync(false)}
              loading={syncing}
              disabled={!connected}
            >
              {t('settings.razorpay.syncNow')}
            </Button>
          </div>
        }
      >
        <div className="detail-grid">
          <div className="detail-item">
            <span className="detail-label">{t('settings.razorpay.connectionStatus')}</span>
            <span className="detail-value row" style={{ gap: '6px' }}>
              {statusIcon}
              <Badge tone={connected ? 'success' : data.configured ? 'warning' : 'neutral'}>
                {connected
                  ? data.reachable
                    ? t('settings.razorpay.status.connectedLive')
                    : t('settings.razorpay.status.connectedTest')
                  : data.configured
                  ? t('settings.razorpay.status.unreachable')
                  : t('settings.razorpay.status.notConnected')}
              </Badge>
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">{t('settings.razorpay.gatewayMode')}</span>
            <span className="detail-value">
              <Badge tone={data.mode === 'live' ? 'danger' : 'info'}>
                {data.mode === 'live' ? t('settings.razorpay.mode.live') : t('settings.razorpay.mode.test')}
              </Badge>
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">{t('settings.razorpay.keyId')}</span>
            <span className="detail-value mono">{data.key_id_masked || t('settings.razorpay.notConfigured')}</span>
          </div>

          <div className="detail-item">
            <span className="detail-label">{t('settings.razorpay.webhookVerification')}</span>
            <span className="detail-value">
              <Badge tone={data.webhook_configured ? 'success' : 'warning'}>
                {data.webhook_configured ? t('settings.razorpay.webhook.configured') : t('settings.razorpay.webhook.missing')}
              </Badge>
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">{t('settings.razorpay.lastSuccessfulSync')}</span>
            <span className="detail-value">
              <LastSync log={data.last_successful_sync} />
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">{t('settings.razorpay.lastExecution')}</span>
            <span className="detail-value">
              {data.last_sync ? (
                <div className="cell-stack">
                  <Badge tone={syncTone(data.last_sync.status)}>{data.last_sync.status}</Badge>
                  {data.last_sync.error_message ? (
                    <span className="small text-muted">{data.last_sync.error_message}</span>
                  ) : null}
                </div>
              ) : (
                <span className="small text-muted">{t('settings.razorpay.noRuns')}</span>
              )}
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">{t('settings.razorpay.transactionsImported')}</span>
            <span className="detail-value num">{data.transactions_imported.toLocaleString('en-IN')}</span>
          </div>

          <div className="detail-item">
            <span className="detail-label">{t('settings.razorpay.autoSync')}</span>
            <span className="detail-value">
              {data.auto_sync_enabled ? (
                <Badge tone="success">{t('settings.razorpay.autoSyncEvery', { minutes: data.sync_interval_minutes })}</Badge>
              ) : (
                <Badge tone="neutral">{t('settings.razorpay.autoSyncDisabled')}</Badge>
              )}
            </span>
          </div>
        </div>

        {data.error ? (
          <div className="notification notification-warning" role="status" style={{ marginTop: '16px' }}>
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{data.error}</span>
          </div>
        ) : null}
      </Card>

      {!isAdmin ? (
        <div className="notification notification-info" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{t('settings.razorpay.adminOnly')}</span>
        </div>
      ) : null}

      {/* Connection Credentials Form Card */}
      {(!connected || formOpen) && isAdmin && (
        <Card
          title={t('settings.razorpay.form.title')}
          subtitle={t('settings.razorpay.form.subtitle')}
          actions={
            connected ? (
              <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                {t('settings.razorpay.form.close')}
              </Button>
            ) : null
          }
        >
          <form onSubmit={handleConnect} className="stack" style={{ gap: '16px' }}>
            <div className="row" style={{ gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label className="field-label" htmlFor="razorpay-mode-select">{t('settings.razorpay.form.mode')}</label>
                <select
                  id="razorpay-mode-select"
                  className="input input-block"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'test' | 'live')}
                >
                  <option value="test">{t('settings.razorpay.form.mode.test')}</option>
                  <option value="live">{t('settings.razorpay.form.mode.live')}</option>
                </select>
              </div>

              <div style={{ flex: '2 1 280px' }}>
                <label className="field-label" htmlFor="razorpay-key-id">
                  {t('settings.razorpay.form.keyId', { prefix: mode === 'live' ? 'rzp_live_...' : 'rzp_test_...' })}
                </label>
                <input
                  id="razorpay-key-id"
                  type="text"
                  className="input input-block mono"
                  placeholder={mode === 'live' ? 'rzp_live_xxxxxxxxxxxxxx' : 'rzp_test_xxxxxxxxxxxxxx'}
                  value={keyId}
                  onChange={(e) => setKeyId(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="row" style={{ gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px' }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label className="field-label" htmlFor="razorpay-key-secret">{t('settings.razorpay.form.keySecret')}</label>
                  <button
                    type="button"
                    className="small text-muted row"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', gap: '4px' }}
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{showSecret ? t('settings.razorpay.form.hide') : t('settings.razorpay.form.reveal')}</span>
                  </button>
                </div>
                <input
                  id="razorpay-key-secret"
                  type={showSecret ? 'text' : 'password'}
                  className="input input-block mono"
                  placeholder={t('settings.razorpay.form.keySecretPlaceholder')}
                  value={keySecret}
                  onChange={(e) => setKeySecret(e.target.value)}
                  required
                />
              </div>

              <div style={{ flex: '1 1 280px' }}>
                <label className="field-label" htmlFor="razorpay-webhook-secret">
                  {t('settings.razorpay.form.webhookSecret')}
                </label>
                <input
                  id="razorpay-webhook-secret"
                  type="text"
                  className="input input-block mono"
                  placeholder={t('settings.razorpay.form.webhookSecretPlaceholder')}
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                />
              </div>
            </div>

            <div
              className="row"
              style={{
                justifyContent: 'space-between',
                borderTop: '1px solid var(--border)',
                paddingTop: '14px',
                marginTop: '8px',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div className="row" style={{ gap: '8px' }}>
                {connected && (
                  <Button variant="ghost" size="md" type="button" onClick={() => setFormOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                )}
                <Button variant="primary" size="md" type="submit" loading={connecting} icon={<Link size={14} />}>
                  {connected ? t('settings.razorpay.form.update') : t('settings.razorpay.form.connect')}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* Webhook Instructions & Security Details */}
      <Card title={t('settings.razorpay.howto.title')}>
        <p className="small" style={{ marginBottom: '12px' }}>
          {t('settings.razorpay.howto.intro')}
        </p>
        <ol className="plain-list" style={{ gap: '8px', marginBottom: '16px' }}>
          <li className="row" style={{ gap: '8px', alignItems: 'flex-start' }}>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>1</span>
            <span>
              {t('settings.razorpay.howto.step1.logIn')} <strong>{t('settings.razorpay.howto.step1.dashboard')}</strong> &gt; 
              <strong>{t('settings.razorpay.howto.step1.settings')}</strong> &gt; <strong>{t('settings.razorpay.howto.step1.webhooks')}</strong> &gt; 
              {t('settings.razorpay.howto.step1.click')} <strong>{t('settings.razorpay.howto.step1.addNew')}</strong>.
            </span>
          </li>
          <li className="row" style={{ gap: '8px', alignItems: 'center' }}>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>2</span>
            <span>{t('settings.razorpay.howto.webhookUrl')}</span>
            <code className="code-tag">{window.location.origin}{data.webhook_path}</code>
            <Button variant="ghost" size="sm" icon={<Copy size={12} />} onClick={copyWebhookUrl}>
              {t('settings.razorpay.howto.copyUrl')}
            </Button>
          </li>
          <li className="row" style={{ gap: '8px', alignItems: 'center' }}>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>3</span>
            <span>{t('settings.razorpay.howto.secret')}</span>
            <code className="code-tag">{data.webhook_configured ? t('settings.razorpay.howto.secretConfigured') : webhookSecret || t('settings.razorpay.howto.secretMissing')}</code>
          </li>
          <li className="row" style={{ gap: '8px', alignItems: 'flex-start' }}>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>4</span>
            <span>
              {t('settings.razorpay.howto.events')}{' '}
              <code className="code-tag">payment.captured</code>,{' '}
              <code className="code-tag">payment.failed</code>,{' '}
              <code className="code-tag">refund.created</code>,{' '}
              <code className="code-tag">settlement.processed</code>.
            </span>
          </li>
        </ol>

        <div className="notification notification-info" role="status">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>
            {t('settings.razorpay.howto.security.before')}
            <code className="code-tag">X-Razorpay-Signature</code>
            {t('settings.razorpay.howto.security.after')}
          </span>
        </div>
      </Card>
    </div>
  );
}

