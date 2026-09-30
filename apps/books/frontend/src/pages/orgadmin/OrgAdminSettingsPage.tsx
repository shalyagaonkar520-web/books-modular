import { useSearchParams } from 'react-router-dom';

import { useOrgPanelAuth } from '@/auth/OrgPanelAuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { ActivityLogSettings } from '@/pages/settings/ActivityLogSettings';
import { OrganizationSettings } from '@/pages/settings/OrganizationSettings';

const TABS = [
  { id: 'organization', label: 'Organization' },
  { id: 'activity', label: 'Activity log' },
];

export function OrgAdminSettingsPage() {
  const { organization } = useOrgPanelAuth();
  // The tab lives in the URL so the dashboard can link straight to the activity log.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab') ?? '';
  const tab = TABS.some((entry) => entry.id === requested) ? requested : 'organization';

  return (
    <div className="stack">
      <PageHeader
        title="Settings"
        subtitle={`Profile and activity log for ${organization?.name ?? 'your organization'}.`}
      />
      <Tabs tabs={TABS} active={tab} onChange={(id) => setSearchParams(id === 'organization' ? {} : { tab: id }, { replace: true })} />
      {tab === 'organization' ? <OrganizationSettings /> : null}
      {tab === 'activity' ? <ActivityLogSettings /> : null}
    </div>
  );
}
