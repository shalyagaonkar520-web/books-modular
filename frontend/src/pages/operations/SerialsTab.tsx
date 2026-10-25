/** Inventory tab: every serial-numbered unit, where it is, and registering serials for stock already on hand. */
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { itemsApi } from '@/api/endpoints';
import { warehousesApi } from '@/api/inventoryOps';
import { serialsApi } from '@/api/operations';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';

const SOURCE_KEYS: Record<string, string> = {
  invoice_stock: 'ops.serials.source.invoice',
  bill_stock: 'ops.serials.source.bill',
  serial_register: 'ops.serials.source.register',
};

export function SerialsTab() {
  const { t } = useAppContent();
  const { canWrite } = useAuth();
  const [itemId, setItemId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [registering, setRegistering] = useState(false);
  const debounced = useDebounced(search, 300);
  // Serial-tracked items are always stock-tracked: let the server narrow the list first.
  const items = useAsync(() => itemsApi.list({ inventory_filter: 'tracked', page_size: 200 }), []);
  const serialItems = useMemo(() => (items.data?.items ?? []).filter((i) => i.trackSerial), [items.data]);
  const list = useAsync(
    () => serialsApi.list({ itemId: itemId || undefined, status: status || undefined, search: debounced.trim() || undefined }),
    [itemId, status, debounced],
  );

  return (
    <Card
      title={t('ops.serials.title')}
      subtitle={t('ops.serials.subtitle')}
      actions={
        canWrite && serialItems.length ? (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setRegistering(true)}>
            {t('ops.serials.register')}
          </Button>
        ) : null
      }
    >
      <div className="form-grid">
        <SelectField
          label={t('ops.serials.item')}
          value={itemId}
          placeholder={t('ops.serials.allItems')}
          options={serialItems.map((i) => ({ value: i.id, label: i.name }))}
          onChange={(e) => setItemId(e.target.value)}
        />
        <SelectField
          label={t('ops.serials.status')}
          value={status}
          placeholder={t('ops.serials.anyStatus')}
          options={[
            { value: 'in_stock', label: t('ops.serials.inStock') },
            { value: 'out', label: t('ops.serials.out') },
          ]}
          onChange={(e) => setStatus(e.target.value)}
        />
        <label className="field">
          <span className="field-label">{t('ops.serials.search')}</span>
          <input className="input" value={search} maxLength={80} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      {list.loading ? <LoadingBlock /> : null}
      {list.error ? <ErrorBlock message={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.length === 0 ? <EmptyState title={t('ops.serials.empty')} description={t('ops.serials.emptyHint')} /> : null}
      {list.data && list.data.length ? (
        <table className="data-table form-section">
          <thead>
            <tr>
              <th>{t('ops.serials.serial')}</th>
              <th>{t('ops.serials.item')}</th>
              <th>{t('ops.serials.warehouse')}</th>
              <th>{t('ops.serials.status')}</th>
              <th>{t('ops.serials.lastMove')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.serialNumber}</td>
                <td>{s.itemName}</td>
                <td>{s.warehouseName}</td>
                <td>
                  <Badge tone={s.status === 'in_stock' ? 'success' : 'neutral'}>{s.status === 'in_stock' ? t('ops.serials.inStock') : t('ops.serials.out')}</Badge>
                </td>
                <td className="small text-subtle">{s.lastSourceType ? t(SOURCE_KEYS[s.lastSourceType] ?? 'ops.serials.source.other') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {registering ? (
        <RegisterModal
          items={serialItems.map((i) => ({ id: i.id, name: i.name }))}
          onClose={() => setRegistering(false)}
          onSaved={() => {
            setRegistering(false);
            list.reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function RegisterModal({ items, onClose, onSaved }: { items: Array<{ id: string; name: string }>; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const warehouses = useAsync(() => warehousesApi.list(), []);
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const [warehouseId, setWarehouseId] = useState('');
  const [serials, setSerials] = useState('');
  const { submitting, error, run } = useSubmit();
  const save = async () => {
    const res = await run(() => serialsApi.register({ itemId, warehouseId: warehouseId || null, serialNumbers: serials }));
    if (res) {
      toast.success(res.message);
      onSaved();
    }
  };
  return (
    <Modal
      open
      title={t('ops.serials.register')}
      subtitle={t('ops.serials.registerHint')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={submitting} disabled={!itemId || !serials.trim()} onClick={save}>
            {t('ops.serials.register')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <SelectField label={t('ops.serials.item')} value={itemId} options={items.map((i) => ({ value: i.id, label: i.name }))} onChange={(e) => setItemId(e.target.value)} />
        <SelectField
          label={t('ops.serials.warehouse')}
          value={warehouseId}
          placeholder={t('docflow.form.warehouseDefault')}
          options={(warehouses.data ?? []).filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name }))}
          onChange={(e) => setWarehouseId(e.target.value)}
        />
      </div>
      <TextAreaField label={t('ops.serials.label')} rows={6} value={serials} hint={t('ops.serials.oneEach')} onChange={(e) => setSerials(e.target.value)} />
    </Modal>
  );
}
