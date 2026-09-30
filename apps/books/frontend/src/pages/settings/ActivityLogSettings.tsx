import { useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
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
  const { t } = useAppContent();
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsync(
    () => orgApi.auditLogs({ page, page_size: PAGE_SIZE, entity_type: entityType || undefined }),
    [page, entityType],
  );

  const columns: Array<Column<AuditLog>> = [
    { key: 'when', header: t('settings.activity.col.when'), width: '190px', render: (row) => formatDateTime(row.createdAt) },
    { key: 'user', header: t('settings.activity.col.user'), render: (row) => row.userName ?? <span className="text-muted">{t('settings.activity.system')}</span> },
    {
      key: 'action',
      header: t('settings.activity.col.action'),
      render: (row) => <Badge tone={ACTION_TONES[row.action] ?? 'neutral'}>{titleCase(row.action)}</Badge>,
    },
    { key: 'entity', header: t('settings.activity.col.entity'), render: (row) => titleCase(row.entityType) },
    { key: 'summary', header: t('settings.activity.col.summary'), render: (row) => row.summary ?? <span className="text-muted">—</span> },
  ];

  return (
    <Card title={t('settings.activity.title')} subtitle={t('settings.activity.subtitle')}>
      <Toolbar>
        <FilterSelect
          label={t('settings.activity.entityType')}
          value={entityType}
          onChange={(next) => {
            setEntityType(next);
            setPage(1);
          }}
          options={[{ value: '', label: t('settings.activity.allEntityTypes') }, ...ENTITY_TYPES.map((value) => ({ value, label: titleCase(value) }))]}
        />
      </Toolbar>

      {loading ? <LoadingBlock label={t('settings.activity.loading')} /> : null}
      {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
      {!loading && !error && data && data.items.length === 0 ? (
        <EmptyState
          title={t('settings.activity.empty.title')}
          description={entityType ? t('settings.activity.empty.filtered') : t('settings.activity.empty.description')}
        />
      ) : null}
      {!loading && !error && data && data.items.length > 0 ? (
        <>
          <DataTable columns={columns} rows={data.items} rowKey={(row) => row.id} caption={t('settings.activity.caption')} />
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      ) : null}
    </Card>
  );
}
