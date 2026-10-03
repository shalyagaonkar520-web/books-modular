import { orgAdminApi } from '@/api/orgAdmin';
import { PageHeader } from '@/components/ui/PageHeader';
import { RazorpayIntegrationSettings, type RazorpayIntegrationApi } from '@/pages/settings/RazorpayIntegrationSettings';

const API: RazorpayIntegrationApi = { loadStatus: orgAdminApi.razorpay.status, sync: orgAdminApi.razorpay.sync };

/** Razorpay for this organization: connection status, sync and its history. The keys are the platform admin's. */
export function OrgAdminIntegrationsPage() {
  return (
    <div className="stack">
      <PageHeader title="Integrations" subtitle="Razorpay payments for your organization." />
      <RazorpayIntegrationSettings api={API} />
    </div>
  );
}
