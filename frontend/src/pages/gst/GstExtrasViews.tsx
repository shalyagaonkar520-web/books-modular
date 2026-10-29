/** GST filing tabs: GSTR-2B reconciliation, and the filing calendar with a late-fee calculator. */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';

import { gstApi, type LateFee, type TwoBReconciliation, type TwoBStatus } from '@/api/gst';
import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate } from '@/utils/format';
import type { Tone } from '@/utils/status';

type Range = { startDate: string; endDate: string };

const STATUS_TONE: Record<TwoBStatus, Tone> = { matched: 'success', mismatch: 'warning', twob_only: 'info', books_only: 'danger' };
const STATUS_TEXT: Record<TwoBStatus, string> = {
  matched: 'gst.twoB.status.matched',
  mismatch: 'gst.twoB.status.mismatch',
  twob_only: 'gst.twoB.status.twobOnly',
  books_only: 'gst.twoB.status.booksOnly',
};

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | boolean>>) {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Gstr2bView({ range }: { range: Range }) {
  const { t } = useAppContent();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<TwoBReconciliation | null>(null);
  const [filter, setFilter] = useState<'' | TwoBStatus>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error(t('gst.twoB.notJson'));
      }
      setResult(await gstApi.reconcile2b(parsed, range));
      setFilter('');
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const rows = result ? result.rows.filter((r) => !filter || r.status === filter) : [];
  const exportCsv = () =>
    result &&
    downloadCsv('GSTR2B_Reconciliation.csv', [
      ['Status', 'Supplier GSTIN', 'Supplier', 'Invoice', 'Date', '2B value', 'Books value', '2B taxable', 'Books taxable', '2B IGST', '2B CGST', '2B SGST', 'ITC available'],
      ...result.rows.map((r) => [
        t(STATUS_TEXT[r.status]),
        r.supplierGstin,
        r.supplierName,
        r.invoiceNumber,
        r.invoiceDate,
        r.twoBValue,
        r.bookValue,
        r.twoBTaxable,
        r.bookTaxable,
        r.twoBIgst,
        r.twoBCgst,
        r.twoBSgst,
        r.itcAvailable ? 'Yes' : 'No',
      ]),
    ]);

  return (
    <>
      <Card
        title={t('gst.twoB.title')}
        footer={
          <>
            <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button variant="primary" icon={<Upload size={15} />} disabled={busy} onClick={() => input.current?.click()}>
              {busy ? t('gst.twoB.matching') : t('gst.twoB.import')}
            </Button>
            {result ? (
              <Button variant="secondary" icon={<Download size={15} />} onClick={exportCsv}>
                {t('gst.twoB.exportCsv')}
              </Button>
            ) : null}
          </>
        }
      >
        <p className="muted">{t('gst.twoB.help')}</p>
        <FormError message={error} />
      </Card>
      {result ? (
        <>
          {result.warnings.map((w) => (
            <div key={w} className="alert alert-warning">
              {w}
            </div>
          ))}
          <div className="stat-grid">
            <StatTile label={t('gst.twoB.status.matched')} value={String(result.counts.matched)} />
            <StatTile label={t('gst.twoB.status.mismatch')} value={String(result.counts.mismatch)} />
            <StatTile label={t('gst.twoB.status.twobOnly')} value={String(result.counts.twobOnly)} />
            <StatTile label={t('gst.twoB.status.booksOnly')} value={String(result.counts.booksOnly)} />
            <StatTile label={t('gst.twoB.itcAvailable')} value={(formatCurrency(result.itcAvailable))} />
          </div>
          <Tabs
            tabs={[
              { id: '', label: t('gst.twoB.all') },
              { id: 'matched', label: t('gst.twoB.status.matched') },
              { id: 'mismatch', label: t('gst.twoB.status.mismatch') },
              { id: 'twob_only', label: t('gst.twoB.status.twobOnly') },
              { id: 'books_only', label: t('gst.twoB.status.booksOnly') },
            ]}
            active={filter}
            onChange={(id) => setFilter(id as '' | TwoBStatus)}
          />
          <Card>
            {rows.length === 0 ? (
              <EmptyState title={t('gst.twoB.empty')} />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('gst.twoB.col.status')}</th>
                      <th>{t('gst.twoB.col.supplier')}</th>
                      <th>{t('gst.twoB.col.invoice')}</th>
                      <th className="align-right">{t('gst.twoB.col.twoBValue')}</th>
                      <th className="align-right">{t('gst.twoB.col.bookValue')}</th>
                      <th className="align-right">{t('gst.twoB.col.difference')}</th>
                      <th className="align-right">{t('gst.twoB.col.itc')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.supplierGstin}-${r.invoiceNumber}-${i}`}>
                        <td>
                          <Badge tone={STATUS_TONE[r.status]}>{t(STATUS_TEXT[r.status])}</Badge>
                        </td>
                        <td>
                          {r.supplierName}
                          <div className="mono muted">{r.supplierGstin}</div>
                        </td>
                        <td>
                          {r.billId ? <Link to={`/bills/${r.billId}/edit`}>{r.invoiceNumber}</Link> : r.invoiceNumber}
                          <div className="muted">{r.invoiceDate}</div>
                        </td>
                        <td className="align-right">{r.status === 'books_only' ? '—' : formatCurrency(r.twoBValue)}</td>
                        <td className="align-right">{r.status === 'twob_only' ? '—' : formatCurrency(r.bookValue)}</td>
                        <td className="align-right">{formatCurrency(r.twoBValue - r.bookValue)}</td>
                        <td className="align-right">{r.itcAvailable ? formatCurrency(r.twoBIgst + r.twoBCgst + r.twoBSgst) : t('gst.twoB.itcNo')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}

function currentFyStart(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function FilingCalendarView() {
  const { t } = useAppContent();
  const [fy, setFy] = useState(currentFyStart);
  const [quarterly, setQuarterly] = useState(false);
  const data = useAsync(() => gstApi.filingCalendar({ fy, quarterly }), [fy, quarterly]);
  const today = todayIso();
  const years = Array.from({ length: 5 }, (_, i) => currentFyStart() - i);

  return (
    <>
      <Card title={t('gst.calendar.title')}>
        <div className="form-grid-3">
          <SelectField
            label={t('gst.calendar.year')}
            value={String(fy)}
            onChange={(e) => setFy(Number(e.target.value))}
            options={years.map((y) => ({ value: String(y), label: `${y}-${String(y + 1).slice(2)}` }))}
          />
          <CheckboxField label={t('gst.calendar.quarterly')} hint={t('gst.calendar.quarterlyHint')} checked={quarterly} onChange={(e) => setQuarterly(e.target.checked)} />
        </div>
        {data.loading ? (
          <LoadingBlock />
        ) : data.error || !data.data ? (
          <ErrorBlock message={data.error ?? ''} onRetry={data.reload} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('gst.calendar.period')}</th>
                  <th>{t('gst.calendar.gstr1Due')}</th>
                  <th>{t('gst.calendar.gstr3bDue')}</th>
                  <th className="align-right">{t('gst.calendar.activity')}</th>
                  <th>{t('gst.calendar.return')}</th>
                </tr>
              </thead>
              <tbody>
                {data.data.periods.map((p) => (
                  <tr key={p.start}>
                    <td>
                      {formatDate(p.start)} – {formatDate(p.end)}
                    </td>
                    <td className={!p.inProgress && p.gstr1Due < today ? 'muted' : ''}>{formatDate(p.gstr1Due)}</td>
                    <td className={!p.inProgress && p.gstr3bDue < today ? 'muted' : ''}>{formatDate(p.gstr3bDue)}</td>
                    <td className="align-right">
                      {t('gst.calendar.counts', { invoices: p.invoices, bills: p.bills + p.expenses, credits: p.creditNotes })}
                    </td>
                    <td>
                      {p.inProgress ? (
                        <Badge tone="info">{t('gst.calendar.inProgress')}</Badge>
                      ) : p.nil ? (
                        <Badge tone="neutral">{t('gst.calendar.nil')}</Badge>
                      ) : (
                        <Badge tone="success">{t('gst.calendar.regular')}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">{t('gst.calendar.note')}</p>
      </Card>
      <LateFeeCalculator />
    </>
  );
}

function LateFeeCalculator() {
  const { t } = useAppContent();
  const [due, setDue] = useState('');
  const [filed, setFiled] = useState(todayIso);
  const [nil, setNil] = useState(false);
  const [turnover, setTurnover] = useState('');
  const [tax, setTax] = useState('');
  const [result, setResult] = useState<LateFee | null>(null);
  const [error, setError] = useState<string | null>(null);

  const calculate = async () => {
    setError(null);
    try {
      setResult(await gstApi.lateFee({ due, filed, nil, turnover: turnover || undefined, taxPayable: tax || undefined }));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card
      title={t('gst.lateFee.title')}
      footer={
        <Button variant="primary" disabled={!due || !filed} onClick={() => void calculate()}>
          {t('gst.lateFee.calculate')}
        </Button>
      }
    >
      <p className="muted">{t('gst.lateFee.help')}</p>
      <div className="form-grid-3">
        <TextField label={t('gst.lateFee.due')} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <TextField label={t('gst.lateFee.filed')} type="date" value={filed} onChange={(e) => setFiled(e.target.value)} />
        <TextField label={t('gst.lateFee.turnover')} hint={t('gst.lateFee.turnoverHint')} type="number" min="0" value={turnover} onChange={(e) => setTurnover(e.target.value)} />
        <TextField label={t('gst.lateFee.tax')} hint={t('gst.lateFee.taxHint')} type="number" min="0" value={tax} onChange={(e) => setTax(e.target.value)} />
        <CheckboxField label={t('gst.lateFee.nil')} checked={nil} onChange={(e) => setNil(e.target.checked)} />
      </div>
      <FormError message={error} />
      {result ? (
        <div className="stat-grid">
          <StatTile label={t('gst.lateFee.daysLate')} value={String(result.daysLate)} />
          <StatTile label={t('gst.lateFee.fee', { cap: formatCurrency(result.lateFeeCap) })} value={(formatCurrency(result.lateFee))} />
          <StatTile label={t('gst.lateFee.interest')} value={(formatCurrency(result.interest))} />
          <StatTile label={t('gst.lateFee.total')} value={(formatCurrency(result.total))} />
        </div>
      ) : null}
    </Card>
  );
}
