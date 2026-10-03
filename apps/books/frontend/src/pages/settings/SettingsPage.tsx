import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';

import { OrganizationSettings } from './OrganizationSettings';

/**
 * The organization profile. Users, integrations and the activity log are
 * managed in the organization admin panel (/org-admin), not in the app.
 */
export function SettingsPage() {
  const { t } = useAppContent();

  return (
    <div className="stack">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <OrganizationSettings />
    </div>
  );
}
