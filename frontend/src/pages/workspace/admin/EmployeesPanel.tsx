import { useState } from 'react';
import { Mail, RotateCcw, ShieldOff, UserPlus } from 'lucide-react';

import { ApiError } from '@/api/client';
import { workspaceAdminApi, type EmployeeActivity, type InviteStatus, type Workspace, type WorkspaceEmployee } from '@/api/workspace';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { EmptyState, FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import type { Tone } from '@/utils/status';

const TONE: Record<InviteStatus, Tone> = { pending: 'warning', accepted: 'info', active: 'success', revoked: 'danger' };
const LABEL: Record<InviteStatus, string> = { pending: 'Pending', accepted: 'Accepted', active: 'Active', revoked: 'Revoked' };

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

interface Props {
  employees: WorkspaceEmployee[];
  workspaces: Workspace[];
  emailConfigured: boolean;
  onChanged: () => void;
  onNewWorkspace: () => void;
}

export function EmployeesPanel({ employees, workspaces, emailConfigured, onChanged, onNewWorkspace }: Props) {
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<WorkspaceEmployee | null>(null);
  const [activity, setActivity] = useState<EmployeeActivity | null>(null);

  const run = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast.success(label);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That did not work');
    }
  };

  return (
    <>
      <div className="cm-toolbar">
        <span className="cm-muted">Each employee signs in with their own email and password and sees only their workspace.</span>
        <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => (workspaces.length ? setInviteOpen(true) : onNewWorkspace())}>
          Add employee
        </Button>
      </div>
      {!emailConfigured ? <FormError message="Email is not configured on the server (SMTP), so invitations cannot be sent yet." /> : null}
      {employees.length === 0 ? (
        <EmptyState
          title="No employees connected yet"
          description={workspaces.length ? 'Add an employee: they get an email with a secure link to create their login.' : 'Create a workspace first (Sales, Warehouse, Purchase…), then invite people into it.'}
          action={
            <Button variant="primary" onClick={() => (workspaces.length ? setInviteOpen(true) : onNewWorkspace())}>
              {workspaces.length ? 'Add employee' : 'Create a workspace'}
            </Button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Workspace</th>
                <th>Status</th>
                <th>Last active</th>
                <th>AI this month</th>
                <th>AI</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.name}</strong>
                    <div className="cm-muted">{e.email}</div>
                  </td>
                  <td>{e.workspaceName}</td>
                  <td>
                    <Badge tone={TONE[e.status]}>{LABEL[e.status]}</Badge>
                    {e.inviteExpired ? <div className="cm-muted">Link expired</div> : null}
                  </td>
                  <td>{when(e.lastActiveAt)}</td>
                  <td>
                    {e.monthCalls} calls · ${e.monthCostUsd.toFixed(4)}
                  </td>
                  <td>
                    <Switch small checked={e.aiEnabled} label={`AI for ${e.name}`} disabled={e.status === 'revoked' || e.status === 'pending'} onChange={(v) => void run(v ? 'AI turned on' : 'AI turned off', () => workspaceAdminApi.updateEmployee(e.id, { aiEnabled: v }))} />
                  </td>
                  <td>
                    <div className="cm-row-actions">
                      {e.status === 'pending' ? (
                        <>
                          <Button size="sm" icon={<Mail size={14} />} onClick={() => void run('Invitation sent again', () => workspaceAdminApi.resend(e.id))}>
                            Resend
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => void run('Invitation cancelled', () => workspaceAdminApi.deleteEmployee(e.id))}>
                            Cancel
                          </Button>
                        </>
                      ) : null}
                      {e.status === 'accepted' || e.status === 'active' ? (
                        <>
                          <Button size="sm" onClick={() => workspaceAdminApi.activity(e.id).then(setActivity).catch((err) => toast.error(err instanceof ApiError ? err.message : 'Could not load activity'))}>
                            Activity
                          </Button>
                          <Button size="sm" onClick={() => setEditing(e)}>
                            Manage
                          </Button>
                          <Button size="sm" variant="danger" icon={<ShieldOff size={14} />} onClick={() => window.confirm(`Revoke ${e.name}'s access? They are signed out immediately.`) && void run('Access revoked', () => workspaceAdminApi.revoke(e.id))}>
                            Revoke
                          </Button>
                        </>
                      ) : null}
                      {e.status === 'revoked' && e.acceptedAt ? (
                        <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => void run('Access restored', () => workspaceAdminApi.restore(e.id))}>
                          Restore
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteModal open={inviteOpen} workspaces={workspaces} onClose={() => setInviteOpen(false)} onSent={() => (setInviteOpen(false), toast.success('Invitation sent'), onChanged())} onNewWorkspace={() => (setInviteOpen(false), onNewWorkspace())} />
      <ManageModal employee={editing} workspaces={workspaces} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), toast.success('Saved'), onChanged())} />
      <Modal open={!!activity} title={activity ? `${activity.employee.name}: activity` : ''} subtitle={activity ? `${activity.messageCount} assistant requests so far. Private chat contents are not shown to anyone but the employee.` : ''} size="lg" onClose={() => setActivity(null)}>
        {activity?.events.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                </tr>
              </thead>
              <tbody>
                {activity.events.map((ev, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>{when(ev.at)}</td>
                    <td>{ev.summary ?? `${ev.action} ${ev.entity}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="cm-muted">Nothing recorded yet.</p>
        )}
      </Modal>
    </>
  );
}

function InviteModal({ open, workspaces, onClose, onSent, onNewWorkspace }: { open: boolean; workspaces: Workspace[]; onClose: () => void; onSent: () => void; onNewWorkspace: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = workspaceId || workspaces.find((w) => w.isActive)?.id || '';

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await workspaceAdminApi.invite({ workspaceId: chosen, email: email.trim(), name: name.trim() || undefined, jobTitle: title.trim() || undefined });
      setEmail('');
      setName('');
      setTitle('');
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the invitation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Add an employee"
      subtitle="They get an email with a secure, single-use link to create their own login. Your credentials are never shared."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!email.trim() || !chosen} icon={<Mail size={15} />} onClick={() => void send()}>
            Send invitation
          </Button>
        </>
      }
    >
      <div className="cm-grid">
        <TextField label="Employee email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
        <div className="cm-two">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Job title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <SelectField label="Workspace" value={chosen} onChange={(e) => setWorkspaceId(e.target.value)} options={workspaces.filter((w) => w.isActive).map((w) => ({ value: w.id, label: `${w.name} (${w.department})` }))} hint="The workspace decides which modules and actions this person can use." />
        <div>
          <Button variant="link" size="sm" onClick={onNewWorkspace}>
            + Create a different workspace first
          </Button>
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

function ManageModal({ employee, workspaces, onClose, onSaved }: { employee: WorkspaceEmployee | null; workspaces: Workspace[]; onClose: () => void; onSaved: () => void }) {
  const [state, setState] = useState<{ id: string; workspaceId: string; allowAuto: boolean; allowManual: boolean; budget: string; daily: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (employee && (!state || state.id !== employee.id)) {
    setState({
      id: employee.id,
      workspaceId: employee.workspaceId,
      allowAuto: employee.allowAuto,
      allowManual: employee.allowManual,
      budget: employee.monthlyBudgetUsd == null ? '' : String(employee.monthlyBudgetUsd),
      daily: employee.dailyCallLimit == null ? '' : String(employee.dailyCallLimit),
      title: employee.jobTitle ?? '',
    });
  }
  if (!employee || !state) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await workspaceAdminApi.updateEmployee(employee.id, {
        workspaceId: state.workspaceId,
        allowAuto: state.allowAuto,
        allowManual: state.allowManual,
        monthlyBudgetUsd: state.budget === '' ? null : Number(state.budget),
        dailyCallLimit: state.daily === '' ? null : Number(state.daily),
        jobTitle: state.title,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Manage ${employee.name}`}
      subtitle={employee.email}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="cm-grid">
        <SelectField label="Workspace" value={state.workspaceId} onChange={(e) => setState({ ...state, workspaceId: e.target.value })} options={workspaces.map((w) => ({ value: w.id, label: `${w.name} (${w.department})` }))} hint="Moving an employee changes their permissions immediately." />
        <TextField label="Job title" value={state.title} onChange={(e) => setState({ ...state, title: e.target.value })} />
        <div className="cm-two">
          <TextField label="Monthly AI budget (USD)" type="number" min={0} step="0.5" value={state.budget} placeholder="Organization default" onChange={(e) => setState({ ...state, budget: e.target.value })} />
          <TextField label="Daily AI request limit" type="number" min={0} value={state.daily} placeholder="Organization default" onChange={(e) => setState({ ...state, daily: e.target.value })} />
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Switch checked={state.allowAuto} onChange={(v) => setState({ ...state, allowAuto: v })} label="Automatic mode" /> Automatic mode (AI chat)
        </label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Switch checked={state.allowManual} onChange={(v) => setState({ ...state, allowManual: v })} label="Manual mode" /> Manual mode (regular screens)
        </label>
        <FormError message={error} />
      </div>
    </Modal>
  );
}
