/** Inventory control: stock by warehouse, warehouses, transfers, batches, the stock ledger and price lists. */
import { useMemo, useState } from 'react';
import { ArrowRightLeft, Plus, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';

import { itemsApi } from '@/api/endpoints';
import { type PriceList, priceListsApi, stockApi, transfersApi, type Warehouse, warehousesApi } from '@/api/inventoryOps';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatQuantity, parseNumber, todayIso } from '@/utils/format';

type Tab = 'stock' | 'warehouses' | 'transfers' | 'batches' | 'ledger' | 'priceLists';

export function InventoryPage() {
  const { t } = useAppContent();
  const [tab, setTab] = useState<Tab>('stock');
  return (
    <div className="stack">
      <PageHeader title={t('inventory.title')} subtitle={t('inventory.subtitle')} />
      <Tabs
        tabs={(['stock', 'warehouses', 'transfers', 'batches', 'ledger', 'priceLists'] as Tab[]).map((id) => ({ id, label: t(`inventory.tab.${id}`) }))}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />
      {tab === 'stock' ? <StockTab /> : null}
      {tab === 'warehouses' ? <WarehousesTab /> : null}
      {tab === 'transfers' ? <TransfersTab /> : null}
      {tab === 'batches' ? <BatchesTab /> : null}
      {tab === 'ledger' ? <LedgerTab /> : null}
      {tab === 'priceLists' ? <PriceListsTab /> : null}
    </div>
  );
}

function StockTab() {
  const { t } = useAppContent();
  const data = useAsync(() => stockApi.summary(), []);
  if (data.loading && !data.data) return <LoadingBlock />;
  if (data.error || !data.data) return <ErrorBlock message={data.error ?? ''} onRetry={data.reload} />;
  const { warehouses, rows, totalValue } = data.data;
  return (
    <Card title={t('inventory.stock.title')} subtitle={t('inventory.stock.subtitle', { value: formatCurrency(totalValue) })}>
      {rows.length === 0 ? (
        <EmptyState title={t('inventory.stock.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('inventory.col.item')}</th>
                {warehouses.map((w) => (
                  <th key={w.id} className="align-right">
                    {w.name}
                  </th>
                ))}
                <th className="align-right">{t('inventory.col.total')}</th>
                <th className="align-right">{t('inventory.col.cost')}</th>
                <th className="align-right">{t('inventory.col.value')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId}>
                  <td>
                    <strong>{r.itemName}</strong> <span className="text-subtle small">{r.sku}</span>
                    {r.belowReorder ? (
                      <>
                        {' '}
                        <Badge tone="warning">{t('inventory.reorder')}</Badge>
                      </>
                    ) : null}
                  </td>
                  {warehouses.map((w) => (
                    <td key={w.id} className="align-right num">
                      {formatQuantity(r.byWarehouse[w.id] ?? 0)}
                    </td>
                  ))}
                  <td className="align-right num strong">
                    {formatQuantity(r.total)} {r.unit}
                  </td>
                  <td className="align-right num">{formatCurrency(r.unitCost)}</td>
                  <td className="align-right num">{formatCurrency(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function WarehousesTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const list = useAsync(() => warehousesApi.list(), []);
  const [editing, setEditing] = useState<Warehouse | 'new' | null>(null);
  const { run, errorRef } = useSubmit();

  const remove = async (w: Warehouse) => {
    const ok = await run(() => warehousesApi.remove(w.id));
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t('inventory.warehouse.deleted'));
      list.reload();
    }
  };

  return (
    <Card
      title={t('inventory.warehouse.title')}
      footer={
        canWrite ? (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
            {t('inventory.warehouse.new')}
          </Button>
        ) : undefined
      }
    >
      {list.loading && !list.data ? (
        <LoadingBlock />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('inventory.warehouse.name')}</th>
                <th>{t('inventory.warehouse.code')}</th>
                <th className="align-right">{t('inventory.warehouse.items')}</th>
                <th className="align-right">{t('inventory.col.value')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((w) => (
                <tr key={w.id}>
                  <td>
                    <WarehouseIcon size={14} aria-hidden="true" /> <strong>{w.name}</strong> {w.isDefault ? <Badge tone="info">{t('inventory.warehouse.default')}</Badge> : null}
                    {!w.isActive ? <Badge tone="neutral">{t('inventory.warehouse.inactive')}</Badge> : null}
                    {w.address ? <div className="small text-subtle">{w.address}</div> : null}
                  </td>
                  <td>{w.code ?? '—'}</td>
                  <td className="align-right">{w.itemCount}</td>
                  <td className="align-right">{formatCurrency(w.stockValue)}</td>
                  <td className="align-right">
                    {canWrite ? (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" onClick={() => setEditing(w)}>
                          {t('inventory.edit')}
                        </Button>
                        {!w.isDefault ? (
                          <button type="button" className="action-btn is-danger" aria-label={t('inventory.warehouse.delete')} onClick={() => remove(w)}>
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <WarehouseModal
          warehouse={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function WarehouseModal({ warehouse, onClose, onSaved }: { warehouse: Warehouse | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, run } = useSubmit();
  const [name, setName] = useState(warehouse?.name ?? '');
  const [code, setCode] = useState(warehouse?.code ?? '');
  const [address, setAddress] = useState(warehouse?.address ?? '');
  const [isDefault, setIsDefault] = useState(warehouse?.isDefault ?? false);
  const [isActive, setIsActive] = useState(warehouse?.isActive ?? true);
  const submit = async () => {
    const body = { name: name.trim(), code: code.trim() || null, address: address.trim() || null, isDefault, isActive };
    const saved = await run(() => (warehouse ? warehousesApi.update(warehouse.id, body) : warehousesApi.create(body)));
    if (saved) {
      toast.success(t('inventory.warehouse.saved', { name: saved.name }));
      onSaved();
    }
  };
  return (
    <Modal
      open
      title={warehouse ? warehouse.name : t('inventory.warehouse.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            {t('inventory.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('inventory.warehouse.name')} required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label={t('inventory.warehouse.code')} value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} />
        <TextField label={t('inventory.warehouse.address')} value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <CheckboxField label={t('inventory.warehouse.makeDefault')} checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
      <CheckboxField label={t('inventory.warehouse.active')} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
    </Modal>
  );
}

function TransfersTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const [page, setPage] = useState(1);
  const list = useAsync(() => transfersApi.list({ page, page_size: 25 }), [page]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { submitting, run, errorRef } = useSubmit();

  const act = async (label: string, action: () => Promise<unknown>) => {
    const ok = await run(action);
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(label);
      list.reload();
    }
  };

  return (
    <Card
      title={t('inventory.transfer.title')}
      footer={
        canWrite ? (
          <Button variant="primary" icon={<ArrowRightLeft size={15} />} onClick={() => setCreating(true)}>
            {t('inventory.transfer.new')}
          </Button>
        ) : undefined
      }
    >
      {list.loading && !list.data ? (
        <LoadingBlock />
      ) : !list.data?.items.length ? (
        <EmptyState title={t('inventory.transfer.empty')} description={t('inventory.transfer.emptyBody')} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('inventory.col.date')}</th>
                  <th>{t('inventory.col.number')}</th>
                  <th>{t('inventory.transfer.route')}</th>
                  <th>{t('inventory.transfer.items')}</th>
                  <th>{t('docflow.col.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((tr) => (
                  <tr key={tr.id}>
                    <td>{formatDate(tr.date)}</td>
                    <td>
                      <strong>{tr.transferNumber}</strong>
                    </td>
                    <td>
                      {tr.fromWarehouseName} → {tr.toWarehouseName}
                    </td>
                    <td className="small">{tr.lines.map((l) => `${l.itemName} × ${formatQuantity(l.quantity)}`).join(', ')}</td>
                    <td>
                      <Badge tone={tr.status === 'transferred' ? 'success' : 'neutral'}>{t(`inventory.transfer.status.${tr.status}`)}</Badge>
                    </td>
                    <td className="align-right">
                      {canWrite ? (
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {tr.status === 'draft' ? (
                            <Button size="sm" disabled={submitting} onClick={() => act(t('inventory.transfer.done'), () => transfersApi.transfer(tr.id))}>
                              {t('inventory.transfer.carryOut')}
                            </Button>
                          ) : null}
                          <button type="button" className="action-btn is-danger" aria-label={t('inventory.transfer.delete')} onClick={() => setDeleting(tr.id)}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={25} total={list.data.total} onPageChange={setPage} />
        </>
      )}
      {creating ? (
        <TransferModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t('docflow.confirm.title')}
        message={t('inventory.transfer.confirmDelete')}
        busy={submitting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const id = deleting;
          setDeleting(null);
          if (id) void act(t('inventory.transfer.deleted'), () => transfersApi.remove(id));
        }}
      />
    </Card>
  );
}

function TransferModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, run, setError } = useSubmit();
  const warehouses = useAsync(() => warehousesApi.list(), []);
  const items = useAsync(() => itemsApi.list({ page_size: 200 }), []);
  const tracked = useMemo(() => (items.data?.items ?? []).filter((i) => i.trackInventory), [items.data]);
  const whOptions = (warehouses.data ?? []).filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name }));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(todayIso());
  const [lines, setLines] = useState([{ key: 1, itemId: '', quantity: '1', batch: '' }]);
  const submit = async (status: 'draft' | 'transferred') => {
    const filled = lines.filter((l) => l.itemId && parseNumber(l.quantity) > 0);
    if (!from || !to || !filled.length) {
      setError(t('inventory.transfer.incomplete'));
      return;
    }
    const saved = await run(() =>
      transfersApi.create({ date, fromWarehouseId: from, toWarehouseId: to, status, lines: filled.map((l) => ({ itemId: l.itemId, quantity: parseNumber(l.quantity), batchNumber: l.batch.trim() || null })) }),
    );
    if (saved) {
      toast.success(t('inventory.transfer.created', { number: saved.transferNumber }));
      onSaved();
    }
  };
  return (
    <Modal
      open
      size="lg"
      title={t('inventory.transfer.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button disabled={submitting} onClick={() => submit('draft')}>
            {t('docflow.form.saveDraft')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={() => submit('transferred')}>
            {t('inventory.transfer.carryOut')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <SelectField label={t('inventory.transfer.from')} value={from} placeholder={t('inventory.pick')} options={whOptions} onChange={(e) => setFrom(e.target.value)} />
        <SelectField label={t('inventory.transfer.to')} value={to} placeholder={t('inventory.pick')} options={whOptions.filter((o) => o.value !== from)} onChange={(e) => setTo(e.target.value)} />
        <TextField label={t('inventory.col.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <table className="line-items-table form-section">
        <thead>
          <tr>
            <th>{t('inventory.col.item')}</th>
            <th>{t('inventory.col.quantity')}</th>
            <th>{t('inventory.col.batch')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.key}>
              <td>
                <select className="select" aria-label={t('inventory.col.item')} value={line.itemId} onChange={(e) => setLines((c) => c.map((l) => (l.key === line.key ? { ...l, itemId: e.target.value } : l)))}>
                  <option value="">{t('inventory.pick')}</option>
                  {tracked.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({formatQuantity(i.stockOnHand)})
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input className="input num" type="number" min="0" step="0.001" aria-label={t('inventory.col.quantity')} value={line.quantity} onChange={(e) => setLines((c) => c.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)))} />
              </td>
              <td>
                <input className="input" aria-label={t('inventory.col.batch')} value={line.batch} onChange={(e) => setLines((c) => c.map((l) => (l.key === line.key ? { ...l, batch: e.target.value } : l)))} />
              </td>
              <td>
                <button type="button" className="action-btn is-danger" aria-label={t('docflow.lines.remove')} disabled={lines.length === 1} onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}>
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button icon={<Plus size={15} />} onClick={() => setLines((c) => [...c, { key: Date.now(), itemId: '', quantity: '1', batch: '' }])}>
        {t('docflow.lines.add')}
      </Button>
    </Modal>
  );
}

function BatchesTab() {
  const { t } = useAppContent();
  const data = useAsync(() => stockApi.batches(), []);
  if (data.loading && !data.data) return <LoadingBlock />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={data.reload} />;
  return (
    <Card title={t('inventory.batch.title')} subtitle={t('inventory.batch.subtitle')}>
      {!data.data?.length ? (
        <EmptyState title={t('inventory.batch.empty')} description={t('inventory.batch.emptyBody')} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('inventory.col.item')}</th>
                <th>{t('inventory.col.batch')}</th>
                <th>{t('inventory.batch.warehouse')}</th>
                <th>{t('inventory.batch.expiry')}</th>
                <th className="align-right">{t('inventory.col.quantity')}</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((b) => (
                <tr key={`${b.itemId}-${b.warehouseId}-${b.batchNumber}`}>
                  <td>{b.itemName}</td>
                  <td className="mono">{b.batchNumber}</td>
                  <td>{b.warehouseName}</td>
                  <td>
                    {b.expiryDate ? formatDate(b.expiryDate) : '—'} {b.expired ? <Badge tone="danger">{t('inventory.batch.expired')}</Badge> : null}
                  </td>
                  <td className="align-right num">{formatQuantity(b.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function LedgerTab() {
  const { t } = useAppContent();
  const items = useAsync(() => itemsApi.list({ page_size: 200 }), []);
  const warehouses = useAsync(() => warehousesApi.list(), []);
  const [itemId, setItemId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [page, setPage] = useState(1);
  const data = useAsync(() => stockApi.movements({ itemId: itemId || undefined, warehouseId: warehouseId || undefined, page, page_size: 50 }), [itemId, warehouseId, page]);
  return (
    <Card title={t('inventory.ledger.title')} subtitle={t('inventory.ledger.subtitle')}>
      <div className="form-grid">
        <SelectField
          label={t('inventory.col.item')}
          value={itemId}
          placeholder={t('inventory.ledger.allItems')}
          options={(items.data?.items ?? []).filter((i) => i.trackInventory).map((i) => ({ value: i.id, label: i.name }))}
          onChange={(e) => {
            setItemId(e.target.value);
            setPage(1);
          }}
        />
        <SelectField
          label={t('inventory.batch.warehouse')}
          value={warehouseId}
          placeholder={t('inventory.ledger.allWarehouses')}
          options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {data.loading && !data.data ? (
        <LoadingBlock />
      ) : !data.data?.items.length ? (
        <EmptyState title={t('inventory.ledger.empty')} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('inventory.col.date')}</th>
                  <th>{t('inventory.col.item')}</th>
                  <th>{t('inventory.batch.warehouse')}</th>
                  <th>{t('inventory.ledger.description')}</th>
                  <th className="align-right">{t('inventory.ledger.in')}</th>
                  <th className="align-right">{t('inventory.ledger.out')}</th>
                  {itemId ? <th className="align-right">{t('inventory.ledger.balance')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.data.items.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDate(m.date)}</td>
                    <td>{m.itemName}</td>
                    <td>{m.warehouseName}</td>
                    <td className="small">
                      {m.description}
                      {m.batchNumber ? <span className="mono"> · {m.batchNumber}</span> : null}
                    </td>
                    <td className="align-right num text-success">{m.quantity > 0 ? formatQuantity(m.quantity) : ''}</td>
                    <td className="align-right num text-danger">{m.quantity < 0 ? formatQuantity(-m.quantity) : ''}</td>
                    {itemId ? <td className="align-right num strong">{formatQuantity(m.balance ?? 0)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={50} total={data.data.total} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

function PriceListsTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const list = useAsync(() => priceListsApi.list(), []);
  const [editing, setEditing] = useState<PriceList | 'new' | null>(null);
  const { run, errorRef } = useSubmit();
  const remove = async (pl: PriceList) => {
    const ok = await run(() => priceListsApi.remove(pl.id));
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t('inventory.priceList.deleted'));
      list.reload();
    }
  };
  return (
    <Card
      title={t('inventory.priceList.title')}
      subtitle={t('inventory.priceList.subtitle')}
      footer={
        canWrite ? (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
            {t('inventory.priceList.new')}
          </Button>
        ) : undefined
      }
    >
      {!list.data?.length ? (
        <EmptyState title={t('inventory.priceList.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('inventory.priceList.name')}</th>
                <th>{t('inventory.priceList.kind')}</th>
                <th>{t('inventory.priceList.rule')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((pl) => (
                <tr key={pl.id}>
                  <td>
                    <strong>{pl.name}</strong> {!pl.isActive ? <Badge tone="neutral">{t('inventory.warehouse.inactive')}</Badge> : null}
                  </td>
                  <td>{t(`inventory.priceList.kind.${pl.kind}`)}</td>
                  <td>{pl.method === 'markup' ? t('inventory.priceList.markupRule', { percent: pl.percentage }) : t('inventory.priceList.perItemRule', { count: pl.items.length })}</td>
                  <td className="align-right">
                    {canWrite ? (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" onClick={() => setEditing(pl)}>
                          {t('inventory.edit')}
                        </Button>
                        <button type="button" className="action-btn is-danger" aria-label={t('inventory.priceList.delete')} onClick={() => remove(pl)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <PriceListModal
          priceList={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function PriceListModal({ priceList, onClose, onSaved }: { priceList: PriceList | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, run } = useSubmit();
  const items = useAsync(() => itemsApi.list({ page_size: 200 }), []);
  const [name, setName] = useState(priceList?.name ?? '');
  const [kind, setKind] = useState<PriceList['kind']>(priceList?.kind ?? 'sales');
  const [method, setMethod] = useState<PriceList['method']>(priceList?.method ?? 'markup');
  const [percentage, setPercentage] = useState(String(priceList?.percentage ?? 0));
  const [rounding, setRounding] = useState<PriceList['rounding']>(priceList?.rounding ?? 'none');
  const [isActive, setIsActive] = useState(priceList?.isActive ?? true);
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries((priceList?.items ?? []).map((i) => [i.itemId, String(i.rate)])));
  const submit = async () => {
    const body = {
      name: name.trim(),
      kind,
      method,
      percentage: parseNumber(percentage),
      rounding,
      isActive,
      items: Object.entries(rates)
        .filter(([, v]) => v !== '')
        .map(([itemId, v]) => ({ itemId, rate: parseNumber(v) })),
    };
    const saved = await run(() => (priceList ? priceListsApi.update(priceList.id, body) : priceListsApi.create(body)));
    if (saved) {
      toast.success(t('inventory.priceList.saved', { name: saved.name }));
      onSaved();
    }
  };
  return (
    <Modal
      open
      size="lg"
      title={priceList ? priceList.name : t('inventory.priceList.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            {t('inventory.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('inventory.priceList.name')} required value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField
          label={t('inventory.priceList.kind')}
          value={kind}
          options={[
            { value: 'sales', label: t('inventory.priceList.kind.sales') },
            { value: 'purchase', label: t('inventory.priceList.kind.purchase') },
          ]}
          onChange={(e) => setKind(e.target.value as PriceList['kind'])}
        />
        <SelectField
          label={t('inventory.priceList.method')}
          value={method}
          options={[
            { value: 'markup', label: t('inventory.priceList.method.markup') },
            { value: 'per_item', label: t('inventory.priceList.method.perItem') },
          ]}
          onChange={(e) => setMethod(e.target.value as PriceList['method'])}
        />
        {method === 'markup' ? (
          <>
            <TextField label={t('inventory.priceList.percentage')} type="number" step="0.01" value={percentage} hint={t('inventory.priceList.percentageHint')} onChange={(e) => setPercentage(e.target.value)} />
            <SelectField
              label={t('inventory.priceList.rounding')}
              value={rounding}
              options={(['none', 'whole', 'nearest_10', 'x99'] as const).map((r) => ({ value: r, label: t(`inventory.priceList.rounding.${r}`) }))}
              onChange={(e) => setRounding(e.target.value as PriceList['rounding'])}
            />
          </>
        ) : null}
      </div>
      <CheckboxField label={t('inventory.warehouse.active')} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      {method === 'per_item' ? (
        <div className="table-wrap form-section">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('inventory.col.item')}</th>
                <th className="align-right">{t('inventory.priceList.standard')}</th>
                <th className="align-right">{t('inventory.priceList.listRate')}</th>
              </tr>
            </thead>
            <tbody>
              {(items.data?.items ?? []).map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="align-right">{formatCurrency(kind === 'sales' ? i.sellingPrice : i.costPrice)}</td>
                  <td className="align-right">
                    <input className="input num" style={{ maxWidth: 120 }} type="number" min="0" step="0.01" aria-label={`${i.name} ${t('inventory.priceList.listRate')}`} value={rates[i.id] ?? ''} onChange={(e) => setRates((r) => ({ ...r, [i.id]: e.target.value }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Modal>
  );
}
