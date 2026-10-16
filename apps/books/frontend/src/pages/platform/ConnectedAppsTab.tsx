/**
 * Connected apps of one organization (platform admin). Connecting an app gives
 * it an API key limited to the chosen features (read or read & write) and,
 * optionally, a webhook that receives the chosen events. The key and the
 * webhook signing secret are shown once.
 */
import { useMemo, useState } from 'react';
import { Copy, KeyRound, Pencil, PlugZap, Plus, RefreshCw, Send, Unplug } from 'lucide-react';

import {
  connectedAppsApi,
  withImpliedReads,
  type ConnectedApp,
  type ConnectedAppSecrets,
  type ConnectedAppsCatalog,
  type DeliveryStatus,
} from '@/api/connectedApps';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatDateTime } from '@/utils/format';

import { useCopy } from './PanelAdminForms';

type Access = 'none' | 'read' | 'write';

function accessOf(scopes: string[], feature: string): Access {
  if (scopes.includes(`${feature}:write`)) return 'write';
  if (scopes.includes(`${feature}:read`)) return 'read';
  return 'none';
}

function permissionSummary(app: ConnectedApp, catalog: ConnectedAppsCatalog | null): string {
  const granted = (catalog?.features ?? [])
    .map((f) => ({ f, access: accessOf(app.scopes, f.key) }))
    .filter((x) => x.access !== 'none')
    .map((x) => `${x.f.label} (${x.access === 'write' ? 'read & write' : 'read'})`);
  return granted.length ? granted.join(', ') : 'No permissions';
}

export function ConnectedAppsTab({ orgId, orgName }: { orgId: string; orgName: string }) {
  const toast = useToast();
  const submit = useSubmit();
  const catalog = useAsync((signal) => connectedAppsApi.catalog(signal), []);
  const apps = useAsync((signal) => connectedAppsApi.list(orgId, signal), [orgId]);
  const [editing, setEditing] = useState<ConnectedApp | 'new' | null>(null);
  const [secrets, setSecrets] = useState<ConnectedAppSecrets | null>(null);
  const [revoking, setRevoking] = useState<ConnectedApp | null>(null);
  const [viewing, setViewing] = useState<ConnectedApp | null>(null);

  if ((apps.loading && !apps.data) || (catalog.loading && !catalog.data)) return <LoadingBlock label="Loading connected apps…" />;
  if (apps.error || !apps.data) return <ErrorBlock message={apps.error ?? 'Could not load the connected apps.'} onRetry={apps.reload} />;
  if (catalog.error || !catalog.data) return <ErrorBlock message={catalog.error ?? 'Could not load.'} onRetry={catalog.reload} />;

  const act = async (label: string, action: () => Promise<ConnectedAppSecrets | unknown>) => {
    const result = await submit.run(action);
    if (result) {
      apps.reload();
      if (typeof result === 'object' && result && 'connection' in result) setSecrets(result as ConnectedAppSecrets);
      else toast.success(label);
    }
  };

  const testWebhook = async (app: ConnectedApp) => {
    const result = await submit.run(() => connectedAppsApi.testWebhook(app.id));
    if (!result) return;
    if (result.ok) toast.success(`${app.name} answered the test ping (HTTP ${result.statusCode}).`);
    else toast.error(result.error ?? 'The test ping failed.');
  };

  const columns: Array<Column<ConnectedApp>> = [
    {
      key: 'name',
      header: 'App',
      render: (app) => (
        <span className="stack" style={{ gap: 2 }}>
          <strong>{app.name}</strong>
          <span className="mono small text-muted">{app.keyPrefix}…</span>
        </span>
      ),
    },
    { key: 'scopes', header: 'Can use', render: (app) => <span className="small">{permissionSummary(app, catalog.data)}</span> },
    {
      key: 'webhook',
      header: 'Events',
      render: (app) =>
        app.webhookUrl ? (
          <span className="stack small" style={{ gap: 2 }}>
            <span>{app.events.length ? `${app.events.length} event type${app.events.length === 1 ? '' : 's'}` : 'None chosen'}</span>
            {app.failedDeliveries ? <Badge tone="danger">{app.failedDeliveries} failed</Badge> : null}
            {app.pendingDeliveries ? <Badge tone="warning">{app.pendingDeliveries} waiting</Badge> : null}
          </span>
        ) : (
          <span className="text-muted small">No webhook</span>
        ),
    },
    { key: 'used', header: 'Last used', render: (app) => <span className="small">{app.lastUsedAt ? formatDateTime(app.lastUsedAt) : 'Never'}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (app) => (app.isActive ? <Badge tone="success">Connected</Badge> : <Badge tone="neutral">Disconnected</Badge>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (app) =>
        app.isActive ? (
          <span className="row" style={{ gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(app)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<KeyRound size={14} />}
              disabled={submit.submitting}
              onClick={() => void act('', () => connectedAppsApi.rotateKey(app.id))}
            >
              New key
            </Button>
            {app.webhookUrl ? (
              <>
                <Button size="sm" variant="ghost" icon={<Send size={14} />} disabled={submit.submitting} onClick={() => void testWebhook(app)}>
                  Test
                </Button>
                <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => setViewing(app)}>
                  Deliveries
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" icon={<Unplug size={14} />} onClick={() => setRevoking(app)}>
              Disconnect
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <p className="text-muted small" style={{ margin: 0, maxWidth: 640 }}>
          Apps that use {orgName}'s Books through the API, such as Rooman Bookings. Each app gets its own key that only opens the features you
          choose, within the organization's plan. Changes in Books can be sent to the app as events.
        </p>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing('new')}>
          Connect an app
        </Button>
      </div>
      <FormError message={submit.error} />
      {apps.data.length ? (
        <DataTable columns={columns} rows={apps.data} rowKey={(app) => app.id} caption={`Connected apps of ${orgName}`} />
      ) : (
        <EmptyState
          icon={<PlugZap size={22} />}
          title="No connected apps"
          description="Connect an app to give it a key that opens only the features you choose."
        />
      )}

      {editing ? (
        <ConnectedAppForm
          orgId={orgId}
          catalog={catalog.data}
          app={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(result) => {
            setEditing(null);
            apps.reload();
            if ('connection' in result) setSecrets(result);
            else toast.success(`${result.name} saved.`);
          }}
        />
      ) : null}
      {secrets ? <SecretsModal secrets={secrets} onClose={() => setSecrets(null)} /> : null}
      {viewing ? <DeliveriesModal app={viewing} onClose={() => setViewing(null)} /> : null}
      <ConfirmDialog
        open={revoking !== null}
        title="Disconnect this app?"
        message={`${revoking?.name ?? 'The app'} stops working with ${orgName}'s Books at once and receives no more events. To reconnect it later, connect it again and give it the new key.`}
        confirmLabel="Disconnect"
        busy={submit.submitting}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          const app = revoking;
          setRevoking(null);
          if (app) void act(`${app.name} disconnected.`, () => connectedAppsApi.revoke(app.id));
        }}
      />
    </div>
  );
}

interface FormProps {
  orgId: string;
  catalog: ConnectedAppsCatalog;
  app: ConnectedApp | null;
  onClose: () => void;
  onSaved: (result: ConnectedAppSecrets | ConnectedApp) => void;
}

function ConnectedAppForm({ orgId, catalog, app, onClose, onSaved }: FormProps) {
  const submit = useSubmit();
  const [name, setName] = useState(app?.name ?? '');
  const [webhookUrl, setWebhookUrl] = useState(app?.webhookUrl ?? '');
  const [access, setAccess] = useState<Record<string, Access>>(() =>
    Object.fromEntries(catalog.features.map((f) => [f.key, app ? accessOf(app.scopes, f.key) : 'none'])),
  );
  const [events, setEvents] = useState<Set<string>>(new Set(app?.events ?? []));

  const scopes = useMemo(
    () =>
      withImpliedReads(
        Object.entries(access)
          .filter(([, level]) => level !== 'none')
          .map(([key, level]) => `${key}:${level}`),
      ),
    [access],
  );
  const readable = (feature: string) => access[feature] && access[feature] !== 'none';

  const save = async () => {
    const body = {
      name: name.trim(),
      scopes,
      // An event needs read access to its feature; drop any that lost it.
      events: catalog.events.filter((e) => events.has(e.type) && readable(e.feature)).map((e) => e.type),
      webhookUrl: webhookUrl.trim() || null,
    };
    const result = await submit.run<ConnectedAppSecrets | ConnectedApp>(() =>
      app ? connectedAppsApi.update(app.id, body) : connectedAppsApi.create(orgId, body),
    );
    if (result) onSaved(result);
  };

  return (
    <Modal
      open
      size="lg"
      title={app ? `Edit ${app.name}` : 'Connect an app'}
      subtitle="Choose what the app may use. It can never reach the organization's users, settings or other organizations."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={submit.submitting} disabled={name.trim().length < 2} onClick={() => void save()}>
            {app ? 'Save' : 'Connect and show the key'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={submit.error} />
        <TextField
          label="App name"
          required
          value={name}
          maxLength={120}
          placeholder="Rooman Bookings"
          onChange={(event) => setName(event.target.value)}
          error={submit.fieldErrors.name}
        />
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">What it can use</legend>
          <div className="table-wrap">
            <table className="table" aria-label="Feature permissions">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>No access</th>
                  <th>Read</th>
                  <th>Read &amp; write</th>
                </tr>
              </thead>
              <tbody>
                {catalog.features.map((f) => (
                  <tr key={f.key}>
                    <td>
                      <strong>{f.label}</strong>
                      <div className="small text-muted">{f.description}</div>
                    </td>
                    {(['none', 'read', 'write'] as Access[]).map((level) => (
                      <td key={level}>
                        <input
                          type="radio"
                          name={`access-${f.key}`}
                          aria-label={`${f.label}: ${level === 'none' ? 'no access' : level === 'read' ? 'read' : 'read and write'}`}
                          checked={access[f.key] === level}
                          onChange={() => setAccess((current) => ({ ...current, [f.key]: level }))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
        <TextField
          label="Webhook URL (optional)"
          hint="Where Books sends events. https:// only; leave empty if the app only calls the API."
          value={webhookUrl}
          maxLength={500}
          placeholder="https://bookings.example.com/webhooks/books"
          onChange={(event) => setWebhookUrl(event.target.value)}
          error={submit.fieldErrors.webhookUrl}
        />
        {webhookUrl.trim() ? (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">Events to send</legend>
            <div className="form-grid-3">
              {catalog.events.map((e) => {
                const allowed = readable(e.feature);
                return (
                  <label key={e.type} className="checkbox-field">
                    <input
                      type="checkbox"
                      className="checkbox"
                      disabled={!allowed}
                      checked={allowed && events.has(e.type)}
                      onChange={(event) =>
                        setEvents((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(e.type);
                          else next.delete(e.type);
                          return next;
                        })
                      }
                    />
                    <span className="mono small">
                      {e.type}
                      {allowed ? null : <span className="field-hint">Needs read access</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
      </div>
    </Modal>
  );
}

function SecretsModal({ secrets, onClose }: { secrets: ConnectedAppSecrets; onClose: () => void }) {
  const copy = useCopy();
  const rows = [
    secrets.apiKey ? { label: 'API key', value: secrets.apiKey, hint: 'Send as: Authorization: Bearer <key>' } : null,
    secrets.webhookSecret ? { label: 'Webhook signing secret', value: secrets.webhookSecret, hint: 'Checks the X-Rooman-Signature header' } : null,
  ].filter((row): row is { label: string; value: string; hint: string } => row !== null);
  return (
    <Modal
      open
      size="md"
      title={`${secrets.connection.name}: keys`}
      subtitle="Give these to the app's developer now. They are not shown again; issue a new one if they are lost."
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <dl className="detail-grid" aria-label="App keys">
        {rows.map((row) => (
          <div key={row.label} className="detail-item">
            <dt>{row.label}</dt>
            <dd className="stack" style={{ gap: 4 }}>
              <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <span className="mono" style={{ wordBreak: 'break-all' }}>
                  {row.value}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Copy size={14} />}
                  aria-label={`Copy ${row.label.toLowerCase()}`}
                  onClick={() => copy(row.value, row.label)}
                />
              </span>
              <span className="small text-muted">{row.hint}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

const STATUS_TONE: Record<DeliveryStatus, 'success' | 'warning' | 'danger'> = { delivered: 'success', pending: 'warning', dead: 'danger' };
const STATUS_LABEL: Record<DeliveryStatus, string> = { delivered: 'Delivered', pending: 'Waiting', dead: 'Failed' };

function DeliveriesModal({ app, onClose }: { app: ConnectedApp; onClose: () => void }) {
  const toast = useToast();
  const submit = useSubmit();
  const [filter, setFilter] = useState<DeliveryStatus | ''>('');
  const list = useAsync((signal) => connectedAppsApi.deliveries(app.id, filter || undefined, signal), [app.id, filter]);

  const resend = async (id: string) => {
    if (await submit.run(() => connectedAppsApi.resend(id))) {
      toast.success('Queued to send again.');
      list.reload();
    }
  };

  return (
    <Modal open size="xl" title={`${app.name}: event deliveries`} subtitle="The latest 50 events sent to the app's webhook." onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ gap: 6 }}>
          {(['', 'dead', 'pending', 'delivered'] as const).map((value) => (
            <Button key={value || 'all'} size="sm" variant={filter === value ? 'primary' : 'ghost'} onClick={() => setFilter(value)}>
              {value ? STATUS_LABEL[value] : 'All'}
            </Button>
          ))}
        </div>
        <FormError message={submit.error} />
        {list.loading && !list.data ? <LoadingBlock label="Loading deliveries…" /> : null}
        {list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : null}
        {list.data && !list.data.length ? <EmptyState title="Nothing here" description="No events match this filter." /> : null}
        {list.data?.length ? (
          <DataTable
            caption="Event deliveries"
            rows={list.data}
            rowKey={(row) => row.id}
            columns={[
              { key: 'event', header: 'Event', render: (row) => <span className="mono small">{row.eventType}</span> },
              { key: 'at', header: 'Happened', render: (row) => <span className="small">{formatDateTime(row.createdAt)}</span> },
              { key: 'status', header: 'Status', render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge> },
              { key: 'tries', header: 'Tries', align: 'right', render: (row) => row.attempts },
              {
                key: 'detail',
                header: 'Last answer',
                render: (row) => (
                  <span className="small">
                    {row.status === 'delivered'
                      ? `HTTP ${row.lastStatusCode ?? 200}`
                      : (row.lastError ?? (row.status === 'pending' ? `Next try ${formatDateTime(row.nextAttemptAt)}` : ''))}
                  </span>
                ),
              },
              {
                key: 'resend',
                header: '',
                align: 'right',
                render: (row) =>
                  row.status === 'dead' ? (
                    <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} disabled={submit.submitting} onClick={() => void resend(row.id)}>
                      Send again
                    </Button>
                  ) : null,
              },
            ]}
          />
        ) : null}
      </div>
    </Modal>
  );
}
