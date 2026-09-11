import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';

import { projectsApi } from '@/api/endpoints';
import type { Invoice, Project } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatCurrency, formatDate, formatNumber, round2, todayIso } from '@/utils/format';
import { TAX_RATES } from '@/utils/status';

const TAX_OPTIONS = TAX_RATES.map((rate) => ({ value: String(rate), label: `${rate}%` }));

interface InvoiceTimeModalProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onInvoiced: (invoice: Invoice) => void;
}

export function InvoiceTimeModal({ open, project, onClose, onInvoiced }: InvoiceTimeModalProps) {
  const formId = useId();
  const { submitting, error, fieldErrors, run, reset } = useSubmit();
  const [date, setDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(addDaysIso(todayIso(), 15));
  const [taxRate, setTaxRate] = useState('0');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const projectId = open ? project?.id : undefined;
  const entries = useAsync(
    () =>
      projectId
        ? projectsApi.timeEntries({ project_id: projectId, unbilled_only: true, page_size: 200 })
        : Promise.resolve(null),
    [projectId],
  );

  useEffect(() => {
    if (!open) return;
    reset();
    const today = todayIso();
    setDate(today);
    setDueDate(addDaysIso(today, 15));
    setTaxRate('0');
  }, [open, reset]);

  const items = useMemo(() => entries.data?.items ?? [], [entries.data]);

  useEffect(() => {
    setSelectedIds(items.map((entry) => entry.id));
  }, [items]);

  const totals = useMemo(() => {
    const rate = project?.hourlyRate ?? 0;
    const hours = round2(items.filter((entry) => selectedIds.includes(entry.id)).reduce((sum, entry) => sum + entry.hours, 0));
    const subtotal = round2(hours * rate);
    const tax = round2((subtotal * Number(taxRate)) / 100);
    return { hours, subtotal, tax, total: round2(subtotal + tax) };
  }, [items, selectedIds, project, taxRate]);

  const toggle = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((entryId) => entryId !== id) : [...current, id]));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || !selectedIds.length) return;
    const invoice = await run(() =>
      projectsApi.invoiceTime({
        projectId: project.id,
        date,
        dueDate,
        timeEntryIds: selectedIds,
        taxRate: Number(taxRate),
      }),
    );
    if (invoice) onInvoiced(invoice);
  };

  return (
    <Modal
      open={open}
      title="Invoice unbilled time"
      subtitle={project ? `${project.name} · ${formatCurrency(project.hourlyRate)} / hour` : undefined}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting} disabled={!selectedIds.length}>
            Create invoice
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid-3">
          <TextField label="Invoice date" type="date" required value={date} error={fieldErrors.date} onChange={(event) => setDate(event.target.value)} />
          <TextField label="Due date" type="date" required value={dueDate} error={fieldErrors.dueDate} onChange={(event) => setDueDate(event.target.value)} />
          <SelectField label="Tax rate" options={TAX_OPTIONS} value={taxRate} error={fieldErrors.taxRate} onChange={(event) => setTaxRate(event.target.value)} />
        </div>

        {entries.loading ? (
          <LoadingBlock label="Loading unbilled time…" />
        ) : entries.error ? (
          <ErrorBlock message={entries.error} onRetry={entries.reload} />
        ) : !items.length ? (
          <EmptyState title="No unbilled time" description="Every billable entry on this project has already been invoiced." />
        ) : (
          <>
            <div className="row-between">
              <span className="strong">Unbilled entries</span>
              <div className="row">
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(items.map((entry) => entry.id))}>
                  Select all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} disabled={!selectedIds.length}>
                  Clear
                </Button>
              </div>
            </div>
            <table className="line-items-table">
              <thead>
                <tr>
                  <th>Include</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Logged by</th>
                  <th className="align-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selectedIds.includes(entry.id)}
                        aria-label={`Include ${entry.hours} hours on ${formatDate(entry.date)}`}
                        onChange={() => toggle(entry.id)}
                      />
                    </td>
                    <td>{formatDate(entry.date)}</td>
                    <td className="text-muted">{entry.description ?? '—'}</td>
                    <td>{entry.userName}</td>
                    <td className="align-right num">{formatNumber(entry.hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals-list">
              <div>
                <span>Selected hours</span>
                <span className="num">{formatNumber(totals.hours)}</span>
              </div>
              <div>
                <span>Subtotal</span>
                <span className="num">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div>
                <span>Tax ({taxRate}%)</span>
                <span className="num">{formatCurrency(totals.tax)}</span>
              </div>
              <div className="grand">
                <span>Invoice total</span>
                <span className="num">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
