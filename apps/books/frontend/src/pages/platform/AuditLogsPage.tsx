import { useMemo, useState } from 'react';

import { platformApi, type PlatformAudit } from '@/api/platform';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime, titleCase } from '@/utils/format';

const PAGE_SIZE = 25;

export function AuditLogsPage() {
  const [organizationId, setOrganizationId] = useState('');
  const [page, setPage] = useState(1);

  const orgs = useAsync((signal) => platformApi.organizations.list({ page: 1, page_size: 200 }, signal), []);
  const logs = useAsync(
    (signal) =>
      platformApi.auditLogs(
        {
          organization_id: organizationId || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
      ),
    [organizationId, page],
  );

  const orgOptions = useMemo(
    () => [
      { value: '', label: 'All organizations' },
      ...(orgs.data?.items ?? []).map((org) => ({ value: org.id, label: org.name })),
    ],
    [orgs.data],
  );

  const rows = logs.data?.items ?? [];
  const hasFilters = Boolean(organizationId);

  const columns: Array<Column<PlatformAudit>> = [
    { key: 'when', header: 'When', width: '190px', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{titleCase(row.action)}</span>
          <Badge tone="neutral">{titleCase(row.entityType)}</Badge>
        </div>
      ),
    },
    { key: 'summary', header: 'Details', render: (row) => row.summary ?? <span className="text-muted">—</span> },
    { key: 'user', header: 'User', render: (row) => row.userName ?? <span className="text-muted">System</span> },
    { key: 'organization', header: 'Organization', render: (row) => row.organizationName },
  ];

  return (
    <>
      <PageHeader title="Audit log" subtitle="Global activity across every organization." />

      <Toolbar>
        <FilterSelect
          label="Organization"
          value={organizationId}
          options={orgOptions}
          onChange={(value) => {
            setOrganizationId(value);
            setPage(1);
          }}
        />
      </Toolbar>

      <div className="card">
        {logs.loading ? (
          <SkeletonRows rows={8} columns={5} />
        ) : logs.error ? (
          <ErrorBlock message={logs.error} onRetry={logs.reload} />
        ) : !rows.length ? (
          <EmptyState
            title={hasFilters ? 'No activity for this organization' : 'No activity yet'}
            description={hasFilters ? 'Try a different organization.' : 'Activity will appear here as it happens.'}
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Audit log" />
            <Pagination page={page} pageSize={logs.data?.pageSize ?? PAGE_SIZE} total={logs.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
