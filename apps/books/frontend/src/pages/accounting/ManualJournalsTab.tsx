import { useEffect, useState } from 'react';
import { Eye, Undo2 } from 'lucide-react';

import { accountingApi } from '@/api/endpoints';
import type { Account, JournalEntry } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
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

export function ManualJournalsTab({ accounts }: { accounts: Account[] }) {
  const { t } = useAppContent();
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

  const sourceOptions = [
    { value: '', label: t('accounting.journals.filter.allSources') },
    ...SOURCE_TYPES.map((value) => ({ value, label: titleCase(value) })),
  ];

  const confirmReverse = async () => {
    if (!reverseTarget) return;
    const reversal = await action.run(() => accountingApi.reverseJournal(reverseTarget.id));
    setReverseTarget(null);
    if (reversal) {
      toast.success(t('accounting.journals.toast.reversed', { number: reversal.entryNumber }));
      journals.reload();
    }
  };

  const rows = journals.data?.items ?? [];

  const columns: Array<Column<JournalEntry>> = [
    { key: 'entryNumber', header: t('accounting.journals.col.entryNumber'), render: (entry) => <span className="code-tag">{entry.entryNumber}</span> },
    { key: 'date', header: t('accounting.journals.col.date'), render: (entry) => formatDate(entry.date) },
    { key: 'reference', header: t('accounting.journals.col.reference'), render: (entry) => <span className="text-muted">{entry.reference ?? '—'}</span> },
    { key: 'source', header: t('accounting.journals.col.source'), render: (entry) => <Badge tone={entry.sourceType === 'manual' ? 'info' : 'neutral'}>{titleCase(entry.sourceType)}</Badge> },
    {
      key: 'reversal',
      header: t('accounting.journals.col.reversal'),
      render: (entry) => (entry.isReversal ? <Badge tone="warning">{t('accounting.journals.badge.reversal')}</Badge> : <span className="text-subtle">—</span>),
    },
    { key: 'total', header: t('accounting.journals.col.total'), align: 'right', render: (entry) => <span className="num">{formatCurrency(entry.total)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '80px',
      render: (entry) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="action-btn"
            aria-label={t('accounting.journals.viewAria', { number: entry.entryNumber })}
            onClick={() => setDetail(entry)}
          >
            <Eye size={15} />
          </button>
          {canWrite && entry.sourceType === 'manual' && !entry.isReversal ? (
            <button
              type="button"
              className="action-btn"
              aria-label={t('accounting.journals.reverseAria', { number: entry.entryNumber })}
              onClick={() => setReverseTarget(entry)}
            >
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
          placeholder={t('accounting.journals.searchPlaceholder')}
        />
        <label className="filter-select">
          <span>{t('accounting.journals.filter.from')}</span>
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
          <span>{t('accounting.journals.filter.to')}</span>
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
          label={t('accounting.journals.filter.source')}
          value={sourceType}
          options={sourceOptions}
          onChange={(value) => {
            setSourceType(value);
            resetPage();
          }}
        />
        <IfCanWrite>
          <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>
            {t('accounting.journals.newEntry')}
          </Button>
        </IfCanWrite>
      </Toolbar>

      <Card title={t('accounting.journals.cardTitle')} subtitle={t('accounting.journals.count', { count: journals.data?.total ?? 0 })}>
        {journals.loading ? (
          <SkeletonRows rows={8} columns={6} />
        ) : journals.error ? (
          <ErrorBlock message={journals.error} onRetry={journals.reload} />
        ) : !rows.length ? (
          <EmptyState title={t('accounting.journals.empty.title')} description={t('accounting.journals.empty.body')} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(entry) => entry.id} onRowClick={setDetail} caption={t('accounting.journals.tableCaption')} />
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
        title={t('accounting.journals.reverse.title')}
        message={
          reverseTarget
            ? t('accounting.journals.reverse.body', { number: reverseTarget.entryNumber, date: formatDate(reverseTarget.date) })
            : ''
        }
        confirmLabel={t('accounting.journals.reverse.confirm')}
        tone="primary"
        busy={action.submitting}
        onConfirm={() => void confirmReverse()}
        onCancel={() => setReverseTarget(null)}
      />
    </>
  );
}
