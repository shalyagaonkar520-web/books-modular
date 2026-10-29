/**
 * Reviews (/reviews): every change by the roles and people a reviewer is
 * connected to (an admin sees everyone's), each asking "is this correct?".
 * Approve it, put it On hold, or Send a message to the person who made it;
 * their reply brings the change back to "To check".
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, LifeBuoy, MessageSquare, PauseCircle, RotateCcw } from 'lucide-react';

import { reviewsApi, type ChangeEntry, type ReviewAction, type ReviewStatus } from '@/api/adminConsole';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { ChangeList } from '@/pages/admin/ChangeList';
import { askAboutChange } from '@/pages/admin/ChangeLogPage';

const PAGE_SIZE = 25;
const TABS: Array<{ id: ReviewStatus; label: string }> = [
  { id: 'waiting', label: 'To check' },
  { id: 'hold', label: 'On hold' },
  { id: 'flagged', label: 'Message sent' },
  { id: 'reviewed', label: 'Approved' },
  { id: 'all', label: 'All' },
];
const DONE: Record<ReviewAction, string> = {
  reviewed: 'Approved.',
  hold: 'Put on hold.',
  flagged: 'Message sent. They see it on their Support page and can reply.',
  waiting: 'Back in To check.',
};

type Asking = { ids: string[]; action: 'hold' | 'flagged' };

export function ReviewsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { isAdmin, isReviewer } = useAuth();
  const [status, setStatus] = useState<ReviewStatus>('waiting');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [asking, setAsking] = useState<Asking | null>(null);
  const summary = useAsync((signal) => reviewsApi.summary(signal), []);
  const list = useAsync(
    (signal) => reviewsApi.list({ status, page, page_size: PAGE_SIZE, search: search.trim() || undefined }, signal),
    [status, page, search],
  );

  if (!isAdmin && !isReviewer) {
    return (
      <div className="state-block state-empty">
        <h3>Reviews are for reviewers</h3>
        <p>Ask an administrator to make you a reviewer.</p>
      </div>
    );
  }

  const refresh = () => {
    setSelected(new Set());
    summary.reload();
    list.reload();
  };
  const mark = async (ids: string[], to: ReviewAction, note?: string) => {
    try {
      if (ids.length === 1) await reviewsApi.mark(ids[0], to, note);
      else await reviewsApi.markMany(ids, to, note);
      toast.success(ids.length > 1 ? `${ids.length} changes: ${DONE[to].toLowerCase()}` : DONE[to]);
      refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const rows = list.data?.items ?? [];
  const s = summary.data;

  return (
    <div className="stack">
      <PageHeader
        title="Reviews"
        subtitle={
          s
            ? `You review the work of ${s.scope.join(', ') || 'nobody yet'}. For each change: is it correct? Approve it, hold it, or send them a message.`
            : 'Changes waiting for your review.'
        }
      />
      {s ? (
        <div className="stat-grid">
          <StatTile label="To check" value={String(s.waiting)} tone={s.waiting ? 'warning' : 'neutral'} />
          <StatTile label="On hold" value={String(s.hold)} />
          <StatTile label="Message sent" value={String(s.flagged)} sublabel="Waiting for their reply" tone={s.flagged ? 'negative' : 'neutral'} />
          <StatTile label="Approved" value={String(s.reviewed)} tone="positive" />
        </div>
      ) : null}
      <Card>
        <Tabs
          tabs={TABS}
          active={status}
          onChange={(id) => {
            setStatus(id as ReviewStatus);
            setPage(1);
            setSelected(new Set());
          }}
        />
        <div className="row-actions review-toolbar">
          <TextField
            label="Search"
            placeholder="Number, name, amount…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {rows.length ? (
            <Button variant="ghost" size="sm" onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>
              {selected.size === rows.length ? 'Clear selection' : 'Select all on this page'}
            </Button>
          ) : null}
          {selected.size ? (
            <>
              <Button variant="primary" size="sm" icon={<CheckCheck size={14} />} onClick={() => void mark([...selected], 'reviewed')}>
                Approve {selected.size}
              </Button>
              <Button variant="secondary" size="sm" icon={<PauseCircle size={14} />} onClick={() => setAsking({ ids: [...selected], action: 'hold' })}>
                Hold {selected.size}
              </Button>
            </>
          ) : null}
        </div>
        {list.loading && !list.data ? <LoadingBlock label="Loading changes…" /> : null}
        {list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : null}
        {list.data && rows.length === 0 ? (
          <EmptyState
            title={status === 'waiting' ? 'All checked' : 'Nothing here'}
            description="Every time someone you review adds, changes or deletes something, it appears under To check."
          />
        ) : null}
        {rows.length ? (
          <>
            <ChangeList
              rows={rows}
              ask
              selected={selected}
              onToggle={toggle}
              actions={(row: ChangeEntry) => (
                <>
                  {row.reviewStatus !== 'reviewed' ? (
                    <Button variant="primary" size="sm" icon={<CheckCheck size={14} />} onClick={() => void mark([row.id], 'reviewed')}>
                      Approve
                    </Button>
                  ) : null}
                  {row.reviewStatus !== 'hold' ? (
                    <Button variant="secondary" size="sm" icon={<PauseCircle size={14} />} onClick={() => setAsking({ ids: [row.id], action: 'hold' })}>
                      Hold
                    </Button>
                  ) : null}
                  <Button variant="secondary" size="sm" icon={<MessageSquare size={14} />} onClick={() => setAsking({ ids: [row.id], action: 'flagged' })}>
                    Send message
                  </Button>
                  {row.reviewStatus ? (
                    <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => void mark([row.id], 'waiting')}>
                      Undo
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" icon={<LifeBuoy size={14} />} onClick={() => askAboutChange(navigate, row)}>
                    Ask Support
                  </Button>
                </>
              )}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        ) : null}
      </Card>
      {asking ? <NoteModal asking={asking} onClose={() => setAsking(null)} onSend={(note) => mark(asking.ids, asking.action, note)} /> : null}
    </div>
  );
}

function NoteModal({ asking, onClose, onSend }: { asking: Asking; onClose: () => void; onSend: (note: string) => Promise<boolean> }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const message = asking.action === 'flagged';
  const many = asking.ids.length > 1;
  const send = async () => {
    setSaving(true);
    setError(null);
    const ok = await onSend(note.trim());
    setSaving(false);
    if (ok) onClose();
    else setError('Could not save. Try again.');
  };
  return (
    <Modal
      open
      title={message ? 'Send a message' : many ? `Hold ${asking.ids.length} changes` : 'Put on hold'}
      subtitle={
        message
          ? 'Ask a question or say what to fix. They see it on their Support page and can reply; their reply brings the change back to To check.'
          : 'Keep it aside while you check. The person who made it sees it is on hold. A note is optional.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void send()} loading={saving} disabled={message && note.trim().length < 3}>
            {message ? 'Send message' : 'Hold'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <TextAreaField
          label={message ? 'Message' : 'Note (optional)'}
          placeholder={message ? 'e.g. The price should be ₹110, please correct it.' : 'e.g. Checking with accounts'}
          value={note}
          maxLength={1000}
          rows={4}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}
