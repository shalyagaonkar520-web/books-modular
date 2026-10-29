/**
 * Requests between an organization and the platform, with their chat. The org
 * admin panel opens requests and writes; the super admin answers and closes.
 * The open conversation refreshes every 10 seconds.
 */
import { useEffect, useState } from 'react';
import { MessageSquarePlus, RefreshCw, Send } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime } from '@/utils/format';

export interface SupportMessage {
  id: string;
  authorKind: 'org' | 'platform';
  authorName: string;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  organizationId: string;
  organizationName?: string | null;
  subject: string;
  category: string;
  status: 'open' | 'closed';
  createdByName: string;
  createdAt: string;
  lastMessageAt: string;
  lastMessageBy: 'org' | 'platform';
  messages: SupportMessage[];
}

export interface RequestsApi {
  list: (status?: string) => Promise<SupportTicket[]>;
  get: (id: string) => Promise<SupportTicket>;
  reply: (id: string, message: string) => Promise<SupportTicket>;
  setStatus: (id: string, status: 'open' | 'closed') => Promise<SupportTicket>;
  open?: (body: { subject: string; category: string; message: string }) => Promise<SupportTicket>;
}

const CATEGORIES = [
  { value: 'users', label: 'More users' },
  { value: 'plan', label: 'Plan or payment' },
  { value: 'problem', label: 'Something is wrong' },
  { value: 'other', label: 'Other' },
];
const categoryLabel = (value: string) => CATEGORIES.find((c) => c.value === value)?.label ?? value;

interface Props {
  api: RequestsApi;
  /** Who is looking: the organization's panel or the platform. */
  side: 'org' | 'platform';
  /** Open the "new request" form at once, filled in (e.g. from "Request more users"). */
  preset?: { subject: string; category: string; message: string } | null;
}

export function RequestsBoard({ api, side, preset }: Props) {
  const [filter, setFilter] = useState<'open' | 'closed' | ''>(side === 'platform' ? 'open' : '');
  const list = useAsync(() => api.list(filter || undefined), [api, filter]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(Boolean(preset));
  const waiting = (t: SupportTicket) => t.status === 'open' && t.lastMessageBy !== side;

  return (
    <div className="requests-board">
      <Card
        title={side === 'org' ? 'Your requests' : 'Requests from organizations'}
        actions={
          <div className="row-actions">
            <SelectField
              label="Show"
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'open' | 'closed' | '')}
              options={[
                { value: '', label: 'All' },
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
              ]}
            />
            {api.open ? (
              <Button variant="primary" size="sm" icon={<MessageSquarePlus size={15} />} onClick={() => setCreating(true)}>
                New request
              </Button>
            ) : null}
          </div>
        }
      >
        {list.loading ? <LoadingBlock /> : null}
        {list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : null}
        {!list.loading && !list.error && (list.data ?? []).length === 0 ? (
          <EmptyState title="No requests" description={side === 'org' ? 'Need more users, help with a payment, or found a problem? Send a request and chat with the platform team here.' : 'Requests organizations send appear here.'} />
        ) : null}
        <ul className="requests-list">
          {(list.data ?? []).map((t) => (
            <li key={t.id}>
              <button type="button" className={`requests-item ${selected === t.id ? 'is-active' : ''}`} onClick={() => setSelected(t.id)}>
                <span className="requests-item-subject">
                  {waiting(t) ? <span className="requests-dot" aria-label="Waiting for your reply" /> : null}
                  {t.subject}
                </span>
                <span className="small text-muted">
                  {side === 'platform' && t.organizationName ? `${t.organizationName} · ` : ''}
                  {categoryLabel(t.category)} · {formatDateTime(t.lastMessageAt)}
                </span>
                <Badge tone={t.status === 'open' ? (waiting(t) ? 'warning' : 'info') : 'neutral'}>
                  {t.status === 'closed' ? 'Closed' : waiting(t) ? 'Needs your reply' : 'Waiting for reply'}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {selected ? <Thread api={api} id={selected} side={side} onChanged={list.reload} /> : null}

      {creating && api.open ? (
        <NewRequest
          preset={preset ?? null}
          open={api.open}
          onClose={() => setCreating(false)}
          onCreated={(ticket) => {
            setCreating(false);
            list.reload();
            setSelected(ticket.id);
          }}
        />
      ) : null}
    </div>
  );
}

function Thread({ api, id, side, onChanged }: { api: RequestsApi; id: string; side: 'org' | 'platform'; onChanged: () => void }) {
  const toast = useToast();
  const ticket = useAsync(() => api.get(id), [api, id]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { reload } = ticket;

  useEffect(() => {
    const timer = window.setInterval(() => reload(), 10000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const send = async () => {
    setBusy(true);
    try {
      await api.reply(id, message.trim());
      setMessage('');
      reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (status: 'open' | 'closed') => {
    await api.setStatus(id, status);
    reload();
    onChanged();
  };

  if (ticket.loading && !ticket.data) return <LoadingBlock />;
  if (ticket.error || !ticket.data) return <ErrorBlock message={ticket.error ?? ''} onRetry={reload} />;
  const t = ticket.data;
  return (
    <Card
      title={t.subject}
      subtitle={`${side === 'platform' && t.organizationName ? `${t.organizationName} · ` : ''}${categoryLabel(t.category)} · opened by ${t.createdByName}`}
      actions={
        <div className="row-actions">
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => reload()}>
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void toggle(t.status === 'open' ? 'closed' : 'open')}>
            {t.status === 'open' ? 'Close request' : 'Reopen'}
          </Button>
        </div>
      }
    >
      <div className="chat">
        {t.messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.authorKind === side ? 'is-mine' : ''}`}>
            <div className="chat-meta">
              <strong>{m.authorKind === 'platform' ? `${m.authorName} (platform)` : m.authorName}</strong> · {formatDateTime(m.createdAt)}
            </div>
            <div className="chat-body pre-wrap">{m.body}</div>
          </div>
        ))}
      </div>
      <div className="chat-reply">
        <TextAreaField label="Your message" rows={3} value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} />
        <Button variant="primary" icon={<Send size={15} />} loading={busy} disabled={!message.trim()} onClick={() => void send()}>
          Send
        </Button>
      </div>
      {t.status === 'closed' ? <p className="small text-muted">This request is closed. Writing a message opens it again.</p> : null}
    </Card>
  );
}

function NewRequest({
  preset,
  open,
  onClose,
  onCreated,
}: {
  preset: { subject: string; category: string; message: string } | null;
  open: NonNullable<RequestsApi['open']>;
  onClose: () => void;
  onCreated: (ticket: SupportTicket) => void;
}) {
  const [subject, setSubject] = useState(preset?.subject ?? '');
  const [category, setCategory] = useState(preset?.category ?? 'problem');
  const [message, setMessage] = useState(preset?.message ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      onCreated(await open({ subject: subject.trim(), category, message: message.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="New request to the platform"
      subtitle="Ask for more users, a plan change, or tell us what went wrong. You can chat about it afterwards."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={subject.trim().length < 3 || !message.trim()} onClick={() => void send()}>
            Send request
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <SelectField label="About" value={category} options={CATEGORIES} onChange={(e) => setCategory(e.target.value)} />
        <TextField label="Subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
        <TextAreaField label="Message" rows={5} value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} />
      </div>
    </Modal>
  );
}
