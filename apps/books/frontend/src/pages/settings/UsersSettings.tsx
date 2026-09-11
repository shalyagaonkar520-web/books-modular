import { useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { orgApi } from '@/api/endpoints';
import type { Role, User } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime } from '@/utils/format';

import { InviteUserModal } from './InviteUserModal';
import { ResetPasswordModal } from './ResetPasswordModal';

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'admin', label: 'Administrator' },
  { value: 'staff', label: 'Staff' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'employee', label: 'Employee (portal only)' },
];

export function UsersSettings() {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const { data, loading, error, reload } = useAsync(() => orgApi.users(), []);
  const users = data ?? [];

  const updateUser = async (target: User, body: { role?: string; isActive?: boolean }, successMessage: string) => {
    setBusyId(target.id);
    const result = await action.run(() => orgApi.updateUser(target.id, body));
    setBusyId(null);
    if (result) {
      toast.success(successMessage);
      reload();
    } else if (action.error) {
      toast.error(action.error);
    }
  };

  const columns: Array<Column<User>> = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">
            {row.name}
            {row.id === currentUser?.id ? ' (you)' : ''}
          </span>
          <small>{row.email}</small>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '180px',
      render: (row) => (
        <label className="filter-select">
          <span className="sr-only">Role for {row.name}</span>
          <select
            className="select select-sm"
            value={row.role}
            disabled={busyId === row.id}
            onChange={(event) =>
              updateUser(
                row,
                { role: event.target.value },
                `${row.name} is now ${ROLE_OPTIONS.find((option) => option.value === event.target.value)?.label ?? event.target.value}.`,
              )
            }
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        if (!row.isActive) return <Badge tone="neutral">Deactivated</Badge>;
        // An invited user exists but has no password yet, so "Active" alone
        // reads as though they can already sign in.
        if (row.pendingInvite) return <Badge tone="warning">Invite sent</Badge>;
        return <Badge tone="success">Active</Badge>;
      },
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (row) =>
        row.lastLoginAt ? (
          formatDateTime(row.lastLoginAt)
        ) : (
          <span className="text-muted">{row.pendingInvite ? 'Awaiting invite' : 'Never'}</span>
        ),
    },
    { key: 'created', header: 'Added', render: (row) => formatDate(row.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '240px',
      render: (row) => (
        <div className="row-actions">
          <Button variant="ghost" size="sm" icon={<KeyRound size={14} />} onClick={() => setResetting(row)}>
            Reset password
          </Button>
          <Button
            variant={row.isActive ? 'secondary' : 'primary'}
            size="sm"
            loading={busyId === row.id}
            onClick={() =>
              updateUser(
                row,
                { isActive: !row.isActive },
                row.isActive ? `${row.name} can no longer sign in.` : `${row.name} can sign in again.`,
              )
            }
          >
            {row.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      <Card
        title="Users"
        subtitle="Administrators manage everything, staff can record transactions, viewers are read-only"
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setInviting(true)}>
            Invite user
          </Button>
        }
      >
        <p className="text-muted small">
          An organization always needs at least one active administrator, and you cannot change your own role or deactivate your own account.
        </p>
        {loading ? <LoadingBlock label="Loading users…" /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && users.length === 0 ? <EmptyState title="No users yet" description="Invite a colleague to collaborate." /> : null}
        {!loading && !error && users.length > 0 ? (
          <DataTable columns={columns} rows={users} rowKey={(row) => row.id} caption="Users in this organization" />
        ) : null}
      </Card>

      {inviting ? <InviteUserModal onClose={() => setInviting(false)} onInvited={reload} /> : null}
      {resetting ? <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} /> : null}
    </div>
  );
}
