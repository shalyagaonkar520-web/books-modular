import { useState } from 'react';
import { Download, FileText, Pencil, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card, StatTile } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { downloadFile, ApiError } from '@/api/client';
import { documentsApi } from '@/api/endpoints';
import type { StoredDocument } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatBytes, formatDateTime, formatNumber } from '@/utils/format';

import { documentCategoryLabel, documentCategoryOptions } from './categories';
import { DocumentEditModal } from './DocumentEditModal';
import { DocumentUploadCard } from './DocumentUploadCard';

const PAGE_SIZE = 25;
const STATS_SAMPLE = 200;

export function DocumentsPage() {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StoredDocument | null>(null);
  const [deleting, setDeleting] = useState<StoredDocument | null>(null);
  const debouncedSearch = useDebounced(search);
  const remove = useSubmit();

  const list = useAsync(
    () => documentsApi.list({ page, page_size: PAGE_SIZE, category: category || undefined, search: debouncedSearch || undefined }),
    [page, category, debouncedSearch],
  );
  const stats = useAsync(() => documentsApi.list({ page: 1, page_size: STATS_SAMPLE }), []);

  const refreshAll = () => {
    list.reload();
    stats.reload();
  };

  const changeFilter = (next: string) => {
    setCategory(next);
    setPage(1);
  };

  const changeSearch = (next: string) => {
    setSearch(next);
    setPage(1);
  };

  const download = async (row: StoredDocument) => {
    try {
      await downloadFile(`/documents/${row.id}/download`, row.originalFilename);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('documents.toast.downloadFailed'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await remove.run(() => documentsApi.remove(deleting.id));
    if (result) {
      toast.success(result.message);
      setDeleting(null);
      refreshAll();
    } else if (remove.errorRef.current) {
      toast.error(remove.errorRef.current);
    }
  };

  const sample = stats.data?.items ?? [];
  const sampledBytes = sample.reduce((sum, row) => sum + row.sizeBytes, 0);
  const categoryCounts = sample.reduce<Record<string, number>>((counts, row) => {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
    return counts;
  }, {});
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
  const total = stats.data?.total ?? 0;
  const sizeSublabel = total > sample.length ? t('documents.stat.storageRecent', { count: sample.length }) : t('documents.stat.storageAll');

  const columns: Array<Column<StoredDocument>> = [
    {
      key: 'title',
      header: t('documents.col.document'),
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.title}</span>
          <small>{row.originalFilename}</small>
        </div>
      ),
    },
    { key: 'category', header: t('documents.col.category'), render: (row) => <Badge tone="info">{documentCategoryLabel(row.category, t)}</Badge> },
    { key: 'size', header: t('documents.col.size'), align: 'right', render: (row) => <span className="num">{formatBytes(row.sizeBytes)}</span> },
    { key: 'uploadedBy', header: t('documents.col.uploadedBy'), render: (row) => row.uploadedByName ?? <span className="text-muted">—</span> },
    { key: 'uploadedAt', header: t('documents.col.uploadedAt'), render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'checksum',
      header: t('documents.col.checksum'),
      render: (row) => (
        <span className="mono" title={row.sha256}>
          {row.sha256.slice(0, 12)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '120px',
      render: (row) => (
        <div className="row-actions">
          <button type="button" className="action-btn" onClick={() => download(row)} aria-label={t('documents.downloadAria', { title: row.title })} title={t('documents.downloadTitle')}>
            <Download size={15} />
          </button>
          <IfCanWrite>
            <button type="button" className="action-btn" onClick={() => setEditing(row)} aria-label={t('documents.editAria', { title: row.title })} title={t('documents.editTitle')}>
              <Pencil size={15} />
            </button>
            <button type="button" className="action-btn is-danger" onClick={() => setDeleting(row)} aria-label={t('documents.deleteAria', { title: row.title })} title={t('documents.deleteTitle')}>
              <Trash2 size={15} />
            </button>
          </IfCanWrite>
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      <PageHeader title={t('documents.title')} subtitle={t('documents.subtitle')} />

      <div className="stat-grid">
        <StatTile label={t('documents.stat.documents')} value={formatNumber(total, 0)} sublabel={t('documents.stat.documentsSub')} icon={<FileText size={16} />} />
        <StatTile label={t('documents.stat.storage')} value={formatBytes(sampledBytes)} sublabel={sizeSublabel} />
        <StatTile
          label={t('documents.stat.largestCategory')}
          value={topCategory ? documentCategoryLabel(topCategory[0], t) : '—'}
          sublabel={
            topCategory
              ? t(topCategory[1] === 1 ? 'documents.stat.countOne' : 'documents.stat.countMany', { count: topCategory[1] })
              : t('documents.stat.nothingUploaded')
          }
        />
      </div>

      {canWrite ? <DocumentUploadCard onUploaded={refreshAll} /> : null}

      <Card title={t('documents.listTitle')}>
        <Toolbar>
          <SearchInput value={search} onChange={changeSearch} placeholder={t('documents.searchPlaceholder')} />
          <FilterSelect
            label={t('documents.filter.category')}
            value={category}
            onChange={changeFilter}
            options={[{ value: '', label: t('documents.filter.allCategories') }, ...documentCategoryOptions(t)]}
          />
        </Toolbar>

        {list.loading ? <LoadingBlock label={t('documents.loading')} /> : null}
        {!list.loading && list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : null}
        {!list.loading && !list.error && list.data && list.data.items.length === 0 ? (
          <EmptyState
            title={category || debouncedSearch ? t('documents.empty.filteredTitle') : t('documents.empty.title')}
            description={category || debouncedSearch ? t('documents.empty.filteredBody') : t('documents.empty.body')}
          />
        ) : null}
        {!list.loading && !list.error && list.data && list.data.items.length > 0 ? (
          <>
            <DataTable columns={columns} rows={list.data.items} rowKey={(row) => row.id} caption={t('documents.tableCaption')} />
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={setPage} />
          </>
        ) : null}
      </Card>

      {editing ? <DocumentEditModal document={editing} onClose={() => setEditing(null)} onSaved={refreshAll} /> : null}

      <ConfirmDialog
        open={!!deleting}
        title={t('documents.delete.title')}
        message={
          deleting ? (
            <>
              <strong>{deleting.title}</strong> {t('documents.delete.body')}
            </>
          ) : (
            ''
          )
        }
        confirmLabel={t('documents.delete.confirm')}
        busy={remove.submitting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
