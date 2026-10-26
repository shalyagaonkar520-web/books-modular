/** Create or edit a recurring journal: balanced debit / credit lines posted on a schedule. */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { type Frequency, recurringApi, type RecurringProfile } from '@/api/docFlow';
import { accountingApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, parseNumber, round2, todayIso } from '@/utils/format';

interface JournalLineDraft {
  key: number;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

let counter = 0;
const blank = (): JournalLineDraft => ({ key: ++counter, accountId: '', description: '', debit: '', credit: '' });
const FREQUENCIES: Frequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

interface StoredLine {
  accountId: string;
  description?: string | null;
  debit?: number;
  credit?: number;
}

export function RecurringJournalModal({ profile, onClose, onSaved }: { profile: RecurringProfile | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, run, setError } = useSubmit();
  const accounts = useAsync(() => accountingApi.accounts(), []);
  const options = useMemo(
    () => (accounts.data ?? []).filter((a) => a.isActive && !['bank', 'cash', 'credit_card'].includes(a.subtype ?? '')).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })),
    [accounts.data],
  );
  const stored = (profile?.template.lines ?? []) as unknown as StoredLine[];
  const [name, setName] = useState(profile?.name ?? '');
  const [frequency, setFrequency] = useState<Frequency>(profile?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(profile?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(profile?.endDate ?? '');
  const [reference, setReference] = useState(profile?.template.reference ?? '');
  const [lines, setLines] = useState<JournalLineDraft[]>(() =>
    stored.length
      ? stored.map((l) => ({ key: ++counter, accountId: l.accountId, description: l.description ?? '', debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '' }))
      : [blank(), blank()],
  );
  const debit = round2(lines.reduce((s, l) => s + parseNumber(l.debit), 0));
  const credit = round2(lines.reduce((s, l) => s + parseNumber(l.credit), 0));
  const update = (key: number, patch: Partial<JournalLineDraft>) => setLines((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async () => {
    const filled = lines.filter((l) => l.accountId && (parseNumber(l.debit) > 0 || parseNumber(l.credit) > 0));
    if (filled.length < 2) {
      setError(t('recurring.journal.needLines'));
      return;
    }
    if (debit !== credit) {
      setError(t('recurring.journal.unbalanced', { debit: formatCurrency(debit), credit: formatCurrency(credit) }));
      return;
    }
    const body = {
      name: name.trim() || t('recurring.untitled'),
      kind: 'journal',
      frequency,
      intervalCount: 1,
      startDate,
      endDate: endDate || null,
      autoIssue: true,
      template: {
        reference: reference.trim() || null,
        lines: filled.map((l) => ({ accountId: l.accountId, description: l.description.trim() || null, debit: round2(parseNumber(l.debit)), credit: round2(parseNumber(l.credit)) })),
      },
    };
    const saved = await run(() => (profile ? recurringApi.update(profile.id, body) : recurringApi.create(body)));
    if (saved) {
      toast.success(t(profile ? 'recurring.updated' : 'recurring.created', { name: saved.name }));
      onSaved();
    }
  };

  return (
    <Modal
      open
      size="xl"
      title={profile ? t('recurring.editTitle', { name: profile.name }) : t('recurringJournals.new')}
      subtitle={t('recurring.journal.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} disabled={profile?.status === 'stopped'} onClick={submit}>
            {t('recurring.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('recurring.field.name')} required value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <SelectField label={t('recurring.field.frequency')} value={frequency} options={FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.frequency.${f}`) }))} onChange={(e) => setFrequency(e.target.value as Frequency)} />
        <TextField label={t('recurring.field.start')} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <TextField label={t('recurring.field.end')} type="date" value={endDate} min={startDate} hint={t('recurring.field.endHint')} onChange={(e) => setEndDate(e.target.value)} />
        <TextField label={t('docflow.form.reference')} value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div className="table-wrap form-section">
        <table className="line-items-table">
          <thead>
            <tr>
              <th>{t('recurring.journal.account')}</th>
              <th>{t('docflow.lines.description')}</th>
              <th>{t('recurring.journal.debit')}</th>
              <th>{t('recurring.journal.credit')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={line.key}>
                <td>
                  <select className="select" aria-label={t('recurring.journal.accountAria', { n: i + 1 })} value={line.accountId} onChange={(e) => update(line.key, { accountId: e.target.value })}>
                    <option value="">{t('recurring.journal.pickAccount')}</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="input" aria-label={t('docflow.lines.descriptionAria', { n: i + 1 })} value={line.description} onChange={(e) => update(line.key, { description: e.target.value })} />
                </td>
                <td>
                  <input className="input num" type="number" min="0" step="0.01" aria-label={t('recurring.journal.debit')} value={line.debit} onChange={(e) => update(line.key, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} />
                </td>
                <td>
                  <input className="input num" type="number" min="0" step="0.01" aria-label={t('recurring.journal.credit')} value={line.credit} onChange={(e) => update(line.key, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} />
                </td>
                <td>
                  <button type="button" className="action-btn is-danger" aria-label={t('docflow.lines.removeAria', { n: i + 1 })} disabled={lines.length <= 2} onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="align-right strong">
                {t('recurring.journal.totals')}
              </td>
              <td className={`num strong ${debit === credit ? '' : 'text-danger'}`}>{formatCurrency(debit)}</td>
              <td className={`num strong ${debit === credit ? '' : 'text-danger'}`}>{formatCurrency(credit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <Button icon={<Plus size={15} />} onClick={() => setLines((c) => [...c, blank()])}>
        {t('docflow.lines.add')}
      </Button>
    </Modal>
  );
}
