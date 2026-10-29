/**
 * Support (/support), for every role: report an issue, ask why something was
 * changed, ask for more users. The Rooman Books team (super admin) answers
 * here and by email. A reviewer's messages about your own changes (and
 * changes they put on hold) show here too, with a box to answer them.
 */
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquareReply, Send } from 'lucide-react';

import { api } from '@/api/client';
import { reviewsApi, type ChangeEntry } from '@/api/adminConsole';
import { useAuth } from '@/auth/AuthContext';
import { RequestsBoard, type RequestsApi, type SupportTicket } from '@/components/support/RequestsBoard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextAreaField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
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
  const mine = flags.data?.items ?? [];
  const [answering, setAnswering] = useState<string | null>(null);
  return (
    <div className="stack">
      <PageHeader
        title="Support"
        subtitle={`Report an issue, ask why something was changed, or ask for more users. The Rooman Books team answers here and by email.${
          isAdmin ? ' You see every request from your organization.' : ''
        }`}
      />
      {mine.length ? (
        <Card
          title="Reviewer messages about my work"
          subtitle="A reviewer checked these changes of yours. Answer them here (or fix the record first); your answer goes back to the reviewer."
        >
          <ChangeList
            rows={mine}
            actions={(row) =>
              answering === row.id ? (
                <ReplyBox
                  row={row}
                  onDone={() => {
                    setAnswering(null);
                    flags.reload();
                  }}
                />
              ) : (
                <Button variant="primary" size="sm" icon={<MessageSquareReply size={14} />} onClick={() => setAnswering(row.id)}>
                  Reply to {row.reviewedByName ?? 'the reviewer'}
                </Button>
              )
            }
          />
        </Card>
      ) : null}
      <RequestsBoard api={supportApi} side="org" preset={preset} />
    </div>
  );
}

function ReplyBox({ row, onDone }: { row: ChangeEntry; onDone: () => void }) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await reviewsApi.reply(row.id, message.trim());
      toast.success(`Sent to ${row.reviewedByName ?? 'the reviewer'}.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="chat-reply review-reply">
      <TextAreaField
        label={`Your answer to ${row.reviewedByName ?? 'the reviewer'}`}
        rows={2}
        value={message}
        maxLength={2000}
        placeholder="e.g. Corrected the price to ₹110."
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button variant="primary" icon={<Send size={15} />} loading={busy} disabled={!message.trim()} onClick={() => void send()}>
        Send
      </Button>
    </div>
  );
}
