import { useState } from 'react';

import { razorpaySyncApi, type PagedResult, type SyncLog } from '@/api/razorpay';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime, formatNumber } from '@/utils/format';

const PAGE_SIZE = 25;

function tone(status: SyncLog['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'partial') return 'warning' as const;
  if (status === 'failed') return 'danger' as const;
  return 'info' as const;
}

export function RazorpaySyncHistory() {
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync<PagedResult<SyncLog>>(
    () => razorpaySyncApi.listSyncLogs({ page, page_size: PAGE_SIZE }),
    [page],
  );

  const columns: Array<Column<SyncLog>> = [
    {
      key: 'started',
      header: 'Started',
      render: (row) => (
        <div className="cell-stack">
          <span>{formatDateTime(row.started_at)}</span>
          <span className="small">
            {row.sync_type} · {row.mode}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="cell-stack">
          <Badge tone={tone(row.status)}>{row.status}</Badge>
          {row.duration_seconds != null ? (
            <span className="small">{row.duration_seconds.toFixed(1)}s</span>
          ) : null}
        </div>
      ),
    },
    { key: 'fetched', header: 'Retrieved', align: 'right', render: (row) => formatNumber(row.records_fetched, 0) },
    { key: 'created', header: 'Created', align: 'right', render: (row) => formatNumber(row.records_created, 0) },
    { key: 'updated', header: 'Updated', align: 'right', render: (row) => formatNumber(row.records_updated, 0) },
    {
      key: 'skipped',
      header: 'Duplicates ignored',
      align: 'right',
      render: (row) => formatNumber(row.records_skipped, 0),
    },
    {
      key: 'failed',
      header: 'Errors',
      align: 'right',
      render: (row) =>
        row.records_failed > 0 ? (
          <Badge tone="danger">{formatNumber(row.records_failed, 0)}</Badge>
        ) : (
          formatNumber(0, 0)
        ),
    },
    { key: 'refunds', header: 'Refunds', align: 'right', render: (row) => formatNumber(row.refunds_synced, 0) },
    { key: 'pages', header: 'Pages', align: 'right', render: (row) => formatNumber(row.pages_fetched, 0) },
    {
      key: 'completed',
      header: 'Completed',
      render: (row) => (row.completed_at ? formatDateTime(row.completed_at) : 'Still running'),
    },
    {
      key: 'message',
      header: 'Message',
      render: (row) => (row.error_message ? <span className="small">{row.error_message}</span> : '—'),
    },
  ];

  return (
    <Card
      title="Synchronisation history"
      subtitle="Every run is recorded, including the ones that failed."
    >
      {loading ? (
        <SkeletonRows rows={6} columns={10} />
      ) : error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No synchronisations yet"
          description="Run one from Settings → Integrations → Razorpay to import your transactions."
        />
      ) : (
        <>
          <DataTable columns={columns} rows={data.items} rowKey={(row) => row.id} caption="Razorpay sync history" />
          <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}
