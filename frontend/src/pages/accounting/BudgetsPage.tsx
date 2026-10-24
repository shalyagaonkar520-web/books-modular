/** Budgets: plan income and expense per account and month, then compare with actuals. */
import { useEffect, useMemo, useState } from 'react';
import { PiggyBank, Plus, Trash2 } from 'lucide-react';

import { type Budget, budgetsApi } from '@/api/advancedAccounting';
import { accountingApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, parseNumber, round2 } from '@/utils/format';

function fiscalStart(month: number): string {
  const now = new Date();
  const year = now.getMonth() + 1 >= month ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

function monthLabels(startIso: string): string[] {
  const [y, m] = startIso.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => new Date(y, m - 1 + i, 1).toLocaleString('en-IN', { month: 'short' }));
}

export function BudgetsPage() {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const budgets = useAsync(() => budgetsApi.list(), []);
  const [selected, setSelected] = useState<string>('');
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { submitting, run, errorRef } = useSubmit();

  useEffect(() => {
    if (!selected && budgets.data?.length) setSelected(budgets.data[0].id);
  }, [budgets.data, selected]);

  const current = budgets.data?.find((b) => b.id === selected) ?? null;

  const remove = async () => {
    setDeleting(false);
    if (!current) return;
    const ok = await run(() => budgetsApi.remove(current.id));
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t('budgets.deleted'));
      setSelected('');
      budgets.reload();
    }
  };

  return (
    <div className="stack">
      <PageHeader
        title={t('budgets.title')}
        subtitle={t('budgets.subtitle')}
        actions={
          canWrite ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
              {t('budgets.new')}
            </Button>
          ) : null
        }
      />
      {budgets.loading && !budgets.data ? (
        <LoadingBlock />
      ) : budgets.error ? (
        <ErrorBlock message={budgets.error} onRetry={budgets.reload} />
      ) : !budgets.data?.length ? (
        <Card>
          <EmptyState icon={<PiggyBank size={28} />} title={t('budgets.empty.title')} description={t('budgets.empty.body')} />
        </Card>
      ) : (
        <>
          <div className="row wrap">
            <SelectField label={t('budgets.pick')} value={selected} options={budgets.data.map((b) => ({ value: b.id, label: `${b.name} (${formatDate(b.startDate)})` }))} onChange={(e) => setSelected(e.target.value)} />
            {canWrite && current ? (
              <>
                <Button onClick={() => setEditing(current)}>{t('budgets.edit')}</Button>
                <Button variant="danger" icon={<Trash2 size={15} />} disabled={submitting} onClick={() => setDeleting(true)}>
                  {t('budgets.delete')}
                </Button>
              </>
            ) : null}
          </div>
          {current ? <VarianceReport budget={current} /> : null}
        </>
      )}
      {editing ? (
        <BudgetEditor
          budget={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setSelected(saved.id);
            budgets.reload();
          }}
        />
      ) : null}
      <ConfirmDialog open={deleting} title={t('docflow.confirm.title')} message={t('budgets.confirmDelete', { name: current?.name ?? '' })} busy={submitting} onCancel={() => setDeleting(false)} onConfirm={remove} />
    </div>
  );
}

function VarianceReport({ budget }: { budget: Budget }) {
  const { t } = useAppContent();
  const report = useAsync(() => budgetsApi.vsActual(budget.id), [budget.id, budget.lines.length, budget.totalIncome, budget.totalExpense]);
  if (report.loading) return <LoadingBlock />;
  if (report.error || !report.data) return <ErrorBlock message={report.error ?? ''} onRetry={report.reload} />;
  const r = report.data;
  const stat = (label: string, budgeted: number, actual: number, higherIsGood: boolean) => (
    <Card>
      <div className="text-subtle small">{label}</div>
      <strong>{formatCurrency(actual)}</strong>
      <div className={`small ${(actual >= budgeted) === higherIsGood ? 'text-success' : 'text-danger'}`}>{t('budgets.ofBudget', { amount: formatCurrency(budgeted) })}</div>
    </Card>
  );
  return (
    <>
      <div className="stat-grid">
        {stat(t('budgets.income'), r.incomeBudget, r.incomeActual, true)}
        {stat(t('budgets.expense'), r.expenseBudget, r.expenseActual, false)}
        {stat(t('budgets.profit'), r.profitBudget, r.profitActual, true)}
      </div>
      <Card title={t('budgets.vsActual')} subtitle={t('budgets.through', { date: formatDate(r.through), months: r.months.length })}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('budgets.col.account')}</th>
                <th className="align-right">{t('budgets.col.budget')}</th>
                <th className="align-right">{t('budgets.col.actual')}</th>
                <th className="align-right">{t('budgets.col.variance')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row) => (
                <tr key={row.accountId}>
                  <td>
                    <span className="code-tag">{row.code}</span> {row.name}
                  </td>
                  <td className="align-right">{formatCurrency(row.budget)}</td>
                  <td className="align-right">{formatCurrency(row.actual)}</td>
                  <td className={`align-right ${row.favourable ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(row.variance)}
                    {row.variancePercent !== null && row.variancePercent !== undefined ? ` (${row.variancePercent}%)` : ''}
                  </td>
                  <td>
                    <Badge tone={row.favourable ? 'success' : 'danger'}>{t(row.favourable ? 'budgets.favourable' : 'budgets.adverse')}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

interface EditorRow {
  accountId: string;
  amounts: string[];
}

function BudgetEditor({ budget, onClose, onSaved }: { budget: Budget | null; onClose: () => void; onSaved: (b: Budget) => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { organization } = useAuth();
  const { submitting, error, run } = useSubmit();
  const accounts = useAsync(() => accountingApi.accounts(), []);
  const plAccounts = useMemo(() => (accounts.data ?? []).filter((a) => (a.type === 'income' || a.type === 'expense') && a.isActive), [accounts.data]);
  const [name, setName] = useState(budget?.name ?? t('budgets.defaultName'));
  const [startDate, setStartDate] = useState(budget?.startDate ?? fiscalStart(organization?.fiscalYearStartMonth ?? 4));
  const [rows, setRows] = useState<EditorRow[]>(() => budget?.lines.map((l) => ({ accountId: l.accountId, amounts: l.amounts.map(String) })) ?? []);
  const [adding, setAdding] = useState('');
  const labels = monthLabels(startDate);

  const addRow = (accountId: string) => {
    if (!accountId || rows.some((r) => r.accountId === accountId)) return;
    setRows((current) => [...current, { accountId, amounts: Array(12).fill('0') }]);
    setAdding('');
  };
  const setCell = (accountId: string, index: number, value: string) =>
    setRows((current) => current.map((r) => (r.accountId === accountId ? { ...r, amounts: r.amounts.map((a, i) => (i === index ? value : a)) } : r)));
  const spread = (accountId: string) =>
    setRows((current) => current.map((r) => (r.accountId === accountId ? { ...r, amounts: Array(12).fill(r.amounts[0]) } : r)));

  const submit = async () => {
    const body = { name: name.trim(), startDate, lines: rows.map((r) => ({ accountId: r.accountId, amounts: r.amounts.map((a) => round2(parseNumber(a))) })) };
    const saved = await run(() => (budget ? budgetsApi.update(budget.id, body) : budgetsApi.create(body)));
    if (saved) {
      toast.success(t('budgets.saved', { name: saved.name }));
      onSaved(saved);
    }
  };

  return (
    <Modal
      open
      size="xl"
      title={budget ? t('budgets.editTitle', { name: budget.name }) : t('budgets.new')}
      subtitle={t('budgets.editorSubtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            {t('budgets.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('budgets.field.name')} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <TextField label={t('budgets.field.start')} type="date" value={startDate} hint={t('budgets.field.startHint')} onChange={(e) => setStartDate(e.target.value)} />
        <SelectField
          label={t('budgets.field.addAccount')}
          value={adding}
          placeholder={t('budgets.field.addAccountPlaceholder')}
          options={plAccounts.filter((a) => !rows.some((r) => r.accountId === a.id)).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
          onChange={(e) => addRow(e.target.value)}
        />
      </div>
      <div className="table-wrap form-section">
        <table className="line-items-table">
          <thead>
            <tr>
              <th>{t('budgets.col.account')}</th>
              {labels.map((label, i) => (
                <th key={`${label}-${i}`}>{label}</th>
              ))}
              <th>{t('budgets.col.total')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const account = plAccounts.find((a) => a.id === row.accountId);
              return (
                <tr key={row.accountId}>
                  <td>
                    {account ? `${account.code} ${account.name}` : row.accountId}
                    <button type="button" className="btn btn-link btn-sm" onClick={() => spread(row.accountId)}>
                      {t('budgets.copyFirst')}
                    </button>
                  </td>
                  {row.amounts.map((amount, i) => (
                    <td key={i}>
                      <input
                        className="input num"
                        style={{ minWidth: 80 }}
                        type="number"
                        step="0.01"
                        aria-label={`${account?.name ?? ''} ${labels[i]}`}
                        value={amount}
                        onChange={(e) => setCell(row.accountId, i, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="align-right num">{formatCurrency(row.amounts.reduce((s, a) => s + parseNumber(a), 0))}</td>
                  <td>
                    <button type="button" className="action-btn is-danger" aria-label={t('budgets.removeRow')} onClick={() => setRows((c) => c.filter((r) => r.accountId !== row.accountId))}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
