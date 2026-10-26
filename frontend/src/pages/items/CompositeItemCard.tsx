/** On a stock item: its bill of materials, assembling finished units, and past assemblies. */
import { useEffect, useState } from 'react';
import { Hammer, Plus, Trash2, Undo2 } from 'lucide-react';

import { itemsApi } from '@/api/endpoints';
import { compositesApi, warehousesApi } from '@/api/inventoryOps';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatQuantity, parseNumber, todayIso } from '@/utils/format';

export function CompositeItemCard({ itemId, onChanged }: { itemId: string; onChanged?: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const components = useAsync(() => compositesApi.components(itemId), [itemId]);
  const assemblies = useAsync(() => compositesApi.assemblies(itemId), [itemId]);
  const items = useAsync(() => itemsApi.list({ page_size: 200 }), []);
  const [rows, setRows] = useState<Array<{ itemId: string; quantity: string }>>([]);
  const [assembling, setAssembling] = useState(false);
  const { submitting, error, run, errorRef } = useSubmit();

  useEffect(() => {
    if (components.data) setRows(components.data.map((c) => ({ itemId: c.itemId, quantity: String(c.quantity) })));
  }, [components.data]);

  const options = (items.data?.items ?? []).filter((i) => i.trackInventory && i.id !== itemId).map((i) => ({ value: i.id, label: `${i.name} (${formatQuantity(i.stockOnHand)})` }));
  const unitCost = (components.data ?? []).reduce((s, c) => s + c.unitCost * c.quantity, 0);

  const save = async () => {
    const saved = await run(() => compositesApi.setComponents(itemId, rows.filter((r) => r.itemId && parseNumber(r.quantity) > 0).map((r) => ({ itemId: r.itemId, quantity: parseNumber(r.quantity) }))));
    if (saved) {
      toast.success(t('items.composite.saved'));
      components.reload();
    }
  };
  const undo = async (id: string) => {
    const ok = await run(() => compositesApi.undoAssembly(id));
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t('items.composite.undone'));
      assemblies.reload();
      components.reload();
      onChanged?.();
    }
  };

  return (
    <Card
      title={t('items.composite.title')}
      subtitle={t('items.composite.subtitle')}
      footer={
        canWrite ? (
          <div className="row wrap">
            <Button icon={<Plus size={15} />} onClick={() => setRows((r) => [...r, { itemId: '', quantity: '1' }])}>
              {t('items.composite.addComponent')}
            </Button>
            <Button loading={submitting} onClick={save}>
              {t('items.composite.save')}
            </Button>
            <Button variant="primary" icon={<Hammer size={15} />} disabled={!components.data?.length} onClick={() => setAssembling(true)}>
              {t('items.composite.assemble')}
            </Button>
          </div>
        ) : undefined
      }
    >
      <FormError message={error} />
      {rows.length === 0 ? (
        <p className="text-subtle small">{t('items.composite.none')}</p>
      ) : (
        <table className="line-items-table">
          <thead>
            <tr>
              <th>{t('items.composite.component')}</th>
              <th>{t('items.composite.perUnit')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.itemId}-${i}`}>
                <td>
                  <select className="select" aria-label={t('items.composite.component')} value={row.itemId} disabled={!canWrite} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>
                    <option value="">{t('inventory.pick')}</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="input num" type="number" min="0" step="0.001" aria-label={t('items.composite.perUnit')} value={row.quantity} disabled={!canWrite} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                </td>
                <td>
                  {canWrite ? (
                    <button type="button" className="action-btn is-danger" aria-label={t('docflow.lines.remove')} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {components.data?.length ? <p className="small form-section">{t('items.composite.unitCost', { cost: formatCurrency(unitCost) })}</p> : null}
      {assemblies.data?.length ? (
        <div className="form-section">
          <h4>{t('items.composite.history')}</h4>
          <ul className="plain-list">
            {assemblies.data.map((a) => (
              <li key={a.id}>
                {a.assemblyNumber} · {formatDate(a.date)} · {formatQuantity(a.quantity)} @ {formatCurrency(a.unitCost)}
                {canWrite ? (
                  <button type="button" className="btn btn-link btn-sm" onClick={() => undo(a.id)}>
                    <Undo2 size={13} /> {t('items.composite.undo')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {assembling ? (
        <AssembleModal
          itemId={itemId}
          onClose={() => setAssembling(false)}
          onDone={() => {
            setAssembling(false);
            assemblies.reload();
            components.reload();
            onChanged?.();
          }}
        />
      ) : null}
    </Card>
  );
}

function AssembleModal({ itemId, onClose, onDone }: { itemId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, run } = useSubmit();
  const warehouses = useAsync(() => warehousesApi.list(), []);
  const [quantity, setQuantity] = useState('1');
  const [date, setDate] = useState(todayIso());
  const [warehouseId, setWarehouseId] = useState('');
  const submit = async () => {
    const done = await run(() => compositesApi.assemble(itemId, { quantity: parseNumber(quantity), date, warehouseId: warehouseId || null }));
    if (done) {
      toast.success(t('items.composite.assembled', { number: done.assemblyNumber }));
      onDone();
    }
  };
  return (
    <Modal
      open
      title={t('items.composite.assemble')}
      subtitle={t('items.composite.assembleSubtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            {t('items.composite.assemble')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('items.composite.quantity')} type="number" min="0" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <TextField label={t('inventory.col.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <SelectField label={t('inventory.batch.warehouse')} value={warehouseId} placeholder={t('inventory.defaultWarehouse')} options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} onChange={(e) => setWarehouseId(e.target.value)} />
      </div>
    </Modal>
  );
}
