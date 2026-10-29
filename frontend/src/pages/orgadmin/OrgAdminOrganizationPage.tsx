import { useOrgPanelAuth } from '@/auth/OrgPanelAuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { downloadOrgPanelFile } from '@/api/orgPanelClient';
import { ExportAllCard } from '@/pages/settings/ExportAllCard';
import { OrganizationSettings } from '@/pages/settings/OrganizationSettings';

/** The organization's profile: name, GSTIN, PAN, address and contact details. */
export function OrgAdminOrganizationPage() {
  const { organization } = useOrgPanelAuth();
  return (
    <div className="stack">
      <PageHeader title="Organization" subtitle={`GST, address and contact details of ${organization?.name ?? 'your organization'}.`} />
      <OrganizationSettings />
      <ExportAllCard download={(name) => downloadOrgPanelFile('/org-admin/export', name)} />
    </div>
  );
}
