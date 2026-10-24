/** Fixed asset register: add assets, run monthly depreciation, dispose. */
import { useMemo, useState } from 'react';
import { Building, CalendarCheck, Plus, Trash2, Undo2 } from 'lucide-react';

import { type FixedAsset, fixedAssetsApi } from '@/api/advancedAccounting';
import { accountingApi, bankingApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { type Column, DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, parseNumber, todayIso } from '@/utils/format';

const TONE: Record<FixedAsset['status'], 'success' | 'neutral' | 'warning'> = { active: 'success', fully_depreciated: 'warning', disposed: 'neutral' };

export function FixedAssetsPage() {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const list = useAsync(() => fixedAssetsApi.list(), []);
  const [adding, setAdding] = useState(false);
  const [disposing, setDisposing] = useState<FixedAsset | null>(null);
  const [deleting, setDeleting] = useState<FixedAsset | null>(null);
  const { submitting, run, errorRef } = useSubmit();

  const act = async (label: string, action: () => Promise<unknown>) => {
    const ok = await run(action);
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(label);
      list.reload();
    }
  };

  const runDepreciation = async () => {
    const result = await run(() => fixedAssetsApi.runDepreciation());
    if (!result) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t('assets.ran', { count: result.posted, amount: formatCurrency(result.amount) }));
      list.reload();
    }
  };

  const rows = useMemo(() => list.data ?? [], [list.data]);
  const totals = useMemo(
    () => rows.filter((a) => a.status !== 'disposed').reduce((acc, a) => ({ cost: acc.cost + a.cost, book: acc.book + a.bookValue }), { cost: 0, book: 0 }),
    [rows],
  );

  const columns: Array<Column<FixedAsset>> = [
    { key: 'number', header: t('assets.col.number'), render: (a) => <strong>{a.assetNumber}</strong> },
    { key: 'name', header: t('assets.col.name'), render: (a) => (a.category ? `${a.name} · ${a.category}` : a.name) },
    { key: 'purchase', header: t('assets.col.purchased'), render: (a) => formatDate(a.purchaseDate) },
    { key: 'method', header: t('assets.col.method'), render: (a) => (a.method === 'declining' ? t('assets.method.decliningShort', { rate: a.rate }) : t('assets.method.slShort', { months: a.usefulLifeMonths })) },
    { key: 'cost', header: t('assets.col.cost'), align: 'right', render: (a) => formatCurrency(a.cost) },
    { key: 'acc', header: t('assets.col.accumulated'), align: 'right', render: (a) => formatCurrency(a.accumulatedDepreciation) },
    { key: 'book', header: t('assets.col.book'), align: 'right', render: (a) => <strong>{formatCurrency(a.bookValue)}</strong> },
    { key: 'monthly', header: t('assets.col.monthly'), align: 'right', render: (a) => formatCurrency(a.monthlyDepreciation) },
    { key: 'status', header: t('docflow.col.status'), render: (a) => <Badge tone={TONE[a.status]}>{t(`assets.status.${a.status}`)}</Badge> },
  ];
  if (canWrite) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) => (
        <ActionMenu
          iconOnly
          label={t('assets.actions')}
          items={[
            { key: 'dispose', label: t('assets.action.dispose'), disabled: a.status === 'disposed', onSelect: () => setDisposing(a) },
            { key: 'undo-disposal', label: t('assets.action.undoDisposal'), icon: <Undo2 size={14} />, disabled: a.status !== 'disposed', onSelect: () => act(t('assets.undone'), () => fixedAssetsApi.undoDisposal(a.id)) },
            { key: 'undo-dep', label: t('assets.action.undoDepreciation'), icon: <Undo2 size={14} />, disabled: a.accumulatedDepreciation <= 0 || a.status === 'disposed', onSelect: () => act(t('assets.undone'), () => fixedAssetsApi.undoDepreciation(a.id)) },
            { key: 'delete', label: t('assets.action.delete'), icon: <Trash2 size={14} />, danger: true, disabled: a.accumulatedDepreciation > 0 || a.status === 'disposed', onSelect: () => setDeleting(a) },
          ]}
        />
      ),
    });
  }

  return (
    <>
      <PageHeader
        title={t('assets.title')}
        subtitle={t('assets.subtitle')}
        actions={
          canWrite ? (
            <div className="row">
              <Button icon={<CalendarCheck size={15} />} loading={submitting} onClick={runDepreciation}>
                {t('assets.runDepreciation')}
              </Button>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
                {t('assets.new')}
              </Button>
            </div>
          ) : null
        }
      />
      <div className="stat-grid">
        <Card>
          <div className="text-subtle small">{t('assets.totalCost')}</div>
          <strong>{formatCurrency(totals.cost)}</strong>
        </Card>
        <Card>
          <div className="text-subtle small">{t('assets.totalBook')}</div>
          <strong>{formatCurrency(totals.book)}</strong>
        </Card>
      </div>
      <Card>
        {list.error ? (
          <ErrorBlock message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <SkeletonRows rows={4} columns={columns.length} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Building size={28} />} title={t('assets.empty.title')} description={t('assets.empty.body')} />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(a) => a.id} caption={t('assets.title')} />
        )}
      </Card>
      {adding ? (
        <AssetModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      ) : null}
      {disposing ? (
        <DisposeModal
          asset={disposing}
          onClose={() => setDisposing(null)}
          onSaved={() => {
            setDisposing(null);
            list.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t('docflow.confirm.title')}
        message={t('assets.confirmDelete', { name: deleting?.name ?? '' })}
        busy={submitting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void act(t('assets.deleted'), () => fixedAssetsApi.remove(target.id));
        }}
      />
    </>
  );
}

function AssetModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const accounts = useAsync(() => accountingApi.accounts(), []);
  const assetAccounts = (accounts.data ?? []).filter((a) => a.type === 'asset' && a.isActive && !['bank', 'cash', 'accounts_receivable', 'tax', 'inventory'].includes(a.subtype ?? ''));
  const [form, setForm] = useState({
    name: '',
    category: '',
    assetAccountId: '',
    purchaseDate: todayIso(),
    depreciationStart: '',
    cost: '',
    salvageValue: '0',
    method: 'straight_line',
    usefulLifeMonths: '60',
    rate: '15',
    postOpeningBalance: false,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    const saved = await run(() =>
      fixedAssetsApi.create({
        name: form.name.trim(),
        category: form.category.trim() || null,
        assetAccountId: form.assetAccountId || null,
        purchaseDate: form.purchaseDate,
        depreciationStart: form.depreciationStart || null,
        cost: parseNumber(form.cost),
        salvageValue: parseNumber(form.salvageValue),
        method: form.method,
        usefulLifeMonths: Number(form.usefulLifeMonths) || 60,
        rate: form.method === 'declining' ? parseNumber(form.rate) : 0,
        postOpeningBalance: form.postOpeningBalance,
      }),
    );
    if (saved) {
      toast.success(t('assets.created', { number: saved.assetNumber }));
      onSaved();
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={t('assets.new')}
      subtitle={t('assets.newSubtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            {t('assets.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('assets.field.name')} required value={form.name} error={fieldErrors.name} onChange={(e) => set('name', e.target.value)} />
        <TextField label={t('assets.field.category')} value={form.category} placeholder={t('assets.field.categoryPlaceholder')} onChange={(e) => set('category', e.target.value)} />
        <SelectField
          label={t('assets.field.account')}
          value={form.assetAccountId}
          placeholder={t('assets.field.accountDefault')}
          options={assetAccounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
          onChange={(e) => set('assetAccountId', e.target.value)}
        />
        <TextField label={t('assets.field.cost')} type="number" min="0" step="0.01" prefix="₹" required value={form.cost} error={fieldErrors.cost} onChange={(e) => set('cost', e.target.value)} />
        <TextField label={t('assets.field.purchaseDate')} type="date" required value={form.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} />
        <TextField label={t('assets.field.depreciationStart')} type="date" value={form.depreciationStart} min={form.purchaseDate} hint={t('assets.field.depreciationStartHint')} onChange={(e) => set('depreciationStart', e.target.value)} />
        <SelectField
          label={t('assets.field.method')}
          value={form.method}
          options={[
            { value: 'straight_line', label: t('assets.method.sl') },
            { value: 'declining', label: t('assets.method.declining') },
          ]}
          onChange={(e) => set('method', e.target.value)}
        />
        {form.method === 'declining' ? (
          <TextField label={t('assets.field.rate')} type="number" min="0" max="100" step="0.01" value={form.rate} onChange={(e) => set('rate', e.target.value)} />
        ) : (
          <TextField label={t('assets.field.life')} type="number" min="1" max="600" value={form.usefulLifeMonths} onChange={(e) => set('usefulLifeMonths', e.target.value)} />
        )}
        <TextField label={t('assets.field.salvage')} type="number" min="0" step="0.01" prefix="₹" value={form.salvageValue} error={fieldErrors.salvageValue} onChange={(e) => set('salvageValue', e.target.value)} />
      </div>
      <CheckboxField label={t('assets.field.opening')} hint={t('assets.field.openingHint')} checked={form.postOpeningBalance} onChange={(e) => set('postOpeningBalance', e.target.checked)} />
    </Modal>
  );
}

function DisposeModal({ asset, onClose, onSaved }: { asset: FixedAsset; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, run } = useSubmit();
  const accounts = useAsync(() => bankingApi.accountOptions(), []);
  const [date, setDate] = useState(todayIso());
  const [proceeds, setProceeds] = useState('0');
  const [bankAccountId, setBankAccountId] = useState('');

  const submit = async () => {
    const saved = await run(() => fixedAssetsApi.dispose(asset.id, { date, proceeds: parseNumber(proceeds), bankAccountId: bankAccountId || null }));
    if (saved) {
      toast.success(t('assets.disposed', { number: asset.assetNumber }));
      onSaved();
    }
  };

  return (
    <Modal
      open
      title={t('assets.disposeTitle', { name: asset.name })}
      subtitle={t('assets.disposeSubtitle', { book: formatCurrency(asset.bookValue) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" loading={submitting} onClick={submit}>
            {t('assets.action.dispose')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('assets.field.disposalDate')} type="date" value={date} min={asset.purchaseDate} onChange={(e) => setDate(e.target.value)} />
        <TextField label={t('assets.field.proceeds')} type="number" min="0" step="0.01" prefix="₹" value={proceeds} hint={t('assets.field.proceedsHint')} onChange={(e) => setProceeds(e.target.value)} />
        <SelectField
          label={t('assets.field.depositTo')}
          value={bankAccountId}
          placeholder={t('assets.field.depositToPlaceholder')}
          disabled={parseNumber(proceeds) <= 0}
          options={(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
          onChange={(e) => setBankAccountId(e.target.value)}
        />
      </div>
    </Modal>
  );
}
