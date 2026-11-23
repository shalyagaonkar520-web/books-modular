import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Bot, Boxes, ChartNoAxesCombined, Check, Coins, HandCoins, Megaphone, Percent, ShoppingBag, Sparkles, UserCog, Users, Wallet, X, Zap, type LucideIcon } from 'lucide-react';

import { fetchAttachmentUrl, type Card, type ChatMessage } from '@/api/workspace';
import { Button } from '@/components/ui/Button';

/** Every specialist has its own icon and colour, so you can see who is talking. */
const AGENT_UI: Record<string, { icon: LucideIcon; tone: string }> = {
  buddy: { icon: Bot, tone: 'sg-blue' },
  finance: { icon: Wallet, tone: 'sg-indigo' },
  sales: { icon: HandCoins, tone: 'sg-pink' },
  marketing: { icon: Megaphone, tone: 'sg-orange' },
  inventory: { icon: Boxes, tone: 'sg-teal' },
  purchase: { icon: ShoppingBag, tone: 'sg-emerald' },
  collections: { icon: Coins, tone: 'sg-amber' },
  customer: { icon: Users, tone: 'sg-blue' },
  tax: { icon: Percent, tone: 'sg-green' },
  payroll: { icon: UserCog, tone: 'sg-rose' },
  analyst: { icon: ChartNoAxesCombined, tone: 'sg-violet' },
};

function AgentBadge({ agentKey, name, small }: { agentKey: string; name: string; small?: boolean }) {
  const ui = AGENT_UI[agentKey] ?? { icon: Bot, tone: 'sg-slate' };
  return (
    <span className={`ws-agent-pill ${ui.tone} ${small ? 'is-small' : ''}`}>
      <i className="ws-agent-av">
        <ui.icon size={small ? 11 : 13} strokeWidth={2} aria-hidden="true" />
      </i>
      {name}
    </span>
  );
}

/** **bold** and bullet lines, nothing else: assistant text is plain text, never HTML. */
function formatText(text: string): ReactNode {
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, i) => (
    <p key={i}>
      {para.split('\n').map((line, j) => (
        <span key={j}>
          {j > 0 ? <br /> : null}
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, k) => (part.startsWith('**') && part.endsWith('**') ? <strong key={k}>{part.slice(2, -2)}</strong> : part))}
        </span>
      ))}
    </p>
  ));
}

function Thumb({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    fetchAttachmentUrl(id)
      .then((u) => {
        revoked = u;
        if (active) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [id]);
  return url ? <img className="ws-thumb" src={url} alt={name} /> : <span className="ws-thumb" aria-label={name} />;
}

function CardView({ card }: { card: Card }) {
  if (card.type === 'table') {
    return (
      <div className="ws-card">
        <div className="ws-card-head">{card.title}</div>
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                {card.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  if (card.type === 'stats') {
    return (
      <div className="ws-card">
        <div className="ws-card-head">{card.title}</div>
        <div className="ws-stats">
          {card.items.map((item) => (
            <div className="ws-stat" key={item.label}>
              <small>{item.label}</small>
              <b>{item.value}</b>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="ws-card ws-preview">
      <div className="ws-card-head">{card.title}</div>
      <dl>
        {card.fields.map((f) => (
          <div key={f.label} style={{ display: 'contents' }}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      {card.lines ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                {card.lines.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.lines.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {card.warnings.map((w) => (
        <div className="ws-warn" key={w}>
          {w}
        </div>
      ))}
    </div>
  );
}

interface Props {
  message: ChatMessage;
  /** Confirm / Cancel buttons are live only on the newest waiting request. */
  actionable: boolean;
  busy: boolean;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
}

export function MessageView({ message, actionable, busy, onConfirm, onCancel }: Props) {
  const mine = message.role === 'user';
  const meta = message.meta ?? {};
  const pending = meta.pending_action_id && (meta.pending_status === 'ready' || meta.pending_status === 'draft') ? meta.pending_action_id : null;
  return (
    <div className={`ws-msg ${mine ? 'is-user' : 'is-assistant'}`}>
      {mine ? null : (
        <span className="ws-msg-avatar" aria-hidden="true">
          <Sparkles size={16} />
        </span>
      )}
      <div className="ws-bubble">
        {meta.attachments?.length ? (
          <div className="ws-thumbs">
            {meta.attachments.map((a) => (
              <Thumb key={a.id} id={a.id} name={a.filename} />
            ))}
          </div>
        ) : null}
        {!mine && meta.agent ? (
          <div className="ws-agent-head">
            {meta.handover ? (
              <div className="ws-handover" aria-label={`${meta.handover.from.name} handed this over to ${meta.handover.to.name}`}>
                <AgentBadge agentKey={meta.handover.from.key} name={meta.handover.from.name} small />
                <span className="ws-handover-arrow">
                  <small>handed over</small>
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
                <AgentBadge agentKey={meta.handover.to.key} name={meta.handover.to.name} small />
              </div>
            ) : (
              <AgentBadge agentKey={meta.agent.key} name={meta.agent.name} />
            )}
          </div>
        ) : null}
        <div className="ws-text">{formatText(message.content)}</div>
        {mine ? null : (meta.cards ?? []).map((card, i) => <CardView key={i} card={card} />)}
        {!mine && pending && actionable ? (
          <div className="ws-actions">
            {meta.pending_status === 'ready' ? (
              <Button variant="primary" size="sm" icon={<Check size={15} />} loading={busy} onClick={() => onConfirm(pending)}>
                Confirm
              </Button>
            ) : null}
            <Button size="sm" icon={<X size={15} />} disabled={busy} onClick={() => onCancel(pending)}>
              Cancel
            </Button>
          </div>
        ) : null}
        {!mine && meta.used_ai !== undefined && !message.sending ? (
          <div className="ws-meta">
            <span className="ws-chip" title={meta.used_ai ? 'Understood with the AI model' : 'Answered directly from your data, no AI used'}>
              {meta.used_ai ? <Sparkles size={11} /> : <Zap size={11} />} {meta.used_ai ? 'AI' : 'Instant'}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
