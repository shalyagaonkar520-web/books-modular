import { useEffect, useState } from 'react';
import { Briefcase } from 'lucide-react';

import { platformApi, type OrgSummary } from '@/api/platform';
import { getWorkspace, type WorkspaceNote } from '@/auth/workspace';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { formatDateTime } from '@/utils/format';

import { OpenInAppButton, OpenInAppMenu } from './orgActions';

const PAGE_SIZE = 25;

/**
 * Workspace mode: pick an organization and work inside its full app - items,
 * customers, vendors, invoices, bills, banking, reports and settings - as its
 * administrator. Everything goes through the real app, so the ledger, stock and
 * GST stay correct, and every change is attributed to the platform admin.
 */
export function WorkspacePage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);
  const [current, setCurrent] = useState<WorkspaceNote | null>(() => getWorkspace());

  useEffect(() => {
    const sync = () => setCurrent(getWorkspace());
    window.addEventListener('rb:workspace', sync);
    return () => window.removeEventListener('rb:workspace', sync);
  }, []);

  // Only organizations that can actually be opened: approved, not suspended, not archived.
  const orgs = useAsync(
    (signal) =>
      platformApi.organizations.list({ search: debouncedSearch.trim() || undefined, status: 'active', page, page_size: PAGE_SIZE }, signal),
    [debouncedSearch, page],
  );

  const columns: Column<OrgSummary>[] = [
    {
      key: 'name',
      header: 'Organization',
      render: (row) => (
        <div>
          <div className="strong">{row.name}</div>
          {row.adminEmail ? <div className="text-muted small">{row.adminEmail}</div> : null}
        </div>
      ),
    },
    { key: 'users', header: 'Users', align: 'right', render: (row) => <span className="num">{row.userCount}</span> },
    { key: 'lastLogin', header: 'Last login', render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : 'Never') },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <OpenInAppButton org={row} label="Open workspace" />
          <OpenInAppMenu org={row} size="sm" />
        </div>
      ),
    },
  ];

  const rows = orgs.data?.items ?? [];

  return (
    <div className="stack">
      <PageHeader
        title="Workspace"
        subtitle="Open any organization and manage everything inside it — items, customers, vendors, invoices, bills, banking, reports and settings. Changes go through the real app and are recorded under your admin account."
      />

      {current ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Briefcase size={18} aria-hidden="true" />
          <span style={{ flex: 1 }}>
            Last workspace: <strong>{current.orgName}</strong> <span className="text-muted">as {current.userEmail}</span>
          </span>
        </div>
      ) : null}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search organization name…"
        />
      </Toolbar>

      <div className="card">
        {orgs.loading ? (
          <SkeletonRows rows={6} columns={4} />
        ) : orgs.error ? (
          <ErrorBlock message={orgs.error} onRetry={orgs.reload} />
        ) : !rows.length ? (
          <EmptyState
            title={debouncedSearch ? 'No organizations match' : 'No organizations to open'}
            description="Only approved, active organizations can be opened. Pending, suspended and archived ones are managed on the Organizations page."
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Organizations you can open" />
            <Pagination page={page} pageSize={orgs.data?.pageSize ?? PAGE_SIZE} total={orgs.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
