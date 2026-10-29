/** Requests to the platform (more users, plan, problems) and their chat, from the admin panel. */
import { useLocation } from 'react-router-dom';

import { orgPanelClient } from '@/api/orgPanelClient';
import { RequestsBoard, type RequestsApi, type SupportTicket } from '@/components/support/RequestsBoard';
import { PageHeader } from '@/components/ui/PageHeader';

const panelRequestsApi: RequestsApi = {
  list: () => orgPanelClient.get<SupportTicket[]>('/org-admin/requests'),
  get: (id) => orgPanelClient.get<SupportTicket>(`/org-admin/requests/${id}`),
  reply: (id, message) => orgPanelClient.post<SupportTicket>(`/org-admin/requests/${id}/messages`, { message }),
  setStatus: (id, status) => orgPanelClient.post<SupportTicket>(`/org-admin/requests/${id}/status`, { status }),
  open: (body) => orgPanelClient.post<SupportTicket>('/org-admin/requests', body),
};

export function OrgAdminRequestsPage() {
  const preset = (useLocation().state as { preset?: { subject: string; category: string; message: string } } | null)?.preset ?? null;
  return (
    <div className="stack">
      <PageHeader title="Requests" subtitle="Ask the platform team for more users or a plan change, or tell them about a problem, and chat about it here." />
      <RequestsBoard api={panelRequestsApi} side="org" preset={preset} />
    </div>
  );
}
