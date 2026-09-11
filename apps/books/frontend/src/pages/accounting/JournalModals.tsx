import { useEffect, useId, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { accountingApi } from '@/api/endpoints';
import type { Account, JournalEntry } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, parseNumber, round2, titleCase, todayIso } from '@/utils/format';

interface JournalDetailModalProps {
  entry: JournalEntry | null;
  onClose: () => void;
}

export function JournalDetailModal({ entry, onClose }: JournalDetailModalProps) {
  const totalDebit = entry ? round2(entry.lines.reduce((sum, line) => sum + line.debit, 0)) : 0;
  const totalCredit = entry ? round2(entry.lines.reduce((sum, line) => sum + line.credit, 0)) : 0;

  return (
    <Modal
      open={!!entry}
      title={entry ? `Journal ${entry.entryNumber}` : 'Journal entry'}
      subtitle={entry ? `${formatDate(entry.date)} · ${titleCase(entry.sourceType)}` : undefined}
      size="lg"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {entry ? (
        <div className="stack">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Date</span>
              <span className="detail-value">{formatDate(entry.date)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Reference</span>
              <span className="detail-value">{entry.reference ?? '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Source</span>
              <span className="detail-value">{titleCase(entry.sourceType)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Reversal</span>
              <span className="detail-value">{entry.isReversal ? 'Yes' : 'No'}</span>
            </div>
          </div>
          {entry.notes ? <p className="text-muted">{entry.notes}</p> : null}
          <table className="line-items-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Description</th>
                <th className="align-right">Debit</th>
                <th className="align-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <div className="cell-stack">
                      <span>{line.accountName}</span>
                      <small>{line.accountCode}</small>
                    </div>
                  </td>
                  <td className="text-muted">{line.description ?? '—'}</td>
                  <td className="align-right num">{line.debit ? formatCurrency(line.debit) : '—'}</td>
                  <td className="align-right num">{line.credit ? formatCurrency(line.credit) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong" colSpan={2}>
                  Totals
                </td>
                <td className="align-right num strong">{formatCurrency(totalDebit)}</td>
                <td className="align-right num strong">{formatCurrency(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
          <Badge tone={totalDebit === totalCredit ? 'success' : 'danger'}>{totalDebit === totalCredit ? 'Balanced' : 'Out of balance'}</Badge>
        </div>
      ) : null}
    </Modal>
  );
}

interface EditorLine {
  key: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

let nextLineKey = 1;
const blankLine = (): EditorLine => ({ key: `line-${nextLineKey++}`, accountId: '', description: '', debit: '', credit: '' });

interface NewJournalModalProps {
  open: boolean;
  accounts: Account[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function NewJournalModal({ open, accounts, onClose, onSaved }: NewJournalModalProps) {
  const formId = useId();
  const { submitting, error, fieldErrors, run, reset } = useSubmit();
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([]);

  useEffect(() => {
    if (!open) return;
    reset();
    setDate(todayIso());
    setReference('');
    setNotes('');
    setLines([blankLine(), blankLine()]);
  }, [open, reset]);

  const updateLine = (key: string, patch: Partial<EditorLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const totalDebit = round2(lines.reduce((sum, line) => sum + parseNumber(line.debit), 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + parseNumber(line.credit), 0));
  const difference = round2(totalDebit - totalCredit);
  const filled = lines.filter((line) => line.accountId && (parseNumber(line.debit) > 0 || parseNumber(line.credit) > 0));
  const balanced = difference === 0 && totalDebit > 0;
  const canSubmit = balanced && filled.length >= 2;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const saved = await run(() =>
      accountingApi.createJournal({
        date,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        lines: filled.map((line) => ({
          accountId: line.accountId,
          description: line.description.trim() || null,
          debit: parseNumber(line.debit),
          credit: parseNumber(line.credit),
        })),
      }),
    );
    if (saved) onSaved(`Journal ${saved.entryNumber} posted.`);
  };

  return (
    <Modal
      open={open}
      title="New journal entry"
      subtitle="Debits and credits must balance before the entry can be posted."
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting} disabled={!canSubmit}>
            Post entry
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid-3">
          <TextField label="Date" type="date" required value={date} error={fieldErrors.date} onChange={(event) => setDate(event.target.value)} />
          <TextField label="Reference" value={reference} error={fieldErrors.reference} onChange={(event) => setReference(event.target.value)} />
        </div>

        <table className="line-items-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Description</th>
              <th className="align-right">Debit</th>
              <th className="align-right">Credit</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td>
                  <select
                    className="select"
                    value={line.accountId}
                    aria-label="Account"
                    onChange={(event) => updateLine(line.key, { accountId: event.target.value })}
                  >
                    <option value="">Select an account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="input"
                    value={line.description}
                    aria-label="Line description"
                    onChange={(event) => updateLine(line.key, { description: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input align-right"
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.debit}
                    aria-label="Debit"
                    onChange={(event) => updateLine(line.key, { debit: event.target.value, credit: '' })}
                  />
                </td>
                <td>
                  <input
                    className="input align-right"
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.credit}
                    aria-label="Credit"
                    onChange={(event) => updateLine(line.key, { credit: event.target.value, debit: '' })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="action-btn is-danger"
                    aria-label="Remove line"
                    disabled={lines.length <= 2}
                    onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row-between">
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setLines((current) => [...current, blankLine()])}>
            Add line
          </Button>
          <div className="totals-list">
            <div>
              <span>Total debit</span>
              <span className="num">{formatCurrency(totalDebit)}</span>
            </div>
            <div>
              <span>Total credit</span>
              <span className="num">{formatCurrency(totalCredit)}</span>
            </div>
            <div className="grand">
              <span>Difference</span>
              <span className={`num ${difference === 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(difference)}</span>
            </div>
          </div>
        </div>

        {canSubmit ? (
          <Badge tone="success">Balanced — ready to post</Badge>
        ) : (
          <Badge tone="warning">
            {filled.length < 2 ? 'Add at least two lines with an account and an amount' : 'Debits and credits must match before posting'}
          </Badge>
        )}

        <TextAreaField label="Notes" rows={2} value={notes} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />
      </form>
    </Modal>
  );
}
