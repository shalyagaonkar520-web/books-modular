/**
 * Support requests between an organization and the platform, with their chat.
 * The organization's users open requests and write; the super admin answers
 * and closes. The open conversation refreshes every 10 seconds.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CreditCard, HelpCircle, History, Inbox, LifeBuoy, MessageSquarePlus, RefreshCw, Send, Users, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime, initials } from '@/utils/format';

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

interface Category {
  value: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const CATEGORIES: Category[] = [
  { value: 'problem', label: 'Report an issue', hint: 'Something is broken or wrong', icon: AlertTriangle },
  { value: 'change', label: 'Why was something changed?', hint: 'Ask about a change in your books', icon: History },
  { value: 'users', label: 'More users', hint: 'Your plan is full', icon: Users },
  { value: 'plan', label: 'Plan or payment', hint: 'Renewal, payment, invoice', icon: CreditCard },
  { value: 'other', label: 'Other', hint: 'Anything else', icon: HelpCircle },
];
const category = (value: string) => CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1];

type Preset = { subject: string; category: string; message: string };

interface Props {
  api: RequestsApi;
  /** Who is looking: the organization or the platform. */
  side: 'org' | 'platform';
  /** Open the "new request" form at once, filled in (e.g. from "Request more users"). */
  preset?: Preset | null;
}

const FILTERS: Array<{ value: '' | 'open' | 'closed'; label: string }> = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

export function RequestsBoard({ api, side, preset }: Props) {
  const [filter, setFilter] = useState<'open' | 'closed' | ''>(side === 'platform' ? 'open' : '');
  const list = useAsync(() => api.list(filter || undefined), [api, filter]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState<Preset | null>(preset ?? null);
  const waiting = (t: SupportTicket) => t.status === 'open' && t.lastMessageBy !== side;
  const rows = list.data ?? [];
  const firstId = list.data?.[0]?.id ?? null;

  // Show the newest conversation straight away.
  useEffect(() => {
    if (!selected && firstId) setSelected(firstId);
  }, [firstId, selected]);

  const start = (value: string) => setCreating({ category: value, subject: '', message: '' });

  return (
    <div className="stack">
      {side === 'org' && api.open ? (
        <div className="support-start">
          {CATEGORIES.map((c) => (
            <button key={c.value} type="button" className="support-start-tile" onClick={() => start(c.value)}>
              <span className={`support-start-icon is-${c.value}`}>
                <c.icon size={18} />
              </span>
              <span className="support-start-text">
                <strong>{c.label}</strong>
                <small>{c.hint}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="requests-board">
        <section className="card requests-panel" aria-label={side === 'org' ? 'Your requests' : 'Requests from organizations'}>
          <div className="requests-panel-head">
            <h2 className="card-title">{side === 'org' ? 'Your requests' : 'Requests from organizations'}</h2>
            {api.open ? (
              <Button variant="primary" size="sm" icon={<MessageSquarePlus size={15} />} onClick={() => start('problem')}>
                New request
              </Button>
            ) : null}
          </div>
          <div className="requests-filter" role="radiogroup" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                className={`requests-chip ${filter === f.value ? 'is-active' : ''}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {list.loading && !list.data ? <LoadingBlock /> : null}
          {list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : null}
          {list.data && rows.length === 0 ? (
            <EmptyState
              title="No requests"
              description={
                side === 'org'
                  ? 'Pick one of the boxes above to ask the Rooman Books team. You get the answer here and by email.'
                  : 'Requests organizations send appear here.'
              }
            />
          ) : null}
          <ul className="requests-list">
            {rows.map((t) => {
              const c = category(t.category);
              return (
                <li key={t.id}>
                  <button type="button" className={`requests-item ${selected === t.id ? 'is-active' : ''}`} onClick={() => setSelected(t.id)}>
                    <span className={`support-start-icon is-${c.value} is-small`}>
                      <c.icon size={14} />
                    </span>
                    <span className="requests-item-text">
                      <span className="requests-item-subject">
                        {waiting(t) ? <span className="requests-dot" aria-label="Waiting for your reply" /> : null}
                        {t.subject}
                      </span>
                      <span className="small text-muted">
                        {side === 'platform' && t.organizationName ? `${t.organizationName} · ` : `${t.createdByName} · `}
                        {formatDateTime(t.lastMessageAt)}
                      </span>
                    </span>
                    <Badge tone={t.status === 'open' ? (waiting(t) ? 'warning' : 'info') : 'neutral'}>
                      {t.status === 'closed' ? 'Closed' : waiting(t) ? (side === 'org' ? 'New answer' : 'Needs reply') : 'Waiting'}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {selected ? (
          <Thread api={api} id={selected} side={side} onChanged={list.reload} />
        ) : (
          <section className="card requests-empty">
            <Inbox size={34} aria-hidden="true" />
            <p>Choose a request to read the conversation.</p>
          </section>
        )}
      </div>

      {creating && api.open ? (
        <NewRequest
          preset={creating}
          open={api.open}
          onClose={() => setCreating(null)}
          onCreated={(ticket) => {
            setCreating(null);
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
  const end = useRef<HTMLDivElement>(null);
  const count = ticket.data?.messages.length ?? 0;

  useEffect(() => {
    const timer = window.setInterval(() => reload(), 10000);
    return () => window.clearInterval(timer);
  }, [reload]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [count]);

  const send = async () => {
    if (!message.trim()) return;
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
  const c = category(t.category);
  return (
    <section className="card thread" aria-label={t.subject}>
      <header className="thread-head">
        <span className={`support-start-icon is-${c.value}`}>
          <c.icon size={18} />
        </span>
        <div className="thread-title">
          <h2 className="card-title">{t.subject}</h2>
          <p className="small text-muted">
            {side === 'platform' && t.organizationName ? `${t.organizationName} · ` : ''}
            {c.label} · opened by {t.createdByName} · {formatDateTime(t.createdAt)}
          </p>
        </div>
        <Badge tone={t.status === 'open' ? 'info' : 'neutral'}>{t.status === 'open' ? 'Open' : 'Closed'}</Badge>
        <div className="row-actions">
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={() => reload()} aria-label="Refresh">
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void toggle(t.status === 'open' ? 'closed' : 'open')}>
            {t.status === 'open' ? 'Close request' : 'Reopen'}
          </Button>
        </div>
      </header>

      <div className="chat">
        {t.messages.map((m) => {
          const fromSupport = m.authorKind === 'platform';
          const mine = m.authorKind === side;
          return (
            <div key={m.id} className={`chat-row ${mine ? 'is-mine' : ''}`}>
              <span className={`chat-avatar ${fromSupport ? 'is-support' : ''}`} aria-hidden="true">
                {fromSupport ? <LifeBuoy size={15} /> : initials(m.authorName)}
              </span>
              <div className={`chat-message ${mine ? 'is-mine' : ''} ${fromSupport ? 'is-support' : ''}`}>
                <div className="chat-meta">
                  <strong>{fromSupport ? `${m.authorName} · Rooman Books support` : m.authorName}</strong>
                  <span>{formatDateTime(m.createdAt)}</span>
                </div>
                <div className="chat-body pre-wrap">{m.body}</div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <div className="chat-reply">
        <TextAreaField
          label="Your message"
          rows={3}
          value={message}
          maxLength={5000}
          placeholder={t.status === 'closed' ? 'Writing a message opens this request again…' : 'Type your message… (Ctrl + Enter to send)'}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button variant="primary" icon={<Send size={15} />} loading={busy} disabled={!message.trim()} onClick={() => void send()}>
          Send
        </Button>
      </div>
    </section>
  );
}

function NewRequest({
  preset,
  open,
  onClose,
  onCreated,
}: {
  preset: Preset;
  open: NonNullable<RequestsApi['open']>;
  onClose: () => void;
  onCreated: (ticket: SupportTicket) => void;
}) {
  const [subject, setSubject] = useState(preset.subject);
  const [kind, setKind] = useState(preset.category || 'problem');
  const [message, setMessage] = useState(preset.message);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      onCreated(await open({ subject: subject.trim(), category: kind, message: message.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={category(kind).label}
      subtitle="The Rooman Books team answers here and by email. You can keep chatting in the same request."
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
        <SelectField label="About" value={kind} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} onChange={(e) => setKind(e.target.value)} />
        <TextField label="Subject" placeholder="In a few words" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
        <TextAreaField
          label="Message"
          rows={6}
          placeholder="What happened, where, and what you expected. Invoice numbers or amounts help."
          value={message}
          maxLength={5000}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
    </Modal>
  );
}
