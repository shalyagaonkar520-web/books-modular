/** Create or edit an item on its own page. */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { accountingApi, contactsApi, itemsApi } from '@/api/endpoints';
import type { Item, ItemType } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber } from '@/utils/format';
import { TAX_RATES, UNITS } from '@/utils/status';

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

export function ItemFormPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(itemId);

  // Reading the chart of accounts is Admin/Viewer only, while Staff may create
  // items - so a Staff user must not be made to load accounts just to open the
  // form. The account pickers are hidden for them and the item saves without,
  // falling back to the org defaults on the server.
  const { can } = useAuth();
  const canChooseAccounts = can('admin', 'viewer');

  const existing = useAsync(() => (itemId ? itemsApi.get(itemId) : Promise.resolve(null)), [itemId]);
  const refs = useAsync(async (): Promise<SelectOptions> => {
    const [accounts, vendorPage] = await Promise.all([
      canChooseAccounts ? accountingApi.accounts() : Promise.resolve([]),
      contactsApi.list({ type: 'vendor', page_size: 200 }),
    ]);
    return {
      salesAccounts: accounts.filter((a) => a.type === 'income').map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
      purchaseAccounts: accounts
        .filter((a) => a.type === 'expense' || a.subtype === 'inventory')
        .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })),
      vendors: vendorPage.items.map((v) => ({ value: v.id, label: v.displayName })),
    };
  }, [canChooseAccounts]);

  if ((isEdit && existing.loading) || refs.loading) return <LoadingBlock label="Loading item…" />;
  if (isEdit && existing.error) return <ErrorBlock message={existing.error} onRetry={existing.reload} />;

  return (
    <ItemForm
      key={existing.data?.id ?? 'new'}
      item={existing.data ?? null}
      options={refs.data ?? null}
      optionsError={refs.error}
      onDone={() => navigate('/items')}
    />
  );
}

interface ItemFormProps {
  item: Item | null;
  options: SelectOptions | null;
  optionsError: string | null;
  onDone: () => void;
}

function ItemForm({ item, options, optionsError, onDone }: ItemFormProps) {
  const toast = useToast();
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
    if (result) {
      toast.success(item ? `${result.name} updated` : `${result.name} created`);
      onDone();
    }
  }

  return (
    <>
      <PageHeader
        title={item ? `Edit ${item.name}` : 'New item'}
        subtitle={item ? item.sku : 'Goods and services you sell or purchase'}
        actions={
          <Button variant="secondary" onClick={onDone} disabled={submitting}>
            Cancel
          </Button>
        }
      />

      <div className="form-page">
      <FormError message={error ?? optionsError} />

      <section className="form-page-section">
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

      <section className="form-page-section">
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

      <section className="form-page-section">
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
        <section className="form-page-section">
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
      </div>

      <div className="form-actions-bar">
        <div className="row-between">
          <span className="text-subtle small">{item ? 'Editing an existing item' : 'A new item will be created'}</span>
          <div className="row">
            <Button variant="secondary" onClick={onDone} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" loading={submitting} onClick={save}>
              {item ? 'Save changes' : 'Create item'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
