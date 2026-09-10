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
  if (!log) return <span className="small">Never synchronised</span>;
  return (
    <div className="cell-stack">
      <span>{formatDateTime(log.completed_at ?? log.started_at)}</span>
      <span className="small">
        {log.records_created} created · {log.records_updated} updated · {log.records_skipped} skipped
      </span>
    </div>
  );
}

export function RazorpayIntegrationSettings() {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('rooman_books_webhook_secret_2026');
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
        toast.error('Could not reach the server to start the synchronisation.');
      } finally {
        setSyncing(false);
      }
    },
    [setData, toast],
  );

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyId.trim() || !keySecret.trim()) {
      toast.error('Both Key ID and Key Secret are required to connect Razorpay.');
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
      const msg = err instanceof Error ? err.message : 'Failed to connect Razorpay.';
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Razorpay? Active webhooks and automated sync will be deactivated.')) {
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
      toast.error('Could not disconnect Razorpay.');
    } finally {
      setDisconnecting(false);
    }
  };

  const fillSandboxPreset = () => {
    setKeyId('rzp_test_StCGrX25cCk27O');
    setKeySecret('dXNiyM3czTHNM9H5MUDIl5uR');
    setWebhookSecret('rooman_books_webhook_secret_2026');
    setMode('test');
    toast.notify('Test sandbox credentials loaded. Click "Connect & Verify Razorpay" to save.', 'info');
  };

  const copyWebhookUrl = () => {
    const origin = window.location.origin;
    const url = `${origin}${data?.webhook_path || '/api/razorpay/webhook'}`;
    void navigator.clipboard.writeText(url);
    toast.success('Webhook URL copied to clipboard!');
  };

  if (loading) return <LoadingBlock label="Checking the Razorpay connection…" />;
  if (error || !data) return <ErrorBlock message={error ?? 'Could not load the integration status.'} onRetry={reload} />;

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
        title="Razorpay Payment Gateway & Financial Hub"
        subtitle="Accept online customer payments, process refunds, and automatically import Razorpay settlements into Rooman Books."
        actions={
          <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
            {connected && !formOpen && isAdmin ? (
              <Button variant="ghost" size="sm" icon={<KeyRound size={14} />} onClick={() => setFormOpen(true)}>
                Edit Credentials
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
                Disconnect
              </Button>
            ) : null}

            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => runSync(true)}
              loading={syncing}
              disabled={!connected}
              title={connected ? 'Re-scan the full history window' : 'Connect Razorpay first'}
            >
              Full re-import
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<RefreshCw size={14} />}
              onClick={() => runSync(false)}
              loading={syncing}
              disabled={!connected}
            >
              Sync now
            </Button>
          </div>
        }
      >
        <div className="detail-grid">
          <div className="detail-item">
            <span className="detail-label">Connection status</span>
            <span className="detail-value row" style={{ gap: '6px' }}>
              {statusIcon}
              <Badge tone={connected ? 'success' : data.configured ? 'warning' : 'neutral'}>
                {connected
                  ? data.reachable
                    ? 'Connected (Live API)'
                    : 'Connected (Test Sandbox)'
                  : data.configured
                  ? 'Not reachable'
                  : 'Not connected'}
              </Badge>
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Gateway Mode</span>
            <span className="detail-value">
              <Badge tone={data.mode === 'live' ? 'danger' : 'info'}>
                {data.mode === 'live' ? 'Live Production' : 'Test Sandbox'}
              </Badge>
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Key ID</span>
            <span className="detail-value mono">{data.key_id_masked || 'Not configured'}</span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Webhook Verification</span>
            <span className="detail-value">
              <Badge tone={data.webhook_configured ? 'success' : 'warning'}>
                {data.webhook_configured ? 'Secret Configured' : 'No Webhook Secret'}
              </Badge>
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Last successful sync</span>
            <span className="detail-value">
              <LastSync log={data.last_successful_sync} />
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Last execution</span>
            <span className="detail-value">
              {data.last_sync ? (
                <div className="cell-stack">
                  <Badge tone={syncTone(data.last_sync.status)}>{data.last_sync.status}</Badge>
                  {data.last_sync.error_message ? (
                    <span className="small text-muted">{data.last_sync.error_message}</span>
                  ) : null}
                </div>
              ) : (
                <span className="small text-muted">No runs yet</span>
              )}
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Transactions imported</span>
            <span className="detail-value num">{data.transactions_imported.toLocaleString('en-IN')}</span>
          </div>

          <div className="detail-item">
            <span className="detail-label">Auto Background Sync</span>
            <span className="detail-value">
              {data.auto_sync_enabled ? (
                <Badge tone="success">Every {data.sync_interval_minutes}m</Badge>
              ) : (
                <Badge tone="neutral">Disabled</Badge>
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
          <span>Only administrators can connect, edit, or disconnect the Razorpay integration.</span>
        </div>
      ) : null}

      {/* Connection Credentials Form Card */}
      {(!connected || formOpen) && isAdmin && (
        <Card
          title="Connect Razorpay API Credentials"
          subtitle="Configure your Key ID and Secret from Razorpay Dashboard (Settings > API Keys) to activate checkout and payment reconciliation."
          actions={
            connected ? (
              <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                Close Form
              </Button>
            ) : null
          }
        >
          <form onSubmit={handleConnect} className="stack" style={{ gap: '16px' }}>
            <div className="row" style={{ gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label className="field-label" htmlFor="razorpay-mode-select">Mode</label>
                <select
                  id="razorpay-mode-select"
                  className="input input-block"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'test' | 'live')}
                >
                  <option value="test">Test Mode (Sandbox)</option>
                  <option value="live">Live Mode (Production)</option>
                </select>
              </div>

              <div style={{ flex: '2 1 280px' }}>
                <label className="field-label" htmlFor="razorpay-key-id">
                  Key ID ({mode === 'live' ? 'rzp_live_...' : 'rzp_test_...'})
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
                  <label className="field-label" htmlFor="razorpay-key-secret">Key Secret</label>
                  <button
                    type="button"
                    className="small text-muted row"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', gap: '4px' }}
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{showSecret ? 'Hide' : 'Reveal'}</span>
                  </button>
                </div>
                <input
                  id="razorpay-key-secret"
                  type={showSecret ? 'text' : 'password'}
                  className="input input-block mono"
                  placeholder="Paste your Razorpay Key Secret"
                  value={keySecret}
                  onChange={(e) => setKeySecret(e.target.value)}
                  required
                />
              </div>

              <div style={{ flex: '1 1 280px' }}>
                <label className="field-label" htmlFor="razorpay-webhook-secret">
                  Webhook Secret (for verifying incoming webhooks)
                </label>
                <input
                  id="razorpay-webhook-secret"
                  type="text"
                  className="input input-block mono"
                  placeholder="Paste the webhook secret shown in Razorpay Dashboard"
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
              <Button variant="secondary" size="sm" type="button" onClick={fillSandboxPreset}>
                Quick Fill Test Sandbox Credentials
              </Button>

              <div className="row" style={{ gap: '8px' }}>
                {connected && (
                  <Button variant="ghost" size="md" type="button" onClick={() => setFormOpen(false)}>
                    Cancel
                  </Button>
                )}
                <Button variant="primary" size="md" type="submit" loading={connecting} icon={<Link size={14} />}>
                  {connected ? 'Update & Test Connection' : 'Connect & Verify Razorpay'}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* Webhook Instructions & Security Details */}
      <Card title="How to Setup Razorpay Webhooks (Real-Time Sync)">
        <p className="small" style={{ marginBottom: '12px' }}>
          To automatically capture payments, refunds, and bank payouts instantly when customers pay:
        </p>
        <ol className="plain-list" style={{ gap: '8px', marginBottom: '16px' }}>
          <li className="row" style={{ gap: '8px', alignItems: 'flex-start' }}>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>1</span>
            <span>
              Log in to your <strong>Razorpay Dashboard</strong> &gt; <strong>Settings</strong> &gt; <strong>Webhooks</strong> &gt; Click <strong>Add New Webhook</strong>.
            </span>
          </li>
          <li className="row" style={{ gap: '8px', alignItems: 'center' }}>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>2</span>
            <span>Webhook URL:</span>
            <code className="code-tag">{window.location.origin}{data.webhook_path}</code>
            <Button variant="ghost" size="sm" icon={<Copy size={12} />} onClick={copyWebhookUrl}>
              Copy URL
            </Button>
          </li>
          <li className="row" style={{ gap: '8px', alignItems: 'center' }}>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>3</span>
            <span>Secret:</span>
            <code className="code-tag">{data.webhook_configured ? 'Configured in Rooman Books' : webhookSecret || 'rooman_books_webhook_secret_2026'}</code>
          </li>
          <li className="row" style={{ gap: '8px', alignItems: 'flex-start' }}>
            <span className="badge badge-neutral" style={{ fontSize: '11px' }}>4</span>
            <span>
              Select Active Events:{' '}
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
            Rooman Books securely validates every incoming webhook against your secret using HMAC-SHA256 signature verification (<code className="code-tag">X-Razorpay-Signature</code>) to ensure maximum accounting security.
          </span>
        </div>
      </Card>
    </div>
  );
}

