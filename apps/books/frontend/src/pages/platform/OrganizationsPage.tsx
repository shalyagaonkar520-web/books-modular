import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Plus } from 'lucide-react';

import { platformApi, type OrgStatusFilter, type OrgSummary } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useDownload } from '@/hooks/useDownload';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';

import { CreateOrganizationModal } from './CreateOrganizationModal';
import { OrgDetailDrawer } from './OrgDetailDrawer';
import { OpenInAppMenu, OrgRowMenu, OrgStatusBadge, useOrgLifecycle } from './orgActions';

const PAGE_SIZE = 25;

const STATUS_OPTIONS: Array<{ value: OrgStatusFilter | ''; label: string }> = [
  { value: '', label: 'Active & suspended' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All (incl. archived)' },
];

export function OrganizationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrgStatusFilter | ''>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { download, downloading } = useDownload();
  const debouncedSearch = useDebounced(search);

  const openOrgId = searchParams.get('org');
  const setOpenOrgId = (id: string | null) => {
    setSearchParams(
      (params) => {
        if (id) params.set('org', id);
        else params.delete('org');
        return params;
      },
      { replace: true },
    );
  };

  const orgs = useAsync(
    (signal) =>
      platformApi.organizations.list(
        {
          search: debouncedSearch.trim() || undefined,
          status: status || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
      ),
    [debouncedSearch, status, page],
  );

  const lifecycle = useOrgLifecycle({
    onArchived: () => orgs.reload(),
    onRestored: () => orgs.reload(),
    onDeleted: (id) => {
      if (openOrgId === id) setOpenOrgId(null);
      orgs.reload();
    },
  });

  const rows = orgs.data?.items ?? [];
  const hasFilters = Boolean(debouncedSearch || status);

  const columns: Array<Column<OrgSummary>> = [
    {
      key: 'name',
      header: 'Organization',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          <small>Created {formatDate(row.createdAt)}</small>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <OrgStatusBadge org={row} /> },
    { key: 'users', header: 'Users', align: 'right', render: (row) => <span className="num">{row.userCount}</span> },
    { key: 'invoices', header: 'Invoices', align: 'right', render: (row) => <span className="num">{row.invoiceCount}</span> },
    { key: 'invoiced', header: 'Invoiced', align: 'right', render: (row) => <span className="num">{formatCurrency(row.invoicedAmount)}</span> },
    { key: 'collected', header: 'Collected', align: 'right', render: (row) => <span className="num">{formatCurrency(row.collectedAmount)}</span> },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : <span className="text-muted">Never</span>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <OpenInAppMenu org={row} variant="ghost" />
          <OrgRowMenu org={row} onView={() => setOpenOrgId(row.id)} lifecycle={lifecycle} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Organizations"
        subtitle="Every tenant on the platform."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download size={15} />}
              loading={downloading}
              onClick={() =>
                download(() =>
                  platformApi.organizations.exportCsv({
                    search: debouncedSearch.trim() || undefined,
                    status: status || undefined,
                  }),
                )
              }
            >
              Export CSV
            </Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
              Create organization
            </Button>
          </>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search organization name…"
        />
        <FilterSelect
          label="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(value) => {
            setStatus(value as OrgStatusFilter | '');
            setPage(1);
          }}
        />
      </Toolbar>

      <div className="card">
        {orgs.loading ? (
          <SkeletonRows rows={6} columns={8} />
        ) : orgs.error ? (
          <ErrorBlock message={orgs.error} onRetry={orgs.reload} />
        ) : !rows.length ? (
          <EmptyState
            title={hasFilters ? 'No organizations match these filters' : 'No organizations yet'}
            description={hasFilters ? 'Try a different search or status.' : 'Create the first organization to get started.'}
            action={
              hasFilters ? null : (
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                  Create organization
                </Button>
              )
            }
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              onRowClick={(row) => setOpenOrgId(row.id)}
              caption="Organizations"
            />
            <Pagination page={page} pageSize={orgs.data?.pageSize ?? PAGE_SIZE} total={orgs.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>

      {creating ? <CreateOrganizationModal onClose={() => setCreating(false)} onCreated={orgs.reload} /> : null}
      {openOrgId ? (
        <OrgDetailDrawer orgId={openOrgId} onClose={() => setOpenOrgId(null)} onChanged={orgs.reload} />
      ) : null}
      {lifecycle.dialogs}
    </>
  );
}
