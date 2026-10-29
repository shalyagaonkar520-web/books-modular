import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';

import { TallyCard } from '@/pages/insights/TallyCard';
import { BranchesSettings } from '@/pages/operations/BranchesSettings';

import { downloadFile } from '@/api/client';

import { CurrencySettings } from './CurrencySettings';
import { ExportAllCard } from './ExportAllCard';
import { LockDateSettings } from './LockDateSettings';
import { OrganizationSettings } from './OrganizationSettings';

/**
 * The organization profile. Users and the activity log are
 * managed in the organization admin panel (/org-admin), not in the app.
 */
export function SettingsPage() {
  const { t } = useAppContent();

  return (
    <div className="stack">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <OrganizationSettings />
      <LockDateSettings />
      <CurrencySettings />
      <BranchesSettings />
      <TallyCard />
      <ExportAllCard download={(name) => downloadFile('/organization/export', name)} />
    </div>
  );
}
