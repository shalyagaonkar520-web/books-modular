import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Clock, FileText, IndianRupee, Lock, Receipt } from 'lucide-react';

import { APP_MODULES } from '@/api/appContent';
import { orgAdminApi, type OrgAdminUserOverview } from '@/api/orgAdmin';
import type { AuditLog, User } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatDateTime, formatNumber, titleCase } from '@/utils/format';

type PendingInvoice = OrgAdminUserOverview['pending']['invoices'][number];
type PendingBill = OrgAdminUserOverview['pending']['bills'][number];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'access', label: 'Edit access' },
  { id: 'pending', label: 'Pending' },
  { id: 'activity', label: 'Activity' },
];

/** Modules whose changes the server checks per user (deps.require_module); the rest are view-only pages. */
const EDITABLE_MODULES = [
  'items',
  'customers',
  'vendors',
  'invoices',
  'bills',
  'expenses',
  'banking',
  'accounting',
  'timeTracking',
  'documents',
  'payroll',
];

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin: edits every module in the plan' },
  { value: 'staff', label: 'Staff: edits the modules you choose' },
  { value: 'viewer', label: 'Viewer: view only' },
];

/**
 * The user's role and which modules they may edit. Modules outside the
 * subscription plan are always shown but locked; admins edit every plan
 * module and viewers none, so only staff get a choice.
 */
function ModuleAccessEditor({ data, onSaved }: { data: OrgAdminUserOverview; onSaved: () => void }) {
  const toast = useToast();
  const submit = useSubmit();
  const roleSubmit = useSubmit();
  const { user } = data;
  const plan = data.planModules ?? null;
  const inPlan = (key: string) => plan === null || plan.includes(key);
  const modules = APP_MODULES.filter((module) => EDITABLE_MODULES.includes(module.key));
  const [restricted, setRestricted] = useState(user.moduleAccess != null);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(user.moduleAccess ?? []));
  const isStaff = user.role === 'staff';

  useEffect(() => {
    setRestricted(user.moduleAccess != null);
    setChosen(new Set(user.moduleAccess ?? []));
  }, [user.moduleAccess]);

  const toggle = (key: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const changeRole = async (role: string) => {
    const saved = await roleSubmit.run(() => orgAdminApi.updateUserRole(user.id, role));
    if (saved) {
      toast.success(`${user.name} is now ${titleCase(role)}.`);
      onSaved();
    }
  };

  const save = async () => {
    const body = restricted ? modules.map((module) => module.key).filter((key) => chosen.has(key) && inPlan(key)) : null;
    const saved = await submit.run(() => orgAdminApi.setModuleAccess(user.id, body));
    if (saved) {
      toast.success(`Edit access saved for ${user.name}.`);
      onSaved();
    }
  };

  // What each box shows: admins every plan module, viewers none, staff their choice.
  const isChecked = (key: string) => {
    if (!inPlan(key)) return false;
    if (user.role === 'admin') return true;
    if (!isStaff) return false;
    return !restricted || chosen.has(key);
  };

  return (
    <div className="stack">
      <FormError message={roleSubmit.error ?? submit.error} />

      {user.role === 'employee' ? (
        <p className="small">This is an employee portal login: it only sees its own payslips and profile.</p>
      ) : (
        <label className="field" style={{ maxWidth: 360 }}>
          <span className="field-label">Role</span>
          <select
            className="select"
            value={user.role}
            disabled={roleSubmit.submitting}
            onChange={(event) => void changeRole(event.target.value)}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isStaff ? (
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ marginBottom: 6 }}>
            What can {user.name} edit? Viewing stays open everywhere in the plan.
          </legend>
          <label className="checkbox-field">
            <input type="radio" name="access-mode" checked={!restricted} onChange={() => setRestricted(false)} />
            <span>Every module in the subscription plan</span>
          </label>
          <label className="checkbox-field">
            <input type="radio" name="access-mode" checked={restricted} onChange={() => setRestricted(true)} />
            <span>Only the modules ticked below</span>
          </label>
        </fieldset>
      ) : (
        <p className="small text-muted" role="note">
          {user.role === 'admin'
            ? 'Admins edit every module in the plan. To limit what someone can edit, make them Staff. An organization always keeps at least one admin, so invite another user first if this is the only one.'
            : 'Viewers cannot edit anything. Make them Staff to let them edit chosen modules.'}
        </p>
      )}

      <div className="form-grid-3" role="group" aria-label="Modules this user can edit">
        {modules.map((module) => {
          const available = inPlan(module.key);
          return (
            <label
              key={module.key}
              className="checkbox-field"
              title={available ? undefined : 'Not in your subscription plan'}
              style={available ? undefined : { opacity: 0.55 }}
            >
              <input
                type="checkbox"
                className="checkbox"
                disabled={!available || !isStaff || !restricted}
                checked={isChecked(module.key)}
                onChange={(event) => toggle(module.key, event.target.checked)}
              />
              <span>
                {module.label}
                {available ? null : (
                  <span className="field-hint">
                    <Lock size={11} aria-hidden="true" /> Not in plan
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {isStaff ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="primary" loading={submit.submitting} onClick={() => void save()}>
            Save access
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ user }: { user: User }) {
  if (user.pendingInvite) return <Badge tone="warning">Invite pending</Badge>;
  return user.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Suspended</Badge>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-item">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const invoiceColumns: Array<Column<PendingInvoice>> = [
  {
    key: 'number',
    header: 'Invoice',
    render: (row) => (
      <div className="cell-stack">
        <span className="strong">{row.invoiceNumber}</span>
        <small>{row.customerName ?? '-'}</small>
      </div>
    ),
  },
  { key: 'due', header: 'Due', render: (row) => formatDate(row.dueDate) },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <Badge tone={row.status === 'overdue' ? 'danger' : row.status === 'draft' ? 'neutral' : 'info'}>{titleCase(row.status)}</Badge>
    ),
  },
  { key: 'balance', header: 'Balance', align: 'right', render: (row) => formatCurrency(row.balanceDue) },
];

const billColumns: Array<Column<PendingBill>> = [
  {
    key: 'number',
    header: 'Draft bill',
    render: (row) => (
      <div className="cell-stack">
        <span className="strong">{row.billNumber}</span>
        <small>{row.vendorName ?? '-'}</small>
      </div>
    ),
  },
  { key: 'due', header: 'Due', render: (row) => formatDate(row.dueDate) },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
];

const activityColumns: Array<Column<AuditLog>> = [
  { key: 'when', header: 'When', width: '180px', render: (row) => formatDateTime(row.createdAt) },
  {
    key: 'what',
    header: 'Activity',
    render: (row) => (
      <div className="cell-stack">
        <span className="strong">{row.summary ?? titleCase(row.action)}</span>
        <small>{titleCase(row.entityType)}</small>
      </div>
    ),
  },
];

/** Everything about one user of the organization, for its admin panel. */
export function UserOverviewModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [tab, setTab] = useState('overview');
  const { data, loading, error, reload } = useAsync((signal) => orgAdminApi.userOverview(user.id, signal), [user.id]);

  let body: React.ReactNode;
  if (loading && !data) body = <LoadingBlock label="Loading user details…" />;
  else if (error) body = <ErrorBlock message={error} onRetry={reload} />;
  else if (!data) body = null;
  else {
    const { performance: perf, pending, employee } = data;
    const pendingCount = pending.draftInvoices + pending.openInvoices + pending.draftBills + (pending.invitePending ? 1 : 0);
    body = (
      <div className="stack">
        <Tabs
          tabs={TABS.map((entry) => (entry.id === 'pending' && pendingCount ? { ...entry, label: `Pending (${pendingCount})` } : entry))}
          active={tab}
          onChange={setTab}
        />

        {tab === 'overview' ? (
          <>
            <dl className="detail-grid" aria-label="Profile">
              <Detail label="Email">{data.user.email}</Detail>
              <Detail label="Role">{titleCase(data.user.role)}</Detail>
              <Detail label="Status">
                <StatusBadge user={data.user} />
              </Detail>
              <Detail label="Last active">{perf.lastActive ? formatDateTime(perf.lastActive) : 'Never'}</Detail>
              <Detail label="Added">{formatDate(data.user.createdAt)}</Detail>
              {employee ? (
                <>
                  <Detail label="Employee code">{employee.employeeCode}</Detail>
                  <Detail label="Designation">{employee.designation || '-'}</Detail>
                  <Detail label="Department">{employee.department || '-'}</Detail>
                  <Detail label="Joined">{formatDate(employee.dateOfJoining)}</Detail>
                  <Detail label="Leave this year">{`${employee.leaveDaysThisYear} day${employee.leaveDaysThisYear === 1 ? '' : 's'}`}</Detail>
                  <Detail label="Last payslip">
                    {employee.lastPayPeriod ? `${employee.lastPayPeriod} · ${formatCurrency(employee.lastNetPay ?? 0)} net` : 'None yet'}
                  </Detail>
                </>
              ) : null}
            </dl>

            <h3 className="card-title" style={{ margin: '8px 0 0' }}>
              Performance
            </h3>
            <div className="stat-grid">
              <StatTile
                label="Invoices raised"
                value={formatNumber(perf.invoicesRaised, 0)}
                sublabel={`${perf.invoicesLast30Days} in the last 30 days`}
                icon={<FileText size={16} />}
              />
              <StatTile label="Invoiced" value={formatCurrency(perf.invoicedAmount)} icon={<IndianRupee size={16} />} />
              <StatTile
                label="Collected"
                value={formatCurrency(perf.collectedAmount)}
                sublabel={perf.invoicedAmount ? `${Math.round((perf.collectedAmount / perf.invoicedAmount) * 100)}% of invoiced` : undefined}
                tone="positive"
                icon={<IndianRupee size={16} />}
              />
              <StatTile
                label="Bills & expenses"
                value={formatNumber(perf.billsRecorded + perf.expensesRecorded, 0)}
                sublabel={formatCurrency(perf.billsAmount + perf.expensesAmount)}
                icon={<Receipt size={16} />}
              />
              <StatTile
                label="Hours logged"
                value={formatNumber(perf.hoursLogged, 1)}
                sublabel={`${formatNumber(perf.hoursLast30Days, 1)} in 30 days · ${formatNumber(perf.billableHours, 1)} billable`}
                icon={<Clock size={16} />}
              />
              <StatTile label="Actions (30 days)" value={formatNumber(perf.actionsLast30Days, 0)} icon={<Activity size={16} />} />
            </div>
          </>
        ) : null}

        {tab === 'pending' ? (
          <>
            <div className="stat-grid">
              <StatTile
                label="Overdue invoices"
                value={formatNumber(pending.overdueInvoices, 0)}
                tone={pending.overdueInvoices ? 'negative' : 'neutral'}
                icon={<AlertTriangle size={16} />}
              />
              <StatTile label="Unpaid invoices" value={formatNumber(pending.openInvoices, 0)} sublabel={formatCurrency(pending.outstandingAmount)} />
              <StatTile label="Draft invoices" value={formatNumber(pending.draftInvoices, 0)} tone={pending.draftInvoices ? 'warning' : 'neutral'} />
              <StatTile label="Draft bills" value={formatNumber(pending.draftBills, 0)} tone={pending.draftBills ? 'warning' : 'neutral'} />
            </div>
            {pending.invitePending ? (
              <p className="small" role="note">
                <Badge tone="warning">Invite pending</Badge> This user has not accepted the invitation yet.
              </p>
            ) : null}
            {pending.invoices.length ? (
              <Card title="Invoices to follow up">
                <DataTable columns={invoiceColumns} rows={pending.invoices} rowKey={(row) => row.id} caption="Pending invoices" />
              </Card>
            ) : null}
            {pending.bills.length ? (
              <Card title="Bills waiting to be finalised">
                <DataTable columns={billColumns} rows={pending.bills} rowKey={(row) => row.id} caption="Draft bills" />
              </Card>
            ) : null}
            {!pendingCount ? <p className="text-muted small">Nothing pending for this user.</p> : null}
          </>
        ) : null}

        {tab === 'access' ? <ModuleAccessEditor data={data} onSaved={reload} /> : null}

        {tab === 'activity' ? (
          data.recentActivity.length ? (
            <DataTable columns={activityColumns} rows={data.recentActivity} rowKey={(row) => row.id} caption="Recent activity" />
          ) : (
            <p className="text-muted small">Nothing recorded for this user yet.</p>
          )
        ) : null}
      </div>
    );
  }

  return (
    <Modal open title={user.name} subtitle={`${titleCase(user.role)} · ${user.email}`} size="xl" onClose={onClose}>
      {body}
    </Modal>
  );
}
