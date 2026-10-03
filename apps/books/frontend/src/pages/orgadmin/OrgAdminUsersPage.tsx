import { useState } from 'react';

import type { User } from '@/api/types';
import { useOrgPanelAuth } from '@/auth/OrgPanelAuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { UsersSettings } from '@/pages/settings/UsersSettings';

import { UserOverviewModal } from './UserOverviewModal';

export function OrgAdminUsersPage() {
  const { organization } = useOrgPanelAuth();
  const [viewing, setViewing] = useState<User | null>(null);
  // Bumped when the user window closes so the list picks up a role changed there.
  const [listVersion, setListVersion] = useState(0);
  return (
    <div className="stack">
      <PageHeader
        title="Users"
        subtitle={`Roles, edit access, suspension and removal for ${organization?.name ?? 'your organization'}. Click a name to see their work and set what they can edit.`}
      />
      <UsersSettings key={listVersion} onViewUser={setViewing} />
      {viewing ? (
        <UserOverviewModal
          user={viewing}
          onClose={() => {
            setViewing(null);
            setListVersion((version) => version + 1);
          }}
        />
      ) : null}
    </div>
  );
}
