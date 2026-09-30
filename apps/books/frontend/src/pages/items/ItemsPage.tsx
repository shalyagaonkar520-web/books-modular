/** Item catalogue: search, filters, sorting, create/edit, details and stock adjustments. */
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Boxes, Eye, Package, Pencil, Plus, SlidersHorizontal, Trash2, TrendingDown, Wallet } from 'lucide-react';

import { ApiError } from '@/api/client';
import { itemsApi, reportsApi } from '@/api/endpoints';
import type { Item } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/AuthContext';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate, formatDateTime, formatPercent, formatQuantity, parseNumber, todayIso } from '@/utils/format';
import { type Tone } from '@/utils/status';

const PAGE_SIZE = 25;

const TYPE_FILTERS = [
  { value: 'all', label: 'items.filter.allTypes' },
  { value: 'goods', label: 'items.filter.goods' },
  { value: 'service', label: 'items.filter.services' },
];

const INVENTORY_FILTERS = [
  { value: 'all', label: 'items.filter.allItems' },
  { value: 'tracked', label: 'items.filter.tracked' },
  { value: 'non-tracked', label: 'items.filter.notTracked' },
  { value: 'low-stock', label: 'items.filter.lowStock' },
];



function stockTone(item: Item): Tone {
  if (item.stockOnHand <= 0) return 'danger';
  if (item.stockOnHand <= item.reorderLevel) return 'warning';
  return 'success';
}

function StockCell({ item }: { item: Item }) {
  const { t } = useAppContent();
  if (item.type === 'service' || !item.trackInventory) return <span className="text-muted">{t('items.stock.notTracked')}</span>;
  return (
    <Badge tone={stockTone(item)}>
      {formatQuantity(item.stockOnHand)} {item.unit}
    </Badge>
  );
}

export function ItemsPage() {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [typeFilter, setTypeFilter] = useState('all');
  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [detailsItem, setDetailsItem] = useState<Item | null>(null);
  const [adjustItem, setAdjustItem] = useState<Item | null>(null);
  const [deleteItem, setDeleteItem] = useState<Item | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const deleteSubmit = useSubmit();

  const list = useAsync(
    (signal) =>
      itemsApi.list(
        {
          search: debouncedSearch.trim() || undefined,
          type_filter: typeFilter,
          inventory_filter: inventoryFilter,
          sort_by: sortBy,
          sort_order: sortOrder,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
      ),
    [debouncedSearch, typeFilter, inventoryFilter, sortBy, sortOrder, page],
  );

  const summary = useAsync(() => reportsApi.inventorySummary(), []);

  // The header's Create menu links here with ?new=1; send it on to the form page.
  const wantsNew = canWrite && searchParams.get('new') === '1';
  useEffect(() => {
    if (wantsNew) navigate('/items/new', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  // Low-stock notifications link here with ?item=<id>. Fetch that item directly
  // rather than looking in the current page of results - it may not be on it.
  useEffect(() => {
    const itemId = searchParams.get('item');
    if (!itemId) return;
    let cancelled = false;
    void itemsApi
      .get(itemId)
      .then((item) => {
        if (!cancelled) setDetailsItem(item);
      })
      .catch(() => undefined);
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    setSearchParams(next, { replace: true });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reloadAll() {
    list.reload();
    summary.reload();
  }

  function handleSort(key: string) {
    setPage(1);
    if (sortBy === key) {
      setSortOrder((order) => (order === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortOrder(key === 'createdAt' ? 'desc' : 'asc');
    }
  }

  async function confirmDelete() {
    if (!deleteItem) return;
    const result = await deleteSubmit.run(() => itemsApi.remove(deleteItem.id));
    if (!result) return;
    if (result.message.toLowerCase().includes('inactive')) toast.notify(result.message, 'warning');
    else toast.success(result.message);
    setDeleteItem(null);
    reloadAll();
  }

  async function confirmBulkDelete() {
    setBulkDeleteConfirmOpen(false);
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    let count = 0;
    const failedIds = new Set<string>();
    let lastError: string | null = null;
    for (const id of selectedIds) {
      try {
        await itemsApi.remove(id);
        count++;
      } catch (err) {
        failedIds.add(id);
        lastError = err instanceof ApiError ? err.message : lastError;
      }
    }
    setBulkDeleting(false);
    if (failedIds.size > 0) {
      const reason = lastError ? ` ${lastError}` : '';
      toast.error(t('items.bulk.partialFailed', { count, total: selectedIds.size, failed: failedIds.size, reason }));
    } else {
      toast.success(t('items.bulk.deleted', { count }));
    }
    setSelectedIds(failedIds);
    reloadAll();
  }

  const rows = list.data?.items ?? [];
  const stats = summary.data;

  const columns: Array<Column<Item>> = [
    {
      key: 'name',
      header: t('items.col.item'),
      sortable: true,
      render: (item) => (
        <div className="cell-stack">
          <span className="strong">{item.name}</span>
          <small className="mono">{item.sku}</small>
          {item.description ? <small className="text-muted">{item.description}</small> : null}
        </div>
      ),
    },
    { key: 'type', header: t('items.col.type'), render: (item) => <Badge tone={item.type === 'goods' ? 'info' : 'neutral'}>{item.type === 'goods' ? t('items.type.goods') : t('items.type.service')}</Badge> },
    { key: 'unit', header: t('items.col.unit'), render: (item) => <span className="text-muted">{item.unit}</span> },
    { key: 'taxRate', header: t('items.col.tax'), align: 'right', render: (item) => <span className="num">{formatPercent(item.taxRate)}</span> },
    { key: 'sellingPrice', header: t('items.col.sellingPrice'), align: 'right', sortable: true, render: (item) => <span className="num">{formatCurrency(item.sellingPrice)}</span> },
    { key: 'costPrice', header: t('items.col.costPrice'), align: 'right', sortable: true, render: (item) => <span className="num">{formatCurrency(item.costPrice)}</span> },
    { key: 'stockOnHand', header: t('items.col.stock'), align: 'right', sortable: true, render: (item) => <StockCell item={item} /> },
    {
      key: 'reorderLevel',
      header: t('items.col.lowStockAt'),
      align: 'right',
      sortable: true,
      render: (item) =>
        item.type === 'service' || !item.trackInventory ? (
          <span className="text-muted">—</span>
        ) : (
          <span className="num text-muted">
            {formatQuantity(item.reorderLevel)} {item.unit}
          </span>
        ),
    },
    { key: 'createdAt', header: t('items.col.added'), sortable: true, render: (item) => <span className="text-muted small">{formatDate(item.createdAt)}</span> },
    {
      key: 'actions',
      header: t('items.col.actions'),
      align: 'right',
      render: (item) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="action-btn" aria-label={t('items.action.view', { name: item.name })} onClick={() => setDetailsItem(item)}>
            <Eye size={15} />
          </button>
          <IfCanWrite>
            <button
              type="button"
              className="action-btn"
              aria-label={t('items.action.edit', { name: item.name })}
              onClick={() => navigate(`/items/${item.id}/edit`)}
            >
              <Pencil size={15} />
            </button>
            {item.trackInventory ? (
              <button type="button" className="action-btn" aria-label={t('items.action.adjust', { name: item.name })} onClick={() => setAdjustItem(item)}>
                <SlidersHorizontal size={15} />
              </button>
            ) : null}
            <button type="button" className="action-btn is-danger" aria-label={t('items.action.delete', { name: item.name })} onClick={() => setDeleteItem(item)}>
              <Trash2 size={15} />
            </button>
          </IfCanWrite>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('items.title')}
        subtitle={t('items.subtitle')}
        actions={
          <IfCanWrite>
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => navigate('/items/new')}
            >
              {t('items.new')}
            </Button>
          </IfCanWrite>
        }
      />

      {stats ? (
        <div className="stat-grid">
          <StatTile label={t('items.stat.total')} value={formatQuantity(stats.totalItems)} sublabel={t('items.stat.totalSub', { count: list.data?.total ?? 0 })} icon={<Package size={16} />} />
          <StatTile label={t('items.stat.tracked')} value={formatQuantity(stats.trackedItems)} sublabel={t('items.stat.trackedSub')} icon={<Boxes size={16} />} />
          <StatTile label={t('items.stat.stockValue')} value={formatCurrency(stats.totalStockValue)} sublabel={t('items.stat.stockValueSub')} icon={<Wallet size={16} />} />
          <StatTile
            label={t('items.stat.lowStock')}
            value={formatQuantity(stats.lowStockItems)}
            sublabel={t('items.stat.lowStockSub')}
            tone={stats.lowStockItems > 0 ? 'negative' : 'neutral'}
            icon={<TrendingDown size={16} />}
          />
        </div>
      ) : null}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t('items.search.placeholder')}
          label={t('items.search.label')}
        />
        <FilterSelect
          label={t('items.filter.typeLabel')}
          value={typeFilter}
          onChange={(value) => {
            setTypeFilter(value);
            setPage(1);
          }}
          options={TYPE_FILTERS.map((option) => ({ ...option, label: t(option.label) }))}
        />
        <FilterSelect
          label={t('items.filter.inventoryLabel')}
          value={inventoryFilter}
          onChange={(value) => {
            setInventoryFilter(value);
            setPage(1);
          }}
          options={INVENTORY_FILTERS.map((option) => ({ ...option, label: t(option.label) }))}
        />
      </Toolbar>

      <div className="card">
        {list.loading ? (
          <div className="card-body">
            <SkeletonRows rows={6} columns={7} />
          </div>
        ) : list.error ? (
          <div className="card-body">
            <ErrorBlock message={list.error} onRetry={list.reload} />
          </div>
        ) : !rows.length ? (
          <div className="card-body">
            <EmptyState
              title={t('items.empty.title')}
              description={t('items.empty.body')}
              icon={<Package size={28} aria-hidden="true" />}
              action={
                <IfCanWrite>
                  <Button
                    variant="primary"
                    icon={<Plus size={15} />}
                    onClick={() => navigate('/items/new')}
                  >
                    {t('items.new')}
                  </Button>
                </IfCanWrite>
              }
            />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', background: 'var(--surface-muted, #f8fafc)', borderBottom: '1px solid var(--border-color, #e2e8f0)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (selectedIds.size === rows.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(rows.map((i) => i.id)));
                    }
                  }}
                >
                  {selectedIds.size === rows.length && rows.length > 0 ? t('items.bulk.deselectAll') : t('items.bulk.selectAllOnPage', { count: rows.length })}
                </Button>
                {selectedIds.size > 0 ? (
                  <span className="small text-muted">{t('items.bulk.selected', { count: selectedIds.size })}</span>
                ) : null}
              </div>
              {selectedIds.size > 0 ? (
                <IfCanWrite>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={bulkDeleting}
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                    icon={<Trash2 size={13} />}
                  >
                    {t('items.bulk.deleteSelected', { count: selectedIds.size })}
                  </Button>
                </IfCanWrite>
              ) : null}
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(item) => item.id}
              onRowClick={(item) => setDetailsItem(item)}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              caption={t('items.table.caption')}
              selectedKeys={selectedIds}
              onSelectRow={(id) => {
                const next = new Set(selectedIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelectedIds(next);
              }}
              onSelectAll={() => {
                if (selectedIds.size === rows.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(rows.map((i) => i.id)));
              }}
              isAllSelected={rows.length > 0 && selectedIds.size === rows.length}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>

      {detailsItem ? <ItemDetailsModal item={detailsItem} onClose={() => setDetailsItem(null)} /> : null}

      {adjustItem ? (
        <AdjustStockModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSaved={(message) => {
            toast.success(message);
            setAdjustItem(null);
            reloadAll();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteItem}
        title={t('items.delete.title')}
        message={
          <>
            <FormError message={deleteSubmit.error} />
            {deleteItem
              ? t('items.delete.body', { name: deleteItem.name, sku: deleteItem.sku })
              : ''}
          </>
        }
        confirmLabel={t('items.delete.confirm')}
        busy={deleteSubmit.submitting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteItem(null);
          deleteSubmit.reset();
        }}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title={t('items.bulkDelete.title')}
        message={<p>{t('items.bulkDelete.body', { count: selectedIds.size })}</p>}
        confirmLabel={t('items.bulkDelete.confirm')}
        busy={bulkDeleting}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => void confirmBulkDelete()}
      />
    </>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

function ItemDetailsModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useAppContent();
  const dash = <span className="text-muted">—</span>;
  const typeLabel = item.type === 'goods' ? t('items.type.goods') : t('items.type.service');
  return (
    <Modal open size="lg" title={item.name} subtitle={t('items.details.subtitle', { sku: item.sku, type: typeLabel })} onClose={onClose}>
      <div className="detail-grid">
        <Detail label={t('items.details.sku')} value={<span className="mono">{item.sku}</span>} />
        <Detail label={t('items.details.type')} value={<Badge tone={item.type === 'goods' ? 'info' : 'neutral'}>{typeLabel}</Badge>} />
        <Detail label={t('items.details.unit')} value={item.unit} />
        <Detail label={t('items.details.hsnSac')} value={item.hsnSac || dash} />
        <Detail label={t('items.details.taxRate')} value={formatPercent(item.taxRate)} />
        <Detail label={t('items.details.status')} value={<Badge tone={item.isActive ? 'success' : 'neutral'}>{item.isActive ? t('items.status.active') : t('items.status.inactive')}</Badge>} />
        <Detail label={t('items.details.sellingPrice')} value={formatCurrency(item.sellingPrice)} />
        <Detail label={t('items.details.salesAccount')} value={item.salesAccountName || dash} />
        <Detail label={t('items.details.costPrice')} value={formatCurrency(item.costPrice)} />
        <Detail label={t('items.details.purchaseAccount')} value={item.purchaseAccountName || dash} />
        <Detail label={t('items.details.preferredVendor')} value={item.preferredVendorName || dash} />
        <Detail label={t('items.details.inventory')} value={item.trackInventory ? t('items.details.tracked') : t('items.details.notTracked')} />
        {item.trackInventory ? (
          <>
            <Detail label={t('items.details.stockOnHand')} value={<Badge tone={stockTone(item)}>{`${formatQuantity(item.stockOnHand)} ${item.unit}`}</Badge>} />
            <Detail label={t('items.details.lowStockThreshold')} value={`${formatQuantity(item.reorderLevel)} ${item.unit}`} />
            <Detail label={t('items.details.openingStock')} value={`${formatQuantity(item.openingStock)} ${item.unit}`} />
            <Detail label={t('items.details.openingStockRate')} value={formatCurrency(item.openingStockRate)} />
            <Detail label={t('items.details.stockValuation')} value={<span className="strong">{formatCurrency(item.stockOnHand * item.costPrice)}</span>} />
            <Detail label={t('items.details.warehouse')} value={item.warehouseLocation || dash} />
          </>
        ) : null}
        <Detail label={t('items.details.created')} value={formatDateTime(item.createdAt)} />
        <Detail label={t('items.details.lastUpdated')} value={formatDateTime(item.updatedAt)} />
      </div>

      {item.description || item.salesDescription || item.purchaseDescription ? (
        <div className="stack">
          {item.description ? <Detail label={t('items.details.description')} value={item.description} /> : null}
          {item.salesDescription ? <Detail label={t('items.details.salesDescription')} value={item.salesDescription} /> : null}
          {item.purchaseDescription ? <Detail label={t('items.details.purchaseDescription')} value={item.purchaseDescription} /> : null}
        </div>
      ) : null}
    </Modal>
  );
}

function AdjustStockModal({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: (message: string) => void }) {
  const { t } = useAppContent();
  const [date, setDate] = useState(todayIso());
  const [quantityDelta, setQuantityDelta] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const { submitting, error, fieldErrors, run } = useSubmit();

  const history = useAsync(() => itemsApi.adjustments({ item_id: item.id, page_size: 5 }), [item.id]);

  async function save() {
    const result = await run(() =>
      itemsApi.adjust({
        itemId: item.id,
        date,
        quantityDelta: parseNumber(quantityDelta),
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      }),
    );
    if (result) onSaved(t('items.adjust.recorded', { number: result.adjustmentNumber, name: item.name }));
  }

  return (
    <Modal
      open
      title={t('items.adjust.title')}
      subtitle={t('items.adjust.subtitle', { name: item.name, quantity: formatQuantity(item.stockOnHand), unit: item.unit })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('items.adjust.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={save}>
            {t('items.adjust.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('items.adjust.date')} type="date" required value={date} error={fieldErrors.date} onChange={(event) => setDate(event.target.value)} />
        <TextField
          label={t('items.adjust.quantity')}
          type="number"
          step="0.001"
          required
          value={quantityDelta}
          error={fieldErrors.quantityDelta}
          hint={t('items.adjust.quantityHint')}
          onChange={(event) => setQuantityDelta(event.target.value)}
        />
      </div>
      <TextField label={t('items.adjust.reason')} required value={reason} error={fieldErrors.reason} onChange={(event) => setReason(event.target.value)} />
      <TextAreaField label={t('items.adjust.notes')} rows={2} value={notes} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />

      <section className="form-section">
        <h3 className="form-section-title">{t('items.adjust.recent')}</h3>
        {history.loading ? (
          <SkeletonRows rows={3} columns={3} />
        ) : history.error ? (
          <ErrorBlock message={history.error} onRetry={history.reload} />
        ) : !history.data?.items.length ? (
          <p className="text-muted small">{t('items.adjust.noHistory')}</p>
        ) : (
          <ul className="totals-list">
            {history.data.items.map((adjustment) => (
              <li key={adjustment.id}>
                <span>
                  <span className="mono">{adjustment.adjustmentNumber}</span> · {formatDate(adjustment.date)} · {adjustment.reason}
                </span>
                <span className={adjustment.quantityDelta < 0 ? 'num text-danger' : 'num text-success'}>
                  {adjustment.quantityDelta > 0 ? '+' : ''}
                  {formatQuantity(adjustment.quantityDelta)} {item.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
}
