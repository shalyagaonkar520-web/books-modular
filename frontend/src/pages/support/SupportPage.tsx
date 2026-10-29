/**
 * Support (/support), for every role: report an issue, ask why something was
 * changed, ask for more users. The Rooman Books team (super admin) answers
 * here and by email. Flags a reviewer put on your own changes show here too.
 */
import { useLocation } from 'react-router-dom';
import { Flag } from 'lucide-react';

import { api } from '@/api/client';
import { reviewsApi } from '@/api/adminConsole';
import { useAuth } from '@/auth/AuthContext';
import { RequestsBoard, type RequestsApi, type SupportTicket } from '@/components/support/RequestsBoard';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { ChangeList } from '@/pages/admin/ChangeList';

const supportApi: RequestsApi = {
  list: () => api.get<SupportTicket[]>('/support/requests'),
  get: (id) => api.get<SupportTicket>(`/support/requests/${id}`),
  reply: (id, message) => api.post<SupportTicket>(`/support/requests/${id}/messages`, { message }),
  setStatus: (id, status) => api.post<SupportTicket>(`/support/requests/${id}/status`, { status }),
  open: (body) => api.post<SupportTicket>('/support/requests', body),
};

export function SupportPage() {
  const { isAdmin } = useAuth();
  const preset = (useLocation().state as { preset?: { subject: string; category: string; message: string } } | null)?.preset ?? null;
  const flags = useAsync((signal) => reviewsApi.mine(signal).catch(() => null), []);
  const flagged = flags.data?.items ?? [];
  return (
    <div className="stack">
      <PageHeader
        title="Support"
        subtitle={`Report an issue, ask why something was changed, or ask for more users. The Rooman Books team answers here and by email.${
          isAdmin ? ' You see every request from your organization.' : ''
        }`}
      />
      {flagged.length ? (
        <Card title="Flags on my work" subtitle="A reviewer flagged these changes of yours. Fix them, or reply through a support request if you disagree.">
          <div className="alert alert-warning">
            <Flag size={14} aria-hidden="true" /> {flagged.length} of your changes {flagged.length === 1 ? 'was' : 'were'} flagged.
          </div>
          <ChangeList rows={flagged} />
        </Card>
      ) : null}
      <RequestsBoard api={supportApi} side="org" preset={preset} />
    </div>
  );
}
