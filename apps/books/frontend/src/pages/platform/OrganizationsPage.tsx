import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { platformApi, type OrgSummary } from '@/api/platform';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { formatCurrency, formatDate } from '@/utils/format';

import { CreateOrganizationModal } from './CreateOrganizationModal';
import { OrgDetailDrawer } from './OrgDetailDrawer';

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

export function OrganizationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
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
    {
      key: 'status',
      header: 'Status',
      render: (row) => (row.isSuspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>),
    },
    { key: 'users', header: 'Users', align: 'right', render: (row) => <span className="num">{row.userCount}</span> },
    { key: 'invoices', header: 'Invoices', align: 'right', render: (row) => <span className="num">{row.invoiceCount}</span> },
    { key: 'invoiced', header: 'Invoiced', align: 'right', render: (row) => <span className="num">{formatCurrency(row.invoicedAmount)}</span> },
    { key: 'collected', header: 'Collected', align: 'right', render: (row) => <span className="num">{formatCurrency(row.collectedAmount)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Organizations"
        subtitle="Every tenant on the platform."
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
            Create organization
          </Button>
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
            setStatus(value);
            setPage(1);
          }}
        />
      </Toolbar>

      <div className="card">
        {orgs.loading ? (
          <SkeletonRows rows={6} columns={6} />
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
    </>
  );
}
