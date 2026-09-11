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
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { data, loading, error, reload } = useAsync(() => reportsApi.inventorySummary(), []);

  if (loading) return <LoadingBlock label="Valuing stock on hand…" />;
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!data) return null;

  const columns: Array<Column<InventoryRow>> = [
    {
      key: 'item',
      header: 'Item',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          <small>{row.sku}</small>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock on hand',
      align: 'right',
      render: (row) => (
        <span className="num">
          {formatQuantity(row.stockOnHand)} {row.unit}
        </span>
      ),
    },
    { key: 'reorder', header: 'Reorder level', align: 'right', render: (row) => <span className="num">{formatQuantity(row.reorderLevel)}</span> },
    { key: 'cost', header: 'Cost price', align: 'right', render: (row) => <span className="num">{formatCurrency(row.costPrice, currency)}</span> },
    { key: 'value', header: 'Stock value', align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.stockValue, currency)}</span> },
    {
      key: 'flag',
      header: 'Status',
      render: (row) => (row.isLowStock ? <Badge tone="warning">Low stock</Badge> : <Badge tone="success">In stock</Badge>),
    },
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile label="Active items" value={formatNumber(data.totalItems, 0)} sublabel="Goods and services" />
        <StatTile label="Inventory tracked" value={formatNumber(data.trackedItems, 0)} sublabel="Items with stock tracking on" />
        <StatTile
          label="Low stock"
          value={formatNumber(data.lowStockItems, 0)}
          tone={data.lowStockItems > 0 ? 'warning' : 'positive'}
          sublabel="At or below reorder level"
        />
        <StatTile label="Stock value" value={formatCurrency(data.totalStockValue, currency)} sublabel="Quantity on hand at cost price" />
      </div>
      <Card title="Inventory summary" subtitle="Every item with inventory tracking enabled">
        {data.rows.length ? (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(row) => row.itemId}
            caption="Inventory summary by item"
            footer={
              <tr>
                <td colSpan={4}>Total stock value</td>
                <td className="align-right num">{formatCurrency(data.totalStockValue, currency)}</td>
                <td />
              </tr>
            }
          />
        ) : (
          <EmptyState
            title="No inventory-tracked items"
            description="Turn on inventory tracking for a goods item to see stock levels and valuation here."
          />
        )}
      </Card>
    </div>
  );
}
