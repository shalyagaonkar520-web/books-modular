import { useState } from 'react';
import { Eye, KeyRound, Plus, Trash2 } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useApiScope, useScopedOrgApi } from '@/api/ApiScope';
import type { Role, User } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatDateTime } from '@/utils/format';

import { InviteUserModal } from './InviteUserModal';
import { ResetPasswordModal } from './ResetPasswordModal';
import { UserDashboardModal } from './UserDashboardModal';

/** `labelKey` is an app-content key, translated at render. */
const ROLE_OPTIONS: Array<{ value: Role; labelKey: string }> = [
  { value: 'admin', labelKey: 'settings.users.role.admin' },
  { value: 'staff', labelKey: 'settings.users.role.staff' },
  { value: 'viewer', labelKey: 'settings.users.role.viewer' },
  { value: 'employee', labelKey: 'settings.users.role.employee' },
];

// "employee" is a portal-only role that can only be granted through the invite
// flow (which links a payroll employee); setting it inline would leave a user
// with a portal role but no employee record, 404-ing their portal. So it is not
// offered as an inline choice - only shown, disabled, when already in effect.
const ASSIGNABLE_ROLE_OPTIONS = ROLE_OPTIONS.filter((option) => option.value !== 'employee');

export function UsersSettings() {
  const { t } = useAppContent();
  const toast = useToast();
  const auth = useAuth();
  const { actor, capabilities } = useApiScope();
  const orgApi = useScopedOrgApi();
  // In the org admin panel the acting admin is not one of these users.
  const currentUserId = actor ? actor.userId : auth.user?.id;
  const isAdmin = actor ? actor.isAdmin : auth.isAdmin;
  const canView = capabilities.userDashboard;
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [inviting, setInviting] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();
  const deleteSubmit = useSubmit();

  const { data, loading, error, reload } = useAsync(() => orgApi.users(), []);
  const users = data ?? [];

  const confirmDeleteUser = async () => {
    if (!deletingUser) return;
    const result = await deleteSubmit.run(() => orgApi.deleteUser(deletingUser.id));
    if (result) {
      toast.success(result.message);
      setDeletingUser(null);
      reload();
    } else if (deleteSubmit.errorRef.current) {
      toast.error(deleteSubmit.errorRef.current);
    }
  };

  const updateUser = async (target: User, body: { role?: string; isActive?: boolean }, successMessage: string) => {
    setBusyId(target.id);
    const result = await action.run(() => orgApi.updateUser(target.id, body));
    setBusyId(null);
    if (result) {
      toast.success(successMessage);
      reload();
    } else if (action.errorRef.current) {
      toast.error(action.errorRef.current);
    }
  };

  const columns: Array<Column<User>> = [
    {
      key: 'name',
      header: t('settings.users.col.name'),
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">
            {row.name}
            {row.id === currentUserId ? ` ${t('settings.users.you')}` : ''}
          </span>
          <small>{row.email}</small>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('settings.users.col.role'),
      width: '180px',
      render: (row) => (
        <label className="filter-select">
          <span className="sr-only">{t('settings.users.roleFor', { name: row.name })}</span>
          <select
            className="select select-sm"
            value={row.role}
            disabled={busyId === row.id}
            onChange={(event) =>
              updateUser(
                row,
                { role: event.target.value },
                t('settings.users.roleChanged', {
                  name: row.name,
                  role: (() => {
                    const picked = ROLE_OPTIONS.find((option) => option.value === event.target.value);
                    return picked ? t(picked.labelKey) : event.target.value;
                  })(),
                }),
              )
            }
          >
            {row.role === 'employee' ? (
              <option value="employee" disabled>
                {t('settings.users.role.employee')}
              </option>
            ) : null}
            {ASSIGNABLE_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      ),
    },
    {
      key: 'status',
      header: t('settings.users.col.status'),
      render: (row) => {
        if (!row.isActive) return <Badge tone="neutral">{t('settings.users.status.deactivated')}</Badge>;
        // An invited user exists but has no password yet, so "Active" alone
        // reads as though they can already sign in.
        if (row.pendingInvite) return <Badge tone="warning">{t('settings.users.status.inviteSent')}</Badge>;
        return <Badge tone="success">{t('settings.users.status.active')}</Badge>;
      },
    },
    {
      key: 'lastLogin',
      header: t('settings.users.col.lastLogin'),
      render: (row) =>
        row.lastLoginAt ? (
          formatDateTime(row.lastLoginAt)
        ) : (
          <span className="text-muted">{row.pendingInvite ? t('settings.users.awaitingInvite') : t('settings.users.never')}</span>
        ),
    },
    { key: 'created', header: t('settings.users.col.added'), render: (row) => formatDate(row.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '360px',
      render: (row) => (
        <div className="row-actions">
          {isAdmin && canView && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Eye size={14} />}
              onClick={() => setViewingUser(row)}
            >
              {t('settings.users.view')}
            </Button>
          )}
          {canView ? (
            <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => setViewingUser(row)}>
              {t('settings.users.view')}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" icon={<KeyRound size={14} />} onClick={() => setResetting(row)}>
            {t('settings.users.resetPassword')}
          </Button>
          <Button
            variant={row.isActive ? 'secondary' : 'primary'}
            size="sm"
            loading={busyId === row.id}
            onClick={() =>
              updateUser(
                row,
                { isActive: !row.isActive },
                row.isActive ? t('settings.users.deactivated', { name: row.name }) : t('settings.users.activated', { name: row.name }),
              )
            }
          >
            {row.isActive ? t('settings.users.deactivate') : t('settings.users.activate')}
          </Button>
          {isAdmin && row.id !== currentUserId && (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={() => setDeletingUser(row)}
            >
              {t('settings.users.delete')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      <Card
        title={t('settings.users.title')}
        subtitle={t('settings.users.subtitle')}
        actions={
          <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setInviting(true)}>
            {t('settings.users.invite')}
          </Button>
        }
      >
        <p className="text-muted small">{t('settings.users.note')}</p>
        {loading ? <LoadingBlock label={t('settings.users.loading')} /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && users.length === 0 ? <EmptyState title={t('settings.users.empty.title')} description={t('settings.users.empty.description')} /> : null}
        {!loading && !error && users.length > 0 ? (
          <DataTable columns={columns} rows={users} rowKey={(row) => row.id} caption={t('settings.users.caption')} />
        ) : null}
      </Card>

      {viewingUser && canView ? <UserDashboardModal user={viewingUser} onClose={() => setViewingUser(null)} /> : null}
      {inviting ? <InviteUserModal onClose={() => setInviting(false)} onInvited={reload} /> : null}
      {resetting ? <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} /> : null}
      {viewingUser && canView ? <UserDashboardModal user={viewingUser} onClose={() => setViewingUser(null)} /> : null}

      <ConfirmDialog
        open={!!deletingUser}
        title={t('settings.users.deleteTitle')}
        message={
          deletingUser ? (
            <>
              {t('settings.users.deleteConfirm.before')} <strong>{deletingUser.name}</strong>{' '}
              {t('settings.users.deleteConfirm.after', { email: deletingUser.email })}
            </>
          ) : (
            ''
          )
        }
        confirmLabel={t('settings.users.delete')}
        busy={deleteSubmit.submitting}
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeletingUser(null)}
      />
    </div>
  );
}
