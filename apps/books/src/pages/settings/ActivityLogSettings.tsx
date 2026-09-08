import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { orgApi } from '@/api/endpoints';
import type { AuditLog } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime, titleCase } from '@/utils/format';
import type { Tone } from '@/utils/status';

const PAGE_SIZE = 25;

const ENTITY_TYPES = [
  'account',
  'bank_account',
  'bank_transaction',
  'bill',
  'contact',
  'customer_payment',
  'document',
  'employee',
  'expense',
  'inventory_adjustment',
  'invoice',
  'item',
  'journal',
  'organization',
  'pay_run',
  'project',
  'time_entry',
  'transfer',
  'user',
  'vendor_payment',
];

const ACTION_TONES: Record<string, Tone> = { create: 'success', update: 'info', delete: 'danger' };

export function ActivityLogSettings() {
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsync(
    () => orgApi.auditLogs({ page, page_size: PAGE_SIZE, entity_type: entityType || undefined }),
    [page, entityType],
  );

  const columns: Array<Column<AuditLog>> = [
    { key: 'when', header: 'When', width: '190px', render: (row) => formatDateTime(row.createdAt) },
    { key: 'user', header: 'User', render: (row) => row.userName ?? <span className="text-muted">System</span> },
    {
      key: 'action',
      header: 'Action',
      render: (row) => <Badge tone={ACTION_TONES[row.action] ?? 'neutral'}>{titleCase(row.action)}</Badge>,
    },
    { key: 'entity', header: 'Entity', render: (row) => titleCase(row.entityType) },
    { key: 'summary', header: 'Summary', render: (row) => row.summary ?? <span className="text-muted">—</span> },
  ];

  return (
    <Card title="Activity log" subtitle="Every change made in this organization, newest first">
      <Toolbar>
        <FilterSelect
          label="Entity type"
          value={entityType}
          onChange={(next) => {
            setEntityType(next);
            setPage(1);
          }}
          options={[{ value: '', label: 'All entity types' }, ...ENTITY_TYPES.map((value) => ({ value, label: titleCase(value) }))]}
        />
      </Toolbar>

      {loading ? <LoadingBlock label="Loading activity…" /> : null}
      {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
      {!loading && !error && data && data.items.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          description={entityType ? 'No activity recorded for this entity type.' : 'Activity appears here as your team records transactions.'}
        />
      ) : null}
      {!loading && !error && data && data.items.length > 0 ? (
        <>
          <DataTable columns={columns} rows={data.items} rowKey={(row) => row.id} caption="Audit log entries" />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      ) : null}
    </Card>
  );
}
