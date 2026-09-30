import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { reportsApi } from '@/api/endpoints';
import type { InventorySummaryReport } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatNumber, formatQuantity } from '@/utils/format';

type InventoryRow = InventorySummaryReport['rows'][number];

export function InventorySummaryReportView() {
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(() => reportsApi.inventorySummary(), []);

  if (loading) return <LoadingBlock label={t('reports.inventorySummary.loading')} />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const columns: Array<Column<InventoryRow>> = [
    {
      key: 'item',
      header: t('reports.inventorySummary.col.item'),
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          <small>{row.sku}</small>
        </div>
      ),
    },
    {
      key: 'stock',
      header: t('reports.inventorySummary.col.stockOnHand'),
      align: 'right',
      render: (row) => (
        <span className="num">
          {formatQuantity(row.stockOnHand)} {row.unit}
        </span>
      ),
    },
    { key: 'reorder', header: t('reports.inventorySummary.col.reorderLevel'), align: 'right', render: (row) => <span className="num">{formatQuantity(row.reorderLevel)}</span> },
    { key: 'cost', header: t('reports.inventorySummary.col.costPrice'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.costPrice, currency)}</span> },
    { key: 'value', header: t('reports.inventorySummary.col.stockValue'), align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.stockValue, currency)}</span> },
    {
      key: 'flag',
      header: t('reports.inventorySummary.col.status'),
      render: (row) =>
        row.isLowStock ? (
          <Badge tone="warning">{t('reports.inventorySummary.badge.lowStock')}</Badge>
        ) : (
          <Badge tone="success">{t('reports.inventorySummary.badge.inStock')}</Badge>
        ),
    },
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile label={t('reports.inventorySummary.stat.activeItems')} value={formatNumber(data.totalItems, 0)} sublabel={t('reports.inventorySummary.stat.activeItemsSub')} />
        <StatTile label={t('reports.inventorySummary.stat.tracked')} value={formatNumber(data.trackedItems, 0)} sublabel={t('reports.inventorySummary.stat.trackedSub')} />
        <StatTile
          label={t('reports.inventorySummary.stat.lowStock')}
          value={formatNumber(data.lowStockItems, 0)}
          tone={data.lowStockItems > 0 ? 'warning' : 'positive'}
          sublabel={t('reports.inventorySummary.stat.lowStockSub')}
        />
        <StatTile
          label={t('reports.inventorySummary.stat.stockValue')}
          value={formatCurrency(data.totalStockValue, currency)}
          sublabel={t('reports.inventorySummary.stat.stockValueSub')}
        />
      </div>
      <Card title={t('reports.inventorySummary.cardTitle')} subtitle={t('reports.inventorySummary.cardSubtitle')}>
        {data.rows.length ? (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(row) => row.itemId}
            caption={t('reports.inventorySummary.tableCaption')}
            footer={
              <tr>
                <td colSpan={4}>{t('reports.inventorySummary.footer.totalStockValue')}</td>
                <td className="align-right num">{formatCurrency(data.totalStockValue, currency)}</td>
                <td />
              </tr>
            }
          />
        ) : (
          <EmptyState title={t('reports.inventorySummary.empty.title')} description={t('reports.inventorySummary.empty.body')} />
        )}
      </Card>
    </div>
  );
}
