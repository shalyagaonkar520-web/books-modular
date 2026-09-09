import { useEffect, useState } from 'react';
import { Eye, Undo2 } from 'lucide-react';

import { accountingApi } from '@/api/endpoints';
import type { Account, JournalEntry } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, titleCase } from '@/utils/format';

import { JournalDetailModal, NewJournalModal } from './JournalModals';

const PAGE_SIZE = 25;

const SOURCE_TYPES = [
  'manual',
  'invoice',
  'invoice_cogs',
  'bill',
  'bill_stock',
  'customer_payment',
  'vendor_payment',
  'expense',
  'bank_transaction',
  'transfer',
  'payroll',
  'inventory_adjustment',
  'bank_opening',
  'item_opening',
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  ...SOURCE_TYPES.map((sourceType) => ({ value: sourceType, label: titleCase(sourceType) })),
];

export function ManualJournalsTab({ accounts }: { accounts: Account[] }) {
  const { canWrite } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [sourceType, setSourceType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [detail, setDetail] = useState<JournalEntry | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null);

  const journals = useAsync(
    () =>
      accountingApi.journals({
        page,
        page_size: PAGE_SIZE,
        source_type: sourceType || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        search: debouncedSearch.trim() || undefined,
      }),
    [page, sourceType, startDate, endDate, debouncedSearch],
  );

  const action = useSubmit();
  useEffect(() => {
    if (action.error) toast.error(action.error);
  }, [action.error, toast]);

  const confirmReverse = async () => {
    if (!reverseTarget) return;
    const reversal = await action.run(() => accountingApi.reverseJournal(reverseTarget.id));
    setReverseTarget(null);
    if (reversal) {
      toast.success(`Reversal ${reversal.entryNumber} posted.`);
      journals.reload();
    }
  };

  const rows = journals.data?.items ?? [];

  const columns: Array<Column<JournalEntry>> = [
    { key: 'entryNumber', header: 'Entry #', render: (entry) => <span className="code-tag">{entry.entryNumber}</span> },
    { key: 'date', header: 'Date', render: (entry) => formatDate(entry.date) },
    { key: 'reference', header: 'Reference', render: (entry) => <span className="text-muted">{entry.reference ?? '—'}</span> },
    { key: 'source', header: 'Source', render: (entry) => <Badge tone={entry.sourceType === 'manual' ? 'info' : 'neutral'}>{titleCase(entry.sourceType)}</Badge> },
    { key: 'reversal', header: 'Reversal', render: (entry) => (entry.isReversal ? <Badge tone="warning">Reversal</Badge> : <span className="text-subtle">—</span>) },
    { key: 'total', header: 'Total', align: 'right', render: (entry) => <span className="num">{formatCurrency(entry.total)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '80px',
      render: (entry) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="action-btn" aria-label={`View journal ${entry.entryNumber}`} onClick={() => setDetail(entry)}>
            <Eye size={15} />
          </button>
          {canWrite && entry.sourceType === 'manual' && !entry.isReversal ? (
            <button type="button" className="action-btn" aria-label={`Reverse journal ${entry.entryNumber}`} onClick={() => setReverseTarget(entry)}>
              <Undo2 size={15} />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  const resetPage = () => setPage(1);

  return (
    <>
      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            resetPage();
          }}
          placeholder="Search entry number, reference or notes…"
        />
        <label className="filter-select">
          <span>From</span>
          <input
            type="date"
            className="select select-sm"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              resetPage();
            }}
          />
        </label>
        <label className="filter-select">
          <span>To</span>
          <input
            type="date"
            className="select select-sm"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              resetPage();
            }}
          />
        </label>
        <FilterSelect
          label="Source"
          value={sourceType}
          options={SOURCE_OPTIONS}
          onChange={(value) => {
            setSourceType(value);
            resetPage();
          }}
        />
        <IfCanWrite>
          <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
            New journal entry
          </Button>
        </IfCanWrite>
      </Toolbar>

      <Card title="Journal entries" subtitle={`${journals.data?.total ?? 0} entry(s)`}>
        {journals.loading ? (
          <SkeletonRows rows={8} columns={6} />
        ) : journals.error ? (
          <ErrorBlock message={journals.error} onRetry={journals.reload} />
        ) : !rows.length ? (
          <EmptyState title="No journal entries found" description="Adjust the filters, or post a manual journal entry." />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(entry) => entry.id} onRowClick={setDetail} caption="Journal entries" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={journals.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>

      <JournalDetailModal entry={detail} onClose={() => setDetail(null)} />
      <NewJournalModal
        open={newOpen}
        accounts={accounts}
        onClose={() => setNewOpen(false)}
        onSaved={(message) => {
          setNewOpen(false);
          toast.success(message);
          journals.reload();
        }}
      />
      <ConfirmDialog
        open={!!reverseTarget}
        title="Reverse journal entry"
        message={
          reverseTarget
            ? `Post a reversing entry for ${reverseTarget.entryNumber} dated ${formatDate(reverseTarget.date)}? The original entry stays on record.`
            : ''
        }
        confirmLabel="Reverse entry"
        tone="primary"
        busy={action.submitting}
        onConfirm={() => void confirmReverse()}
        onCancel={() => setReverseTarget(null)}
      />
    </>
  );
}
