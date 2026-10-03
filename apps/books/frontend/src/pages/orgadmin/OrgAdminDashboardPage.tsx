import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Briefcase, LogIn, MailPlus, UserCheck, UserX, Users } from 'lucide-react';

import { orgAdminApi, type OrgAdminDashboard } from '@/api/orgAdmin';
import type { AuditLog, User } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { formatDate, formatDateTime, formatNumber, titleCase } from '@/utils/format';

import { UserOverviewModal } from './UserOverviewModal';

type RecentEmployee = OrgAdminDashboard['recentEmployees'][number];

/** Every role the app knows, so the breakdown shows 0 rather than hiding a role nobody has yet. */
const ROLES = ['admin', 'staff', 'viewer', 'employee'];

function UserStatusBadge({ user }: { user: User }) {
  if (user.pendingInvite) return <Badge tone="warning">Invite pending</Badge>;
  return user.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Suspended</Badge>;
}

function CountList({ label, rows }: { label: string; rows: Array<[string, number]> }) {
  if (!rows.length) return <p className="text-muted small">None yet.</p>;
  return (
    <ul className="quick-links-list" aria-label={label}>
      {rows.map(([key, count]) => (
        <li key={key}>
          <span>{key}</span>
          <span className="strong num">{formatNumber(count, 0)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The panel's home: the organization's users and employees at a glance. */
export function OrgAdminDashboardPage() {
  const navigate = useNavigate();
  const [viewing, setViewing] = useState<User | null>(null);
  const { data, loading, error, reload } = useAsync((signal) => orgAdminApi.dashboard(signal), []);

  if (loading && !data) return <LoadingBlock label="Building the dashboard…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const { users, employees } = data;
  const roleRows: Array<[string, number]> = [
    ...ROLES.map((role): [string, number] => [titleCase(role), users.byRole[role] ?? 0]),
    // A role the server reports that this build does not know yet still gets a row.
    ...Object.entries(users.byRole)
      .filter(([role]) => !ROLES.includes(role))
      .map(([role, count]): [string, number] => [titleCase(role), count]),
  ];
  const departmentRows = Object.entries(employees.byDepartment).sort((a, b) => b[1] - a[1]);

  const userColumns: Array<Column<User>> = [
    {
      key: 'name',
      header: 'User',
      render: (row) => (
        <div className="cell-stack">
          <button type="button" className="btn-link strong" onClick={() => setViewing(row)}>
            {row.name}
          </button>
          <small style={{ wordBreak: 'break-all' }}>{row.email}</small>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (row) => titleCase(row.role) },
    { key: 'status', header: 'Status', render: (row) => <UserStatusBadge user={row} /> },
    { key: 'lastLogin', header: 'Last login', align: 'right', render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'Never') },
  ];

  const employeeColumns: Array<Column<RecentEmployee>> = [
    {
      key: 'name',
      header: 'Employee',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          <small>{[row.employeeCode, row.designation].filter(Boolean).join(' · ')}</small>
        </div>
      ),
    },
    { key: 'department', header: 'Department', render: (row) => row.department || '-' },
    { key: 'joined', header: 'Joined', render: (row) => formatDate(row.dateOfJoining) },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (row) => (
        <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
          {row.hasLogin ? <Badge tone="info">Portal login</Badge> : null}
          {row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
        </span>
      ),
    },
  ];

  const activityColumns: Array<Column<AuditLog>> = [
    {
      key: 'action',
      header: 'Activity',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.summary ?? titleCase(row.action)}</span>
          <small>
            {titleCase(row.entityType)}
            {row.userName ? ` · ${row.userName}` : ''}
          </small>
        </div>
      ),
    },
    { key: 'when', header: 'When', align: 'right', render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Users and employees of ${data.organizationName}.`} />

      <div className="stat-grid">
        <StatTile label="Users" value={formatNumber(users.total, 0)} sublabel={`${users.active} active`} icon={<Users size={16} />} />
        <StatTile label="Active users" value={formatNumber(users.active, 0)} tone="positive" icon={<UserCheck size={16} />} />
        <StatTile
          label="Suspended"
          value={formatNumber(users.suspended, 0)}
          tone={users.suspended ? 'warning' : 'neutral'}
          icon={<UserX size={16} />}
        />
        <StatTile
          label="Pending invites"
          value={formatNumber(users.pendingInvites, 0)}
          tone={users.pendingInvites ? 'warning' : 'neutral'}
          icon={<MailPlus size={16} />}
        />
        <StatTile label="Signed in last 30 days" value={formatNumber(users.signedInLast30Days, 0)} icon={<LogIn size={16} />} />
        <StatTile
          label="Employees"
          value={formatNumber(employees.total, 0)}
          sublabel={`${employees.active} active · ${employees.inactive} inactive`}
          icon={<Briefcase size={16} />}
        />
        <StatTile
          label="Joined last 30 days"
          value={formatNumber(employees.joinedLast30Days, 0)}
          sublabel={`${employees.withLogin} with a portal login`}
          icon={<Briefcase size={16} />}
        />
        <StatTile label="Activity last 7 days" value={formatNumber(data.activityLast7Days, 0)} icon={<Activity size={16} />} />
      </div>

      <div className="grid-2">
        <Card
          title="Users by role"
          actions={
            <button type="button" className="btn btn-link btn-sm" onClick={() => navigate('/org-admin/users')}>
              <span>Manage users</span>
            </button>
          }
        >
          <CountList label="Users by role" rows={roleRows} />
        </Card>
        <Card title="Active employees by department">
          <CountList label="Employees by department" rows={departmentRows} />
        </Card>
      </div>

      <Card title="Recent users" subtitle="Click a name to see their performance and pending work">
        {data.recentUsers.length ? (
          <DataTable columns={userColumns} rows={data.recentUsers} rowKey={(row) => row.id} caption="Recent users" />
        ) : (
          <p className="text-muted small">No users yet.</p>
        )}
      </Card>

      <Card title="Recent employees">
        {data.recentEmployees.length ? (
          <DataTable columns={employeeColumns} rows={data.recentEmployees} rowKey={(row) => row.id} caption="Recent employees" />
        ) : (
          <p className="text-muted small">No employees yet.</p>
        )}
      </Card>

      <Card
        title="Recent activity"
        actions={
          <button type="button" className="btn btn-link btn-sm" onClick={() => navigate('/org-admin/activity')}>
            <span>Full activity log</span>
          </button>
        }
      >
        {data.recentActivity.length ? (
          <DataTable columns={activityColumns} rows={data.recentActivity} rowKey={(row) => row.id} caption="Recent activity" />
        ) : (
          <p className="text-muted small">Nothing recorded yet.</p>
        )}
      </Card>

      {viewing ? <UserOverviewModal user={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}
