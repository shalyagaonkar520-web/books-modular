/** List of quotes, sales orders, credit notes, purchase orders or vendor credits. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';

import { docApi, type DocKindKey, type FlowDocumentListItem } from '@/api/docFlow';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { type Column, DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput, Tabs, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { formatCurrency, formatDate } from '@/utils/format';

import { DOC_CONFIGS } from './config';
import { flowStatusLabel, flowStatusTone } from './status';

const PAGE_SIZE = 25;

export function DocumentListPage({ kind }: { kind: DocKindKey }) {
  const cfg = DOC_CONFIGS[kind];
  const { t } = useAppContent();
  const { canWrite } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const k = (key: string) => `${cfg.texts}.${key}`;

  const list = useAsync(
    (signal) => docApi(kind).list({ status: tab || undefined, search: debounced || undefined, page, page_size: PAGE_SIZE }, signal),
    [kind, tab, debounced, page],
  );

  const columns: Array<Column<FlowDocumentListItem>> = [
    { key: 'date', header: t('docflow.col.date'), render: (row) => formatDate(row.date) },
    { key: 'number', header: t('docflow.col.number'), render: (row) => <strong>{row.number}</strong> },
    { key: 'contact', header: t(`docflow.form.${cfg.party}`), render: (row) => row.contactName },
    { key: 'reference', header: t('docflow.col.reference'), render: (row) => row.reference || '—' },
  ];
  if (cfg.secondDate) {
    const field = cfg.secondDate;
    columns.push({ key: field, header: t(`docflow.form.${field}`), render: (row) => formatDate(row[field]) });
  }
  if (!cfg.isCredit) {
    columns.push({
      key: 'converted',
      header: t(cfg.party === 'customer' ? 'docflow.col.invoice' : 'docflow.col.bill'),
      render: (row) => row.invoiceNumber || row.billNumber || '—',
    });
  }
  columns.push({ key: 'status', header: t('docflow.col.status'), render: (row) => <Badge tone={flowStatusTone(row.status)}>{flowStatusLabel(row.status, t)}</Badge> });
  columns.push({ key: 'total', header: t('docflow.col.total'), align: 'right', render: (row) => formatCurrency(row.total) });
  if (cfg.isCredit) {
    columns.push({ key: 'balance', header: t('docflow.col.balance'), align: 'right', render: (row) => formatCurrency(row.balance ?? 0) });
  }

  const rows = list.data?.items ?? [];
  return (
    <>
      <PageHeader
        title={t(k('title'))}
        subtitle={t(k('subtitle'))}
        breadcrumb={[t(`sidebar.${cfg.group}`), t(k('title'))]}
        actions={
          canWrite ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate(`${cfg.route}/new`)}>
              {t(k('new'))}
            </Button>
          ) : null
        }
      />
      <Card>
        <Tabs
          tabs={cfg.tabs.map((status) => ({ id: status, label: status ? flowStatusLabel(status, t) : t('docflow.tab.all') }))}
          active={tab}
          onChange={(id) => {
            setTab(id);
            setPage(1);
          }}
        />
        <Toolbar>
          <SearchInput
            value={search}
            placeholder={t('docflow.searchPlaceholder')}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        </Toolbar>
        {list.error ? (
          <ErrorBlock message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <SkeletonRows rows={6} columns={columns.length} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText size={28} />}
            title={search || tab ? t('docflow.empty.filteredTitle') : t(k('empty.title'))}
            description={search || tab ? t('docflow.empty.filteredBody') : t(k('empty.body'))}
            action={
              canWrite && !search && !tab ? (
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => navigate(`${cfg.route}/new`)}>
                  {t(k('new'))}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={(row) => navigate(`${cfg.route}/${row.id}`)} caption={t(k('title'))} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
