import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { UsersSettings } from '@/pages/settings/UsersSettings';

export function OrgAdminUsersPage() {
  const { organization } = useAuth();
  return (
    <div className="stack">
      <PageHeader
        title="Users"
        subtitle={`Invite and manage the admins, staff and viewers of ${organization?.name ?? 'your organization'}.`}
      />
      <UsersSettings />
    </div>
  );
}
