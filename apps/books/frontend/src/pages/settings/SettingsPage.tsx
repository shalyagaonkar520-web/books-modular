import { useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';

import { ActivityLogSettings } from './ActivityLogSettings';
import { OrganizationSettings } from './OrganizationSettings';
import { RazorpayIntegrationSettings } from './RazorpayIntegrationSettings';
import { UsersSettings } from './UsersSettings';

type SettingsTab = 'organization' | 'users' | 'integrations' | 'activity';

export function SettingsPage() {
  const { t } = useAppContent();
  const [tab, setTab] = useState<SettingsTab>('organization');

  return (
    <div className="stack">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <Tabs
        tabs={[
          { id: 'organization', label: t('settings.tab.organization') },
          { id: 'users', label: t('settings.tab.users') },
          { id: 'integrations', label: t('settings.tab.integrations') },
          { id: 'activity', label: t('settings.tab.activity') },
        ]}
        active={tab}
        onChange={(id) => setTab(id as SettingsTab)}
      />
      {tab === 'organization' ? <OrganizationSettings /> : null}
      {tab === 'users' ? <UsersSettings /> : null}
      {tab === 'integrations' ? <RazorpayIntegrationSettings /> : null}
      {tab === 'activity' ? <ActivityLogSettings /> : null}
    </div>
  );
}
