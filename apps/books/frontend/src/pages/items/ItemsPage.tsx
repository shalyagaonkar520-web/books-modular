/** Item catalogue: search, filters, sorting, create/edit, details and stock adjustments. */
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, Eye, Package, Pencil, Plus, SlidersHorizontal, Trash2, TrendingDown, Wallet } from 'lucide-react';

import { ApiError } from '@/api/client';
import { accountingApi, contactsApi, itemsApi, reportsApi } from '@/api/endpoints';
import type { Item, ItemType } from '@/api/types';
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
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate, formatDateTime, formatPercent, formatQuantity, parseNumber, todayIso } from '@/utils/format';
import { TAX_RATES, UNITS, type Tone } from '@/utils/status';

const PAGE_SIZE = 25;

const TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'goods', label: 'Goods' },
  { value: 'service', label: 'Services' },
];

const INVENTORY_FILTERS = [
  { value: 'all', label: 'All items' },
  { value: 'tracked', label: 'Inventory tracked' },
  { value: 'non-tracked', label: 'Not tracked' },
  { value: 'low-stock', label: 'Low stock' },
];

const TYPE_OPTIONS = [
  { value: 'goods', label: 'Goods' },
  { value: 'service', label: 'Service' },
];

const UNIT_OPTIONS = UNITS.map((unit) => ({ value: unit, label: unit }));
const TAX_OPTIONS = TAX_RATES.map((rate) => ({ value: String(rate), label: `${rate}%` }));

interface SelectOptions {
  salesAccounts: Array<{ value: string; label: string }>;
  purchaseAccounts: Array<{ value: string; label: string }>;
  vendors: Array<{ value: string; label: string }>;
}

function stockTone(item: Item): Tone {
  if (item.stockOnHand <= 0) return 'danger';
  if (item.stockOnHand <= item.reorderLevel) return 'warning';
  return 'success';
}

function StockCell({ item }: { item: Item }) {
  if (item.type === 'service' || !item.trackInventory) return <span className="text-muted">Not tracked</span>;
  return (
    <Badge tone={stockTone(item)}>
      {formatQuantity(item.stockOnHand)} {item.unit}
    </Badge>
  );
}

export function ItemsPage() {
  const toast = useToast();
  const { canWrite } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [typeFilter, setTypeFilter] = useState('all');
  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [formItem, setFormItem] = useState<Item | null>(null);
  const [formOpen, setFormOpen] = useState(false);
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

  const options = useAsync(async (): Promise<SelectOptions> => {
    const [income, expense, asset, vendors] = await Promise.all([
      accountingApi.accounts({ type: 'income' }),
      accountingApi.accounts({ type: 'expense' }),
      accountingApi.accounts({ type: 'asset' }),
      contactsApi.list({ type: 'vendor', page_size: 200 }),
    ]);
    const toOption = (account: { id: string; code: string; name: string }) => ({ value: account.id, label: `${account.code} · ${account.name}` });
    return {
      salesAccounts: income.map(toOption),
      purchaseAccounts: [...expense, ...asset].map(toOption),
      vendors: vendors.items.map((vendor) => ({ value: vendor.id, label: vendor.displayName })),
    };
  }, []);

  const wantsNew = canWrite && searchParams.get('new') === '1';
  useEffect(() => {
    if (wantsNew) {
      setFormItem(null);
      setFormOpen(true);
    }
  }, [wantsNew]);

  function closeForm() {
    setFormOpen(false);
    setFormItem(null);
    if (searchParams.has('new')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }

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
      toast.error(`Deleted ${count} of ${selectedIds.size} item(s); ${failedIds.size} could not be deleted.${reason}`);
    } else {
      toast.success(`Deleted ${count} item(s)`);
    }
    setSelectedIds(failedIds);
    reloadAll();
  }

  const rows = list.data?.items ?? [];
  const stats = summary.data;

  const columns: Array<Column<Item>> = [
    {
      key: 'name',
      header: 'Item',
      sortable: true,
      render: (item) => (
        <div className="cell-stack">
          <span className="strong">{item.name}</span>
          <small className="mono">{item.sku}</small>
          {item.description ? <small className="text-muted">{item.description}</small> : null}
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (item) => <Badge tone={item.type === 'goods' ? 'info' : 'neutral'}>{item.type === 'goods' ? 'Goods' : 'Service'}</Badge> },
    { key: 'unit', header: 'Unit', render: (item) => <span className="text-muted">{item.unit}</span> },
    { key: 'taxRate', header: 'Tax', align: 'right', render: (item) => <span className="num">{formatPercent(item.taxRate)}</span> },
    { key: 'sellingPrice', header: 'Selling price', align: 'right', sortable: true, render: (item) => <span className="num">{formatCurrency(item.sellingPrice)}</span> },
    { key: 'costPrice', header: 'Cost price', align: 'right', sortable: true, render: (item) => <span className="num">{formatCurrency(item.costPrice)}</span> },
    { key: 'stockOnHand', header: 'Stock', align: 'right', sortable: true, render: (item) => <StockCell item={item} /> },
    {
      key: 'reorderLevel',
      header: 'Low stock at',
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
    { key: 'createdAt', header: 'Added', sortable: true, render: (item) => <span className="text-muted small">{formatDate(item.createdAt)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (item) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="action-btn" aria-label={`View ${item.name}`} onClick={() => setDetailsItem(item)}>
            <Eye size={15} />
          </button>
          <IfCanWrite>
            <button
              type="button"
              className="action-btn"
              aria-label={`Edit ${item.name}`}
              onClick={() => {
                setFormItem(item);
                setFormOpen(true);
              }}
            >
              <Pencil size={15} />
            </button>
            {item.trackInventory ? (
              <button type="button" className="action-btn" aria-label={`Adjust stock for ${item.name}`} onClick={() => setAdjustItem(item)}>
                <SlidersHorizontal size={15} />
              </button>
            ) : null}
            <button type="button" className="action-btn is-danger" aria-label={`Delete ${item.name}`} onClick={() => setDeleteItem(item)}>
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
        title="Items"
        subtitle="Goods and services you sell or buy, with inventory tracking."
        actions={
          <IfCanWrite>
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                setFormItem(null);
                setFormOpen(true);
              }}
            >
              New item
            </Button>
          </IfCanWrite>
        }
      />

      {stats ? (
        <div className="stat-grid">
          <StatTile label="Total items" value={formatQuantity(stats.totalItems)} sublabel={`${list.data?.total ?? 0} matching filters`} icon={<Package size={16} />} />
          <StatTile label="Tracked items" value={formatQuantity(stats.trackedItems)} sublabel="Inventory managed" icon={<Boxes size={16} />} />
          <StatTile label="Stock value" value={formatCurrency(stats.totalStockValue)} sublabel="At cost price" icon={<Wallet size={16} />} />
          <StatTile
            label="Low stock"
            value={formatQuantity(stats.lowStockItems)}
            sublabel="At or below reorder level"
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
          placeholder="Search name, SKU, HSN…"
          label="Search items"
        />
        <FilterSelect
          label="Type"
          value={typeFilter}
          onChange={(value) => {
            setTypeFilter(value);
            setPage(1);
          }}
          options={TYPE_FILTERS}
        />
        <FilterSelect
          label="Inventory"
          value={inventoryFilter}
          onChange={(value) => {
            setInventoryFilter(value);
            setPage(1);
          }}
          options={INVENTORY_FILTERS}
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
              title="No items yet"
              description="Add the goods and services you sell so you can put them on invoices and bills."
              icon={<Package size={28} aria-hidden="true" />}
              action={
                <IfCanWrite>
                  <Button
                    variant="primary"
                    icon={<Plus size={15} />}
                    onClick={() => {
                      setFormItem(null);
                      setFormOpen(true);
                    }}
                  >
                    New item
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
                  {selectedIds.size === rows.length && rows.length > 0 ? 'Deselect All' : `Select All on Page (${rows.length})`}
                </Button>
                {selectedIds.size > 0 ? (
                  <span className="small text-muted">{selectedIds.size} selected</span>
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
                    Delete Selected ({selectedIds.size})
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
              caption="Item catalogue"
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

      {formOpen ? (
        <ItemFormModal
          item={formItem}
          options={options.data}
          optionsError={options.error}
          onClose={closeForm}
          onSaved={(message) => {
            toast.success(message);
            closeForm();
            reloadAll();
          }}
        />
      ) : null}

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
        title="Delete item"
        message={
          <>
            <FormError message={deleteSubmit.error} />
            {deleteItem
              ? `Delete “${deleteItem.name}” (${deleteItem.sku})? If the item is used on invoices or bills it will be marked inactive instead.`
              : ''}
          </>
        }
        confirmLabel="Delete item"
        busy={deleteSubmit.submitting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteItem(null);
          deleteSubmit.reset();
        }}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="Delete selected items"
        message={<p>{selectedIds.size} selected item(s) will be permanently removed. Any used on invoices or bills are marked inactive instead.</p>}
        confirmLabel="Delete"
        busy={bulkDeleting}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => void confirmBulkDelete()}
      />
    </>
  );
}

interface FormState {
  name: string;
  sku: string;
  type: ItemType;
  unit: string;
  hsnSac: string;
  taxRate: string;
  description: string;
  sellingPrice: string;
  salesAccountId: string;
  salesDescription: string;
  costPrice: string;
  purchaseAccountId: string;
  preferredVendorId: string;
  purchaseDescription: string;
  trackInventory: boolean;
  openingStock: string;
  openingStockRate: string;
  reorderLevel: string;
  warehouseLocation: string;
}

function initialForm(item: Item | null): FormState {
  return {
    name: item?.name ?? '',
    sku: item?.sku ?? '',
    type: item?.type ?? 'goods',
    unit: item?.unit ?? 'pcs',
    hsnSac: item?.hsnSac ?? '',
    taxRate: String(item?.taxRate ?? 18),
    description: item?.description ?? '',
    sellingPrice: item ? String(item.sellingPrice) : '',
    salesAccountId: item?.salesAccountId ?? '',
    salesDescription: item?.salesDescription ?? '',
    costPrice: item ? String(item.costPrice) : '',
    purchaseAccountId: item?.purchaseAccountId ?? '',
    preferredVendorId: item?.preferredVendorId ?? '',
    purchaseDescription: item?.purchaseDescription ?? '',
    trackInventory: item?.trackInventory ?? false,
    openingStock: item ? String(item.openingStock) : '0',
    openingStockRate: item ? String(item.openingStockRate) : '0',
    reorderLevel: item ? String(item.reorderLevel) : '0',
    warehouseLocation: item?.warehouseLocation ?? '',
  };
}

interface ItemFormModalProps {
  item: Item | null;
  options: SelectOptions | null;
  optionsError: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function ItemFormModal({ item, options, optionsError, onClose, onSaved }: ItemFormModalProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(item));
  const { submitting, error, fieldErrors, run } = useSubmit();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const tracks = form.type === 'goods' && form.trackInventory;

  async function save() {
    const payload: Partial<Item> = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      type: form.type,
      unit: form.unit,
      hsnSac: form.hsnSac.trim() || null,
      taxRate: parseNumber(form.taxRate),
      description: form.description.trim() || null,
      sellingPrice: parseNumber(form.sellingPrice),
      salesAccountId: form.salesAccountId || null,
      salesDescription: form.salesDescription.trim() || null,
      costPrice: parseNumber(form.costPrice),
      purchaseAccountId: form.purchaseAccountId || null,
      preferredVendorId: form.preferredVendorId || null,
      purchaseDescription: form.purchaseDescription.trim() || null,
      trackInventory: tracks,
      openingStock: tracks ? parseNumber(form.openingStock) : 0,
      openingStockRate: tracks ? parseNumber(form.openingStockRate) : 0,
      reorderLevel: tracks ? parseNumber(form.reorderLevel) : 0,
      warehouseLocation: tracks ? form.warehouseLocation.trim() || null : null,
    };
    const result = await run(() => (item ? itemsApi.update(item.id, payload) : itemsApi.create(payload)));
    if (result) onSaved(item ? `${result.name} updated` : `${result.name} created`);
  }

  return (
    <Modal
      open
      size="lg"
      title={item ? 'Edit item' : 'New item'}
      subtitle={item ? item.sku : 'Goods and services you sell or purchase'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={submitting} onClick={save}>
            {item ? 'Save changes' : 'Create item'}
          </Button>
        </>
      }
    >
      <FormError message={error ?? optionsError} />

      <section className="form-section">
        <h3 className="form-section-title">Basics</h3>
        <div className="form-grid">
          <TextField label="Name" required value={form.name} error={fieldErrors.name} onChange={(event) => set('name', event.target.value)} />
          <TextField label="SKU" required value={form.sku} error={fieldErrors.sku} hint="Unique code for this item" onChange={(event) => set('sku', event.target.value)} />
          <SelectField label="Type" value={form.type} options={TYPE_OPTIONS} error={fieldErrors.type} onChange={(event) => set('type', event.target.value as ItemType)} />
          <SelectField label="Unit" value={form.unit} options={UNIT_OPTIONS} error={fieldErrors.unit} onChange={(event) => set('unit', event.target.value)} />
          <TextField label="HSN / SAC" value={form.hsnSac} error={fieldErrors.hsnSac} onChange={(event) => set('hsnSac', event.target.value)} />
          <SelectField label="Tax rate" value={form.taxRate} options={TAX_OPTIONS} error={fieldErrors.taxRate} onChange={(event) => set('taxRate', event.target.value)} />
        </div>
        <TextAreaField label="Description" value={form.description} error={fieldErrors.description} onChange={(event) => set('description', event.target.value)} />
      </section>

      <section className="form-section">
        <h3 className="form-section-title">Sales information</h3>
        <div className="form-grid">
          <TextField
            label="Selling price"
            type="number"
            min="0"
            step="0.01"
            prefix="₹"
            value={form.sellingPrice}
            error={fieldErrors.sellingPrice}
            onChange={(event) => set('sellingPrice', event.target.value)}
          />
          <SelectField
            label="Sales account"
            value={form.salesAccountId}
            placeholder="Use the default income account"
            options={options?.salesAccounts ?? []}
            error={fieldErrors.salesAccountId}
            onChange={(event) => set('salesAccountId', event.target.value)}
          />
        </div>
        <TextAreaField
          label="Sales description"
          rows={2}
          value={form.salesDescription}
          error={fieldErrors.salesDescription}
          hint="Shown on invoices when this item is added"
          onChange={(event) => set('salesDescription', event.target.value)}
        />
      </section>

      <section className="form-section">
        <h3 className="form-section-title">Purchase information</h3>
        <div className="form-grid-3">
          <TextField
            label="Cost price"
            type="number"
            min="0"
            step="0.01"
            prefix="₹"
            value={form.costPrice}
            error={fieldErrors.costPrice}
            onChange={(event) => set('costPrice', event.target.value)}
          />
          <SelectField
            label="Purchase account"
            value={form.purchaseAccountId}
            placeholder="Use the default expense account"
            options={options?.purchaseAccounts ?? []}
            error={fieldErrors.purchaseAccountId}
            onChange={(event) => set('purchaseAccountId', event.target.value)}
          />
          <SelectField
            label="Preferred vendor"
            value={form.preferredVendorId}
            placeholder="No preferred vendor"
            options={options?.vendors ?? []}
            error={fieldErrors.preferredVendorId}
            onChange={(event) => set('preferredVendorId', event.target.value)}
          />
        </div>
        <TextAreaField
          label="Purchase description"
          rows={2}
          value={form.purchaseDescription}
          error={fieldErrors.purchaseDescription}
          hint="Shown on bills when this item is added"
          onChange={(event) => set('purchaseDescription', event.target.value)}
        />
      </section>

      {form.type === 'goods' ? (
        <section className="form-section">
          <h3 className="form-section-title">Inventory</h3>
          <CheckboxField
            label="Track inventory for this item"
            hint="Records stock on hand and posts opening stock to the ledger"
            checked={form.trackInventory}
            onChange={(event) => set('trackInventory', event.target.checked)}
          />
          {form.trackInventory ? (
            <div className="form-grid-3">
              <TextField
                label="Opening stock"
                type="number"
                min="0"
                step="0.001"
                value={form.openingStock}
                error={fieldErrors.openingStock}
                onChange={(event) => set('openingStock', event.target.value)}
              />
              <TextField
                label="Opening stock rate"
                type="number"
                min="0"
                step="0.01"
                prefix="₹"
                value={form.openingStockRate}
                error={fieldErrors.openingStockRate}
                onChange={(event) => set('openingStockRate', event.target.value)}
              />
              <TextField
                label="Low stock threshold"
                type="number"
                min="0"
                step="0.001"
                value={form.reorderLevel}
                error={fieldErrors.reorderLevel}
                onChange={(event) => set('reorderLevel', event.target.value)}
                hint="Stock at or below this triggers the low-stock warning and filter"
              />
              <TextField
                label="Warehouse location"
                value={form.warehouseLocation}
                error={fieldErrors.warehouseLocation}
                onChange={(event) => set('warehouseLocation', event.target.value)}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </Modal>
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
  const dash = <span className="text-muted">—</span>;
  return (
    <Modal open size="lg" title={item.name} subtitle={`${item.sku} · ${item.type === 'goods' ? 'Goods' : 'Service'}`} onClose={onClose}>
      <div className="detail-grid">
        <Detail label="SKU" value={<span className="mono">{item.sku}</span>} />
        <Detail label="Type" value={<Badge tone={item.type === 'goods' ? 'info' : 'neutral'}>{item.type === 'goods' ? 'Goods' : 'Service'}</Badge>} />
        <Detail label="Unit" value={item.unit} />
        <Detail label="HSN / SAC" value={item.hsnSac || dash} />
        <Detail label="Tax rate" value={formatPercent(item.taxRate)} />
        <Detail label="Status" value={<Badge tone={item.isActive ? 'success' : 'neutral'}>{item.isActive ? 'Active' : 'Inactive'}</Badge>} />
        <Detail label="Selling price" value={formatCurrency(item.sellingPrice)} />
        <Detail label="Sales account" value={item.salesAccountName || dash} />
        <Detail label="Cost price" value={formatCurrency(item.costPrice)} />
        <Detail label="Purchase account" value={item.purchaseAccountName || dash} />
        <Detail label="Preferred vendor" value={item.preferredVendorName || dash} />
        <Detail label="Inventory" value={item.trackInventory ? 'Tracked' : 'Not tracked'} />
        {item.trackInventory ? (
          <>
            <Detail label="Stock on hand" value={<Badge tone={stockTone(item)}>{`${formatQuantity(item.stockOnHand)} ${item.unit}`}</Badge>} />
            <Detail label="Low stock threshold" value={`${formatQuantity(item.reorderLevel)} ${item.unit}`} />
            <Detail label="Opening stock" value={`${formatQuantity(item.openingStock)} ${item.unit}`} />
            <Detail label="Opening stock rate" value={formatCurrency(item.openingStockRate)} />
            <Detail label="Stock valuation" value={<span className="strong">{formatCurrency(item.stockOnHand * item.costPrice)}</span>} />
            <Detail label="Warehouse" value={item.warehouseLocation || dash} />
          </>
        ) : null}
        <Detail label="Created" value={formatDateTime(item.createdAt)} />
        <Detail label="Last updated" value={formatDateTime(item.updatedAt)} />
      </div>

      {item.description || item.salesDescription || item.purchaseDescription ? (
        <div className="stack">
          {item.description ? <Detail label="Description" value={item.description} /> : null}
          {item.salesDescription ? <Detail label="Sales description" value={item.salesDescription} /> : null}
          {item.purchaseDescription ? <Detail label="Purchase description" value={item.purchaseDescription} /> : null}
        </div>
      ) : null}
    </Modal>
  );
}

function AdjustStockModal({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: (message: string) => void }) {
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
    if (result) onSaved(`${result.adjustmentNumber} recorded for ${item.name}`);
  }

  return (
    <Modal
      open
      title="Adjust stock"
      subtitle={`${item.name} · on hand ${formatQuantity(item.stockOnHand)} ${item.unit}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={submitting} onClick={save}>
            Save adjustment
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label="Date" type="date" required value={date} error={fieldErrors.date} onChange={(event) => setDate(event.target.value)} />
        <TextField
          label="Quantity change"
          type="number"
          step="0.001"
          required
          value={quantityDelta}
          error={fieldErrors.quantityDelta}
          hint="Use a negative number to reduce stock"
          onChange={(event) => setQuantityDelta(event.target.value)}
        />
      </div>
      <TextField label="Reason" required value={reason} error={fieldErrors.reason} onChange={(event) => setReason(event.target.value)} />
      <TextAreaField label="Notes" rows={2} value={notes} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />

      <section className="form-section">
        <h3 className="form-section-title">Recent adjustments</h3>
        {history.loading ? (
          <SkeletonRows rows={3} columns={3} />
        ) : history.error ? (
          <ErrorBlock message={history.error} onRetry={history.reload} />
        ) : !history.data?.items.length ? (
          <p className="text-muted small">No stock adjustments recorded for this item yet.</p>
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
