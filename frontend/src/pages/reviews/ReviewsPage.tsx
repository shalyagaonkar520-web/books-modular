/**
 * Reviews (/reviews): a reviewer's list of changes by the roles and people they
 * are connected to (an admin sees everyone's). Mark each Reviewed, or Flag it
 * with a note the person who made it sees in Support.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, Flag, MessageSquare, RotateCcw } from 'lucide-react';

import { reviewsApi, type ChangeEntry, type ReviewStatus } from '@/api/adminConsole';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { ChangeList } from '@/pages/admin/ChangeList';
import { askAboutChange } from '@/pages/admin/ChangeLogPage';
import { PageHeader } from '@/components/ui/PageHeader';

const PAGE_SIZE = 25;
const TABS: Array<{ id: ReviewStatus; label: string }> = [
  { id: 'waiting', label: 'Waiting' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'all', label: 'All' },
];

export function ReviewsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { isAdmin, isReviewer } = useAuth();
  const [status, setStatus] = useState<ReviewStatus>('waiting');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [flagging, setFlagging] = useState<string[] | null>(null);
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
  const mark = async (ids: string[], to: 'reviewed' | 'flagged' | 'waiting', note?: string) => {
    try {
      if (ids.length === 1) await reviewsApi.mark(ids[0], to, note);
      else await reviewsApi.markMany(ids, to, note);
      toast.success(
        to === 'reviewed' ? `${ids.length} change(s) marked reviewed.` : to === 'flagged' ? 'Flagged. They will see your note.' : 'Back in the waiting list.',
      );
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

  return (
    <div className="stack">
      <PageHeader
        title="Reviews"
        subtitle={
          summary.data
            ? `Changes by ${summary.data.scope.join(', ') || 'nobody yet'}. Mark each one Reviewed, or Flag it with a note for the person who made it.`
            : 'Changes waiting for your review.'
        }
      />
      {summary.data ? (
        <div className="stat-grid">
          <StatTile label="Waiting" value={String(summary.data.waiting)} tone={summary.data.waiting ? 'warning' : 'neutral'} />
          <StatTile label="Flagged" value={String(summary.data.flagged)} tone={summary.data.flagged ? 'negative' : 'neutral'} />
          <StatTile label="Reviewed" value={String(summary.data.reviewed)} tone="positive" />
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
                Mark {selected.size} reviewed
              </Button>
              <Button variant="danger" size="sm" icon={<Flag size={14} />} onClick={() => setFlagging([...selected])}>
                Flag {selected.size}
              </Button>
            </>
          ) : null}
        </div>
        {list.loading && !list.data ? <LoadingBlock label="Loading changes…" /> : null}
        {list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : null}
        {list.data && rows.length === 0 ? (
          <EmptyState title={status === 'waiting' ? 'All caught up' : 'Nothing here'} description="Changes by the people you review appear here as they are saved." />
        ) : null}
        {rows.length ? (
          <>
            <ChangeList
              rows={rows}
              selected={selected}
              onToggle={toggle}
              actions={(row: ChangeEntry) => (
                <>
                  {row.reviewStatus !== 'reviewed' ? (
                    <Button variant="secondary" size="sm" icon={<CheckCheck size={14} />} onClick={() => void mark([row.id], 'reviewed')}>
                      Reviewed
                    </Button>
                  ) : null}
                  {row.reviewStatus !== 'flagged' ? (
                    <Button variant="ghost" size="sm" icon={<Flag size={14} />} onClick={() => setFlagging([row.id])}>
                      Flag
                    </Button>
                  ) : null}
                  {row.reviewStatus ? (
                    <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => void mark([row.id], 'waiting')}>
                      Undo
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" icon={<MessageSquare size={14} />} onClick={() => askAboutChange(navigate, row)}>
                    Ask Support
                  </Button>
                </>
              )}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        ) : null}
      </Card>
      {flagging ? <FlagModal count={flagging.length} onClose={() => setFlagging(null)} onFlag={(note) => mark(flagging, 'flagged', note)} /> : null}
    </div>
  );
}

function FlagModal({ count, onClose, onFlag }: { count: number; onClose: () => void; onFlag: (note: string) => Promise<boolean> }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flag = async () => {
    setSaving(true);
    setError(null);
    const ok = await onFlag(note.trim());
    setSaving(false);
    if (ok) onClose();
    else setError('Could not flag. Try again.');
  };
  return (
    <Modal
      open
      title={count === 1 ? 'Flag this change' : `Flag ${count} changes`}
      subtitle="Say what is wrong. The person who made the change sees your note under Support → Flags on my work."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void flag()} loading={saving} disabled={note.trim().length < 3}>
            Flag
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <TextAreaField label="What is wrong?" value={note} maxLength={1000} rows={4} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
