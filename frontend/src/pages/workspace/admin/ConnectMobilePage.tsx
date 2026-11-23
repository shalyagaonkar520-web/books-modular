/**
 * "Connect to Mobile" (Admin console): the owner invites employees into AI workspaces, sets their
 * permissions, and watches activity, audit history and AI cost from one place.
 */
import { useState } from 'react';
import { Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';

import { ApiError } from '@/api/client';
import { workspaceAdminApi, type AiSettings, type UsageReport, type Workspace } from '@/api/workspace';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { TextField } from '@/components/ui/Field';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';

import { EmployeesPanel } from './EmployeesPanel';
import { WorkspaceEditor } from './WorkspaceEditor';

import '@/styles/workspace.css';

type Tab = 'employees' | 'workspaces' | 'usage' | 'audit' | 'settings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'employees', label: 'Employees' },
  { key: 'workspaces', label: 'Workspaces' },
  { key: 'usage', label: 'AI usage' },
  { key: 'audit', label: 'Audit history' },
  { key: 'settings', label: 'AI budget & limits' },
];

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const num = (n: number) => n.toLocaleString();

export function ConnectMobilePage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('employees');
  const [editor, setEditor] = useState<{ open: boolean; workspace: Workspace | null }>({ open: false, workspace: null });
  const overview = useAsync(() => workspaceAdminApi.overview(), []);
  const catalog = useAsync(() => workspaceAdminApi.catalog(), []);
  const workspaces = useAsync(() => workspaceAdminApi.workspaces(), []);
  const employees = useAsync(() => workspaceAdminApi.employees(), []);

  const reload = () => {
    overview.reload();
    workspaces.reload();
    employees.reload();
  };

  if (overview.loading || catalog.loading || workspaces.loading || employees.loading) return <LoadingBlock label="Loading Connect to Mobile…" />;
  const error = overview.error || catalog.error || workspaces.error || employees.error;
  if (error || !overview.data || !catalog.data || !workspaces.data || !employees.data) return <ErrorBlock message={error ?? 'Could not load'} onRetry={reload} />;

  const counts = overview.data.employees;
  const removeWorkspace = async (w: Workspace) => {
    if (!window.confirm(`Delete the workspace “${w.name}”?`)) return;
    try {
      await workspaceAdminApi.deleteWorkspace(w.id);
      toast.success('Workspace deleted');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete');
    }
  };

  return (
    <div className="stack-lg">
      <PageHeader
        title="Connect to Mobile"
        subtitle="Give employees their own AI workspace on their phone or computer. Each one sees only what you assign, and the AI can never go beyond it."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditor({ open: true, workspace: null })}>
            New workspace
          </Button>
        }
      />
      <div className="cm-stats">
        <StatTile label="Workspaces" value={String(overview.data.workspaces)} icon={<Smartphone size={16} />} />
        <StatTile label="Pending invitations" value={String(counts.pending)} tone={counts.pending ? 'warning' : 'neutral'} />
        <StatTile label="Active employees" value={String(counts.active + counts.accepted)} tone="positive" />
        <StatTile label="AI spend this month" value={usd(overview.data.settings.spentThisMonthUsd)} sublabel={`of ${usd(overview.data.settings.monthlyBudgetUsd)} budget`} />
      </div>
      {!overview.data.settings.keyConfigured ? <FormError message="No Claude API key is set on the server, so the assistant answers only quick questions. Add ANTHROPIC_API_KEY to the server environment." /> : null}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'is-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'employees' ? (
        <Card>
          <EmployeesPanel employees={employees.data} workspaces={workspaces.data} emailConfigured={overview.data.emailConfigured} onChanged={reload} onNewWorkspace={() => setEditor({ open: true, workspace: null })} />
        </Card>
      ) : null}

      {tab === 'workspaces' ? (
        <Card>
          {workspaces.data.length === 0 ? (
            <EmptyState title="No workspaces yet" description="A workspace is a department such as Sales, Warehouse or Purchase, with its own permissions." action={<Button variant="primary" onClick={() => setEditor({ open: true, workspace: null })}>Create a workspace</Button>} />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Workspace</th>
                    <th>Department</th>
                    <th>Modules</th>
                    <th>Employees</th>
                    <th>Modes</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {workspaces.data.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <strong>{w.name}</strong> {w.isActive ? null : <Badge tone="neutral">Off</Badge>}
                        <div className="cm-muted">{w.description}</div>
                      </td>
                      <td>{w.department}</td>
                      <td>
                        {Object.keys(w.permissions.features).length}
                        {w.permissions.financial ? <Badge tone="warning">financial</Badge> : null}
                      </td>
                      <td>{w.employeeCount}</td>
                      <td>
                        {w.config.allowAuto ? 'Automatic' : ''}
                        {w.config.allowAuto && w.config.allowManual ? ' · ' : ''}
                        {w.config.allowManual ? 'Manual' : ''}
                      </td>
                      <td>
                        <div className="cm-row-actions">
                          <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEditor({ open: true, workspace: w })}>
                            Permissions
                          </Button>
                          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => void removeWorkspace(w)} aria-label={`Delete ${w.name}`} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'usage' ? <UsagePanel /> : null}
      {tab === 'audit' ? <AuditPanel /> : null}
      {tab === 'settings' ? <SettingsPanel onSaved={overview.reload} /> : null}

      <WorkspaceEditor
        open={editor.open}
        catalog={catalog.data}
        workspace={editor.workspace}
        onClose={() => setEditor({ open: false, workspace: null })}
        onSaved={() => {
          setEditor({ open: false, workspace: null });
          toast.success('Workspace saved');
          reload();
        }}
      />
    </div>
  );
}

function UsagePanel() {
  const [days, setDays] = useState(30);
  const usage = useAsync<UsageReport>(() => workspaceAdminApi.usage(days), [days]);
  if (usage.loading) return <LoadingBlock label="Loading usage…" />;
  if (usage.error || !usage.data) return <ErrorBlock message={usage.error ?? 'Could not load usage'} onRetry={usage.reload} />;
  const u = usage.data;
  const maxDaily = Math.max(1, ...u.daily.map((d) => d.calls));
  const allowUsed = u.settings.allowance.requests ? Math.min(100, (u.settings.allowance.used / u.settings.allowance.requests) * 100) : 0;
  const used = u.settings.monthlyBudgetUsd > 0 ? Math.min(100, (u.settings.spentThisMonthUsd / u.settings.monthlyBudgetUsd) * 100) : 0;
  return (
    <div className="cm-grid">
      <div className="cm-toolbar">
        <span className="cm-muted">
          The assistant answers most questions straight from your data without any AI. Only unclear requests and photos use Claude ({u.settings.model}).
        </span>
        <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      <div className="cm-stats">
        <StatTile label="API calls today" value={num(u.today.calls)} sublabel={usd(u.today.costUsd)} />
        <StatTile label="API calls this month" value={num(u.month.calls)} sublabel={usd(u.month.costUsd)} />
        <StatTile label="Input tokens (period)" value={num(u.period.inputTokens)} />
        <StatTile label="Output tokens (period)" value={num(u.period.outputTokens)} />
        <StatTile label="Estimated cost (period)" value={usd(u.period.costUsd)} />
        <StatTile label="Answered without AI" value={`${u.answers.total ? Math.round((u.answers.withoutAi / u.answers.total) * 100) : 0}%`} sublabel={`${num(u.answers.withoutAi)} of ${num(u.answers.total)} replies`} tone="positive" />
      </div>
      <Card
        title="AI requests in your plan"
        subtitle={
          u.settings.allowance.requests === null
            ? `${u.settings.allowance.used.toLocaleString()} used this month · no cap on your plan`
            : `${u.settings.allowance.used.toLocaleString()} of ${u.settings.allowance.requests.toLocaleString()} used this month · renews ${u.settings.allowance.resetsOn}`
        }
      >
        <div className={`cm-meter ${allowUsed > 85 ? 'is-hot' : ''}`} role="progressbar" aria-label="AI requests used" aria-valuenow={Math.round(allowUsed)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${allowUsed}%` }} />
        </div>
        <p className="cm-muted" style={{ marginBottom: 0 }}>
          Quick answers are free and unlimited. A question that needs the AI, or one photo read, is 1 request; a complex multi-step job is {u.settings.allowance.hardCounts}. Need more? Upgrade the plan.
        </p>
      </Card>
      <Card title="Monthly budget" subtitle={`${usd(u.settings.spentThisMonthUsd)} of ${usd(u.settings.monthlyBudgetUsd)} used`}>
        <div className={`cm-meter ${used > 85 ? 'is-hot' : ''}`} role="progressbar" aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${used}%` }} />
        </div>
      </Card>
      <Card title="Daily AI calls">
        {u.daily.length === 0 ? (
          <p className="cm-muted">No AI calls in this period.</p>
        ) : (
          <div className="cm-bars" role="img" aria-label="Calls per day">
            {u.daily.map((d) => (
              <span key={d.date} style={{ height: `${Math.max(4, (d.calls / maxDaily) * 100)}%` }} title={`${d.date}: ${d.calls} calls, ${usd(d.costUsd)}`} />
            ))}
          </div>
        )}
      </Card>
      <div className="cm-two">
        <Card title="By employee">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Calls</th>
                <th>Tokens in / out</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {u.byEmployee.map((e) => (
                <tr key={e.userId}>
                  <td>
                    {e.name}
                    <div className="cm-muted">{e.email}</div>
                  </td>
                  <td>{num(e.calls)}</td>
                  <td>
                    {num(e.inputTokens)} / {num(e.outputTokens)}
                  </td>
                  <td>{usd(e.costUsd)}</td>
                </tr>
              ))}
              {u.byEmployee.length === 0 ? (
                <tr>
                  <td colSpan={4} className="cm-muted">
                    No usage yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
        <Card title="By feature">
          <table className="data-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Calls</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {u.byFeature.map((f) => (
                <tr key={f.feature}>
                  <td>{{ understand: 'Everyday requests (small model)', understand_hard: 'Hard requests (larger model)', photo: 'Product photos (small model)', photo_hard: 'Unclear photos (larger model)', analysis_hard: 'Business reviews (larger model)' }[f.feature] ?? f.feature}</td>
                  <td>{num(f.calls)}</td>
                  <td>{usd(f.costUsd)}</td>
                </tr>
              ))}
              {u.byFeature.length === 0 ? (
                <tr>
                  <td colSpan={3} className="cm-muted">
                    No usage yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function AuditPanel() {
  const audit = useAsync(() => workspaceAdminApi.audit(), []);
  if (audit.loading) return <LoadingBlock label="Loading audit history…" />;
  if (audit.error || !audit.data) return <ErrorBlock message={audit.error ?? 'Could not load'} onRetry={audit.reload} />;
  return (
    <Card title="What employees did" subtitle="Every record an employee created, changed or deleted, by hand or through the assistant.">
      {audit.data.length === 0 ? (
        <p className="cm-muted">Nothing recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Employee</th>
                <th>What</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.map((r, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.at ? new Date(r.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                  <td>{r.user}</td>
                  <td>{r.summary ?? `${r.action} ${r.entity}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SettingsPanel({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const settings = useAsync<AiSettings>(() => workspaceAdminApi.settings(), []);
  const [form, setForm] = useState<{ monthly: string; perEmployee: string; daily: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (settings.loading) return <LoadingBlock label="Loading…" />;
  if (settings.error || !settings.data) return <ErrorBlock message={settings.error ?? 'Could not load'} onRetry={settings.reload} />;
  const s = settings.data;
  const f = form ?? { monthly: String(s.monthlyBudgetUsd), perEmployee: String(s.defaultEmployeeBudgetUsd), daily: String(s.defaultDailyCallLimit) };

  const save = async (patch: Parameters<typeof workspaceAdminApi.updateSettings>[0]) => {
    setBusy(true);
    try {
      settings.setData(await workspaceAdminApi.updateSettings(patch));
      toast.success('Saved');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="AI budget & limits" subtitle="Employees can always use Manual mode and quick questions; these limits only cap Claude API use.">
      <div className="cm-grid">
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Switch checked={s.aiEnabled} onChange={(v) => void save({ aiEnabled: v })} label="AI understanding for all employees" /> AI understanding is {s.aiEnabled ? 'on' : 'paused'} for everyone
        </label>
        <div className="cm-two">
          <TextField label="Organization monthly budget (USD)" type="number" min={0} step="1" value={f.monthly} onChange={(e) => setForm({ ...f, monthly: e.target.value })} />
          <TextField label="Default per-employee monthly budget (USD)" type="number" min={0} step="0.5" value={f.perEmployee} onChange={(e) => setForm({ ...f, perEmployee: e.target.value })} />
        </div>
        <TextField label="Default daily AI requests per employee" type="number" min={0} value={f.daily} onChange={(e) => setForm({ ...f, daily: e.target.value })} />
        <div>
          <Button variant="primary" loading={busy} onClick={() => void save({ monthlyBudgetUsd: Number(f.monthly), defaultEmployeeBudgetUsd: Number(f.perEmployee), defaultDailyCallLimit: Number(f.daily) })}>
            Save limits
          </Button>
        </div>
        <p className="cm-muted">
          Models: {s.model} for requests, {s.visionModel} for photos. The API key lives only in the server environment and is never shown here. {s.keyConfigured ? 'A key is configured.' : 'No key is configured yet.'}
        </p>
      </div>
    </Card>
  );
}
