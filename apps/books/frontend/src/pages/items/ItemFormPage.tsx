/** Create or edit an item on its own page. */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { accountingApi, contactsApi, itemsApi } from '@/api/endpoints';
import type { Item, ItemType } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber } from '@/utils/format';
import { taxRatesWith, UNITS } from '@/utils/status';

const UNIT_OPTIONS = UNITS.map((unit) => ({ value: unit, label: unit }));

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

/** Tax rate a brand-new item starts with when the organization sets no default. */
const FALLBACK_TAX_RATE = 18;

function initialForm(item: Item | null, defaultTaxRate?: number): FormState {
  return {
    name: item?.name ?? '',
    sku: item?.sku ?? '',
    type: item?.type ?? 'goods',
    unit: item?.unit ?? 'pcs',
    hsnSac: item?.hsnSac ?? '',
    taxRate: String(item ? item.taxRate : (defaultTaxRate ?? FALLBACK_TAX_RATE)),
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
  const { t } = useAppContent();
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

  if ((isEdit && existing.loading) || refs.loading) return <LoadingBlock label={t('items.form.loading')} />;
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
  const { t } = useAppContent();
  const toast = useToast();
  const { organization } = useAuth();
  const [form, setForm] = useState<FormState>(() => initialForm(item, organization?.defaultTaxRate));
  const taxOptions = taxRatesWith(organization?.defaultTaxRate, item?.taxRate).map((rate) => ({ value: String(rate), label: `${rate}%` }));
  const { submitting, error, fieldErrors, run } = useSubmit();
  const typeOptions = [
    { value: 'goods', label: t('items.type.goods') },
    { value: 'service', label: t('items.type.service') },
  ];

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
      toast.success(item ? t('items.form.updated', { name: result.name }) : t('items.form.created', { name: result.name }));
      onDone();
    }
  }

  return (
    <>
      <PageHeader
        title={item ? t('items.form.editTitle', { name: item.name }) : t('items.form.newTitle')}
        subtitle={item ? item.sku : t('items.form.subtitle')}
        actions={
          <Button variant="secondary" onClick={onDone} disabled={submitting}>
            {t('items.form.cancel')}
          </Button>
        }
      />

      <div className="form-page">
      <FormError message={error ?? optionsError} />

      <section className="form-page-section">
          <h3 className="form-section-title">{t('items.form.section.basics')}</h3>
        <div className="form-grid">
          <TextField label={t('items.form.name')} required value={form.name} error={fieldErrors.name} onChange={(event) => set('name', event.target.value)} />
          <TextField label={t('items.form.sku')} required value={form.sku} error={fieldErrors.sku} hint={t('items.form.skuHint')} onChange={(event) => set('sku', event.target.value)} />
          <SelectField label={t('items.form.type')} value={form.type} options={typeOptions} error={fieldErrors.type} onChange={(event) => set('type', event.target.value as ItemType)} />
          <SelectField label={t('items.form.unit')} value={form.unit} options={UNIT_OPTIONS} error={fieldErrors.unit} onChange={(event) => set('unit', event.target.value)} />
          <TextField label={t('items.form.hsnSac')} value={form.hsnSac} error={fieldErrors.hsnSac} onChange={(event) => set('hsnSac', event.target.value)} />
          <SelectField label={t('items.form.taxRate')} value={form.taxRate} options={taxOptions} error={fieldErrors.taxRate} onChange={(event) => set('taxRate', event.target.value)} />
        </div>
        <TextAreaField label={t('items.form.description')} value={form.description} error={fieldErrors.description} onChange={(event) => set('description', event.target.value)} />
      </section>

      <section className="form-page-section">
          <h3 className="form-section-title">{t('items.form.section.sales')}</h3>
        <div className="form-grid">
          <TextField
            label={t('items.form.sellingPrice')}
            type="number"
            min="0"
            step="0.01"
            prefix="₹"
            value={form.sellingPrice}
            error={fieldErrors.sellingPrice}
            onChange={(event) => set('sellingPrice', event.target.value)}
          />
          <SelectField
            label={t('items.form.salesAccount')}
            value={form.salesAccountId}
            placeholder={t('items.form.salesAccountPlaceholder')}
            options={options?.salesAccounts ?? []}
            error={fieldErrors.salesAccountId}
            onChange={(event) => set('salesAccountId', event.target.value)}
          />
        </div>
        <TextAreaField
          label={t('items.form.salesDescription')}
          rows={2}
          value={form.salesDescription}
          error={fieldErrors.salesDescription}
          hint={t('items.form.salesDescriptionHint')}
          onChange={(event) => set('salesDescription', event.target.value)}
        />
      </section>

      <section className="form-page-section">
          <h3 className="form-section-title">{t('items.form.section.purchase')}</h3>
        <div className="form-grid-3">
          <TextField
            label={t('items.form.costPrice')}
            type="number"
            min="0"
            step="0.01"
            prefix="₹"
            value={form.costPrice}
            error={fieldErrors.costPrice}
            onChange={(event) => set('costPrice', event.target.value)}
          />
          <SelectField
            label={t('items.form.purchaseAccount')}
            value={form.purchaseAccountId}
            placeholder={t('items.form.purchaseAccountPlaceholder')}
            options={options?.purchaseAccounts ?? []}
            error={fieldErrors.purchaseAccountId}
            onChange={(event) => set('purchaseAccountId', event.target.value)}
          />
          <SelectField
            label={t('items.form.preferredVendor')}
            value={form.preferredVendorId}
            placeholder={t('items.form.preferredVendorPlaceholder')}
            options={options?.vendors ?? []}
            error={fieldErrors.preferredVendorId}
            onChange={(event) => set('preferredVendorId', event.target.value)}
          />
        </div>
        <TextAreaField
          label={t('items.form.purchaseDescription')}
          rows={2}
          value={form.purchaseDescription}
          error={fieldErrors.purchaseDescription}
          hint={t('items.form.purchaseDescriptionHint')}
          onChange={(event) => set('purchaseDescription', event.target.value)}
        />
      </section>

      {form.type === 'goods' ? (
        <section className="form-page-section">
          <h3 className="form-section-title">{t('items.form.section.inventory')}</h3>
          <CheckboxField
            label={t('items.form.trackInventory')}
            hint={t('items.form.trackInventoryHint')}
            checked={form.trackInventory}
            onChange={(event) => set('trackInventory', event.target.checked)}
          />
          {form.trackInventory ? (
            <div className="form-grid-3">
              <TextField
                label={t('items.form.openingStock')}
                type="number"
                min="0"
                step="0.001"
                value={form.openingStock}
                error={fieldErrors.openingStock}
                onChange={(event) => set('openingStock', event.target.value)}
              />
              <TextField
                label={t('items.form.openingStockRate')}
                type="number"
                min="0"
                step="0.01"
                prefix="₹"
                value={form.openingStockRate}
                error={fieldErrors.openingStockRate}
                onChange={(event) => set('openingStockRate', event.target.value)}
              />
              <TextField
                label={t('items.form.reorderLevel')}
                type="number"
                min="0"
                step="0.001"
                value={form.reorderLevel}
                error={fieldErrors.reorderLevel}
                onChange={(event) => set('reorderLevel', event.target.value)}
                hint={t('items.form.reorderLevelHint')}
              />
              <TextField
                label={t('items.form.warehouseLocation')}
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
          <span className="text-subtle small">{item ? t('items.form.editingExisting') : t('items.form.creatingNew')}</span>
          <div className="row">
            <Button variant="secondary" onClick={onDone} disabled={submitting}>
              {t('items.form.cancel')}
            </Button>
            <Button variant="primary" loading={submitting} onClick={save}>
              {item ? t('items.form.saveChanges') : t('items.form.create')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
