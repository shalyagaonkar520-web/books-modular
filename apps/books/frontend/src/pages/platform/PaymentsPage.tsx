import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Download } from 'lucide-react';

import { platformApi, type PlatformPayment } from '@/api/platform';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useDownload } from '@/hooks/useDownload';
import { formatCurrency, formatDate, formatNumber, titleCase } from '@/utils/format';

const PAGE_SIZE = 25;

const KIND_OPTIONS = [
  { value: '', label: 'All payments' },
  { value: 'received', label: 'Received' },
  { value: 'made', label: 'Made' },
];

export function PaymentsPage() {
  const [kind, setKind] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [page, setPage] = useState(1);
  const { download, downloading } = useDownload();

  const orgs = useAsync((signal) => platformApi.organizations.list({ page: 1, page_size: 200 }, signal), []);
  const stats = useAsync((signal) => platformApi.payments.stats(signal), []);
  const payments = useAsync(
    (signal) =>
      platformApi.payments.list(
        {
          kind: kind || undefined,
          organization_id: organizationId || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
      ),
    [kind, organizationId, page],
  );

  const orgOptions = useMemo(
    () => [
      { value: '', label: 'All organizations' },
      ...(orgs.data?.items ?? []).map((org) => ({ value: org.id, label: org.name })),
    ],
    [orgs.data],
  );

  const rows = payments.data?.items ?? [];
  const hasFilters = Boolean(kind || organizationId);

  const columns: Array<Column<PlatformPayment>> = [
    {
      key: 'number',
      header: 'Payment',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.number}</span>
          <small>{row.contactName}</small>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (row) => (
        <Badge tone={row.kind === 'received' ? 'success' : 'warning'}>{row.kind === 'received' ? 'Received' : 'Made'}</Badge>
      ),
    },
    { key: 'organization', header: 'Organization', render: (row) => row.organizationName },
    { key: 'mode', header: 'Mode', render: (row) => (row.mode ? titleCase(row.mode) : <span className="text-muted">—</span>) },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date ?? row.createdAt) },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (
        <span className={`num strong ${row.kind === 'received' ? 'text-success' : 'text-warning'}`}>
          {formatCurrency(row.amount)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Global feed of money received and paid across all organizations."
        actions={
          <Button
            variant="secondary"
            icon={<Download size={15} />}
            loading={downloading}
            onClick={() =>
              download(() =>
                platformApi.payments.exportCsv({
                  organization_id: organizationId || undefined,
                  kind: kind || undefined,
                }),
              )
            }
          >
            Export CSV
          </Button>
        }
      />

      {stats.error ? (
        <ErrorBlock message={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="stat-grid">
          <StatTile
            label="Total received"
            value={formatCurrency(stats.data?.totalReceived ?? 0)}
            sublabel={`${formatNumber(stats.data?.receivedCount ?? 0, 0)} payment(s)`}
            tone="positive"
            icon={<ArrowUpRight size={16} />}
          />
          <StatTile
            label="Total made"
            value={formatCurrency(stats.data?.totalMade ?? 0)}
            sublabel={`${formatNumber(stats.data?.madeCount ?? 0, 0)} payment(s)`}
            tone="warning"
            icon={<ArrowDownRight size={16} />}
          />
          <StatTile
            label="Net flow"
            value={formatCurrency((stats.data?.totalReceived ?? 0) - (stats.data?.totalMade ?? 0))}
            sublabel="Received minus made"
          />
          <StatTile
            label="Total payments"
            value={formatNumber((stats.data?.receivedCount ?? 0) + (stats.data?.madeCount ?? 0), 0)}
          />
        </div>
      )}

      <Toolbar>
        <FilterSelect
          label="Kind"
          value={kind}
          options={KIND_OPTIONS}
          onChange={(value) => {
            setKind(value);
            setPage(1);
          }}
        />
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
        {payments.loading ? (
          <SkeletonRows rows={6} columns={6} />
        ) : payments.error ? (
          <ErrorBlock message={payments.error} onRetry={payments.reload} />
        ) : !rows.length ? (
          <EmptyState
            title={hasFilters ? 'No payments match these filters' : 'No payments yet'}
            description={hasFilters ? 'Try a different kind or organization.' : 'Payments will appear here as organizations record them.'}
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => `${row.kind}-${row.id}`} caption="Payments" />
            <Pagination page={page} pageSize={payments.data?.pageSize ?? PAGE_SIZE} total={payments.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
