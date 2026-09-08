import { useState } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';

import { ActivityLogSettings } from './ActivityLogSettings';
import { OrganizationSettings } from './OrganizationSettings';
import { UsersSettings } from './UsersSettings';

type SettingsTab = 'organization' | 'users' | 'activity';

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('organization');

  return (
    <div className="stack">
      <PageHeader title="Settings" subtitle="Organization profile, team access and the audit trail" />
      <Tabs
        tabs={[
          { id: 'organization', label: 'Organization' },
          { id: 'users', label: 'Users' },
          { id: 'activity', label: 'Activity log' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as SettingsTab)}
      />
      {tab === 'organization' ? <OrganizationSettings /> : null}
      {tab === 'users' ? <UsersSettings /> : null}
      {tab === 'activity' ? <ActivityLogSettings /> : null}
    </div>
  );
}
