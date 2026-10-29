/**
 * "On hold" on a record a reviewer put on hold (or sent a message about), so
 * everyone sees it where they work: a badge in lists and a banner on the record.
 */
import { PauseCircle, MessageSquare } from 'lucide-react';

import { api } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { useAsync } from '@/hooks/useAsync';

export interface RecordHold {
  status: 'hold' | 'flagged';
  note?: string | null;
  by?: string | null;
}

/** Holds for one kind of record (backend table name, e.g. "items", "invoices"), by record id. */
export function useHolds(entityType: string) {
  const holds = useAsync(
    (signal) => api.get<Record<string, RecordHold>>('/reviews/holds', { entity_type: entityType }, signal).catch(() => ({}) as Record<string, RecordHold>),
    [entityType],
  );
  return holds.data ?? {};
}

export function HoldBadge({ hold }: { hold?: RecordHold }) {
  if (!hold) return null;
  return (
    <Badge tone={hold.status === 'hold' ? 'warning' : 'danger'}>
      {hold.status === 'hold' ? 'On hold' : 'Reviewer question'}
    </Badge>
  );
}

export function HoldBanner({ hold }: { hold?: RecordHold }) {
  if (!hold) return null;
  const held = hold.status === 'hold';
  return (
    <div className={`alert ${held ? 'alert-warning' : 'alert-error'} hold-banner`} role="status">
      {held ? <PauseCircle size={16} aria-hidden="true" /> : <MessageSquare size={16} aria-hidden="true" />}
      <span>
        <strong>{held ? `On hold by ${hold.by ?? 'a reviewer'}` : `${hold.by ?? 'A reviewer'} sent a question about this`}</strong>
        {hold.note ? ` — ${hold.note}` : ''}
        {held ? '. Wait for the review before relying on it.' : '. Answer it on the Support page.'}
      </span>
    </div>
  );
}
