import { useNavigate } from 'react-router-dom';
import { Activity, LayoutTemplate, LogIn, MailPlus, UserCheck, Users } from 'lucide-react';

import { APP_MODULES } from '@/api/appContent';
import { orgAdminApi } from '@/api/orgAdmin';
import type { AuditLog, User } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime, formatNumber, titleCase } from '@/utils/format';

/** Every role the app knows, so the breakdown shows 0 rather than hiding a role nobody has yet. */
const ROLES: Array<{ key: string; label: string }> = [
  { key: 'admin', label: 'Admin' },
  { key: 'staff', label: 'Staff' },
  { key: 'viewer', label: 'Viewer' },
  { key: 'employee', label: 'Employee' },
];

function UserStatusBadge({ user }: { user: User }) {
  if (user.pendingInvite) return <Badge tone="warning">Invite pending</Badge>;
  return user.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>;
}

export function OrgAdminDashboardPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync((signal) => orgAdminApi.dashboard(signal), []);

  if (loading && !data) return <LoadingBlock label="Building the organization dashboard…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const { users, appContent } = data;
  const roleRows = [
    ...ROLES,
    // A role the server reports that this build does not know yet still gets a row.
    ...Object.keys(users.byRole)
      .filter((key) => !ROLES.some((role) => role.key === key))
      .map((key) => ({ key, label: titleCase(key) })),
  ];
  const disabledModules = appContent.disabledModules.map(
    (key) => APP_MODULES.find((module) => module.key === key)?.label ?? titleCase(key),
  );

  const userColumns: Array<Column<User>> = [
    {
      key: 'name',
      header: 'User',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          <small style={{ wordBreak: 'break-all' }}>{row.email}</small>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (row) => titleCase(row.role) },
    { key: 'status', header: 'Status', render: (row) => <UserStatusBadge user={row} /> },
    {
      key: 'lastLogin',
      header: 'Last login',
      align: 'right',
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'Never'),
    },
  ];

  const activityColumns: Array<Column<AuditLog>> = [
    {
      key: 'action',
      header: 'Activity',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.summary ?? titleCase(row.action)}</span>
          <small>{titleCase(row.entityType)}{row.userName ? ` · ${row.userName}` : ''}</small>
        </div>
      ),
    },
    { key: 'when', header: 'When', align: 'right', render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <>
      <PageHeader
        title="Organization overview"
        subtitle={`Users, activity and app content for ${data.organization.name}.`}
      />

      <div className="stat-grid">
        <StatTile
          label="Users"
          value={formatNumber(users.total, 0)}
          sublabel={`${users.active} active · ${users.inactive} inactive`}
          icon={<Users size={16} />}
        />
        <StatTile label="Active" value={formatNumber(users.active, 0)} tone="positive" icon={<UserCheck size={16} />} />
        <StatTile
          label="Pending invites"
          value={formatNumber(users.pendingInvites, 0)}
          sublabel={users.pendingInvites > 0 ? 'Waiting to be accepted' : 'No open invites'}
          tone={users.pendingInvites > 0 ? 'warning' : 'neutral'}
          icon={<MailPlus size={16} />}
        />
        <StatTile
          label="Signed in last 30 days"
          value={formatNumber(users.signedInLast30Days, 0)}
          icon={<LogIn size={16} />}
        />
        <StatTile
          label="Activity last 7 days"
          value={formatNumber(data.activityLast7Days, 0)}
          sublabel="Recorded actions"
          icon={<Activity size={16} />}
        />
        <StatTile
          label="Customized app fields"
          value={formatNumber(appContent.customizedFields, 0)}
          sublabel="Differ from the shared content"
          icon={<LayoutTemplate size={16} />}
        />
      </div>

      <div className="grid-2">
        <Card
          title="Users by role"
          subtitle="Everyone with access to this organization"
          actions={
            <button type="button" className="btn btn-link btn-sm" onClick={() => navigate('/org-admin/users')}>
              <span>Manage users</span>
            </button>
          }
        >
          <ul className="quick-links-list" aria-label="Users by role">
            {roleRows.map((role) => (
              <li key={role.key}>
                <span>{role.label}</span>
                <span className="strong num">{formatNumber(users.byRole[role.key] ?? 0, 0)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="App content"
          subtitle="How this organization's app differs from the shared content"
          actions={
            <button type="button" className="btn btn-link btn-sm" onClick={() => navigate('/org-admin/app-content')}>
              <span>Edit app content</span>
            </button>
          }
        >
          <div className="stack">
            <p className="small" style={{ margin: 0 }}>
              <span className="strong">{formatNumber(appContent.customizedFields, 0)}</span> customized{' '}
              {appContent.customizedFields === 1 ? 'field' : 'fields'}
            </p>
            {disabledModules.length === 0 ? (
              <p className="text-muted small" style={{ margin: 0 }}>Every module is on.</p>
            ) : (
              <div>
                <h3 className="card-subtitle" style={{ margin: '4px 0 6px' }}>
                  Turned-off modules
                </h3>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {disabledModules.map((label) => (
                    <Badge key={label} tone="neutral">{label}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Recent users</h2>
            <p className="card-subtitle">Newest members of this organization</p>
          </div>
          <button type="button" className="btn btn-link btn-sm" onClick={() => navigate('/org-admin/users')}>
            <span>View all users</span>
          </button>
        </div>
        {data.recentUsers.length === 0 ? (
          <div className="card-body">
            <p className="text-muted small">No users yet.</p>
          </div>
        ) : (
          <DataTable columns={userColumns} rows={data.recentUsers} rowKey={(row) => row.id} caption="Recent users" />
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Recent activity</h2>
            <p className="card-subtitle">Latest actions in this organization</p>
          </div>
          <button type="button" className="btn btn-link btn-sm" onClick={() => navigate('/org-admin/settings?tab=activity')}>
            <span>Open activity log</span>
          </button>
        </div>
        {data.recentActivity.length === 0 ? (
          <div className="card-body">
            <p className="text-muted small">Nothing recorded yet.</p>
          </div>
        ) : (
          <DataTable columns={activityColumns} rows={data.recentActivity} rowKey={(row) => row.id} caption="Recent activity" />
        )}
      </div>
    </>
  );
}
