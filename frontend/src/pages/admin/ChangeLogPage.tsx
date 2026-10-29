/** Every change in the organization, field by field (even ₹1), with filters and a record's full history. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, MessageSquare } from 'lucide-react';

import { adminConsoleApi, type ChangeEntry } from '@/api/adminConsole';
import { useScopedOrgApi } from '@/api/ApiScope';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useAsync } from '@/hooks/useAsync';

import { ChangeList, recordKind } from './ChangeList';

const PAGE_SIZE = 25;

/** Ask Support about one change: opens /support with the request filled in. */
export function askAboutChange(navigate: ReturnType<typeof useNavigate>, row: ChangeEntry) {
  const what = `${recordKind(row.entityType)}${row.entityLabel ? ` “${row.entityLabel}”` : ''}`;
  const fields = Object.entries(row.changes)
    .map(([field, [before, after]]) => `${field}: ${before ?? '—'} → ${after ?? '—'}`)
    .join('\n');
  navigate('/support', {
    state: {
      preset: {
        category: 'change',
        subject: `Why was ${what} changed?`.slice(0, 200),
        message: `${row.userName ?? 'Someone'} ${row.action}d ${what} on ${new Date(row.createdAt).toLocaleString()}.\n${fields}\n\nWhy was this done?`,
      },
    },
  });
}

export function ChangeLogPage() {
  const navigate = useNavigate();
  const orgApi = useScopedOrgApi();
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [history, setHistory] = useState<ChangeEntry | null>(null);

  const users = useAsync(() => orgApi.users(), []);
  const types = useAsync((signal) => adminConsoleApi.changeTypes(signal), []);
  const list = useAsync(
    (signal) =>
      adminConsoleApi.changes(
        {
          page,
          page_size: PAGE_SIZE,
          user_id: userId || undefined,
          entity_type: entityType || undefined,
          action: action || undefined,
          search: search.trim() || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
        signal,
      ),
    [page, userId, entityType, action, search, dateFrom, dateTo],
  );
  const filter = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  return (
    <Card
      title="Change log"
      subtitle="Every change anyone makes, down to ₹1: who, when, which record, and each field’s old and new value. It cannot be edited or deleted."
    >
      <div className="form-grid-3 change-filters">
        <SelectField
          label="Who"
          value={userId}
          options={[{ value: '', label: 'Everyone' }, ...(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))]}
          onChange={(e) => filter(setUserId)(e.target.value)}
        />
        <SelectField
          label="Record"
          value={entityType}
          options={[{ value: '', label: 'All records' }, ...(types.data ?? []).map((ty) => ({ value: ty, label: recordKind(ty) }))]}
          onChange={(e) => filter(setEntityType)(e.target.value)}
        />
        <SelectField
          label="What"
          value={action}
          options={[
            { value: '', label: 'Created, changed or deleted' },
            { value: 'create', label: 'Created' },
            { value: 'update', label: 'Changed' },
            { value: 'delete', label: 'Deleted' },
          ]}
          onChange={(e) => filter(setAction)(e.target.value)}
        />
        <TextField label="Search" placeholder="Number, name, amount…" value={search} onChange={(e) => filter(setSearch)(e.target.value)} />
        <TextField label="From" type="date" value={dateFrom} onChange={(e) => filter(setDateFrom)(e.target.value)} />
        <TextField label="To" type="date" value={dateTo} onChange={(e) => filter(setDateTo)(e.target.value)} />
      </div>
      {list.loading && !list.data ? <LoadingBlock label="Loading changes…" /> : null}
      {list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.items.length === 0 ? <EmptyState title="No changes" description="Nothing matches these filters yet." /> : null}
      {list.data && list.data.items.length > 0 ? (
        <>
          <ChangeList
            rows={list.data.items}
            actions={(row) => (
              <>
                {row.entityId ? (
                  <Button variant="ghost" size="sm" icon={<History size={14} />} onClick={() => setHistory(row)}>
                    Full history
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" icon={<MessageSquare size={14} />} onClick={() => askAboutChange(navigate, row)}>
                  Ask why
                </Button>
              </>
            )}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={setPage} />
        </>
      ) : null}
      {history ? <RecordHistory row={history} onClose={() => setHistory(null)} /> : null}
    </Card>
  );
}

function RecordHistory({ row, onClose }: { row: ChangeEntry; onClose: () => void }) {
  const rows = useAsync(() => adminConsoleApi.recordHistory(row.entityType, row.entityId ?? ''), [row]);
  return (
    <Modal
      open
      size="lg"
      title={`History of ${recordKind(row.entityType)}${row.entityLabel ? ` “${row.entityLabel}”` : ''}`}
      subtitle="Every change to this record, oldest first."
      onClose={onClose}
    >
      {rows.loading ? <LoadingBlock /> : null}
      {rows.error ? <ErrorBlock message={rows.error} onRetry={rows.reload} /> : null}
      {rows.data ? <ChangeList rows={rows.data} /> : null}
    </Modal>
  );
}
