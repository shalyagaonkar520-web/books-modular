/** GST filing: GSTR-1 and GSTR-3B for a return period, GSTR-2B reconciliation, the filing calendar and the TDS / TCS register. */
import { useMemo, useState } from 'react';
import { Download, FileJson, FileSpreadsheet } from 'lucide-react';

import { gstApi, type Gstr1Summary, type Gstr3b, type TaxHeads } from '@/api/gst';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useDownload } from '@/hooks/useDownload';
import { formatCurrency, formatDate } from '@/utils/format';

import { FilingCalendarView, Gstr2bView } from './GstExtrasViews';

type Tab = 'gstr1' | 'gstr3b' | 'gstr2b' | 'calendar' | 'tds';

/** First and last day of the previous month: the usual return period. */
function lastMonth(): { start: string; end: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(first), end: iso(last) };
}

export function GstFilingPage() {
  const { t } = useAppContent();
  const initial = useMemo(lastMonth, []);
  const [tab, setTab] = useState<Tab>('gstr1');
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const range = { startDate, endDate };

  return (
    <div className="stack">
      <PageHeader title={t('gst.title')} subtitle={t('gst.subtitle')} />
      <Tabs
        tabs={[
          { id: 'gstr1', label: t('gst.tab.gstr1') },
          { id: 'gstr3b', label: t('gst.tab.gstr3b') },
          { id: 'gstr2b', label: t('gst.tab.gstr2b') },
          { id: 'calendar', label: t('gst.tab.calendar') },
          { id: 'tds', label: t('gst.tab.tds') },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />
      {tab === 'calendar' ? null : (
        <div className="form-grid-3">
          <TextField label={t('reports.range.from')} type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} />
          <TextField label={t('reports.range.to')} type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      )}
      {tab === 'gstr1' ? (
        <Gstr1View range={range} />
      ) : tab === 'gstr3b' ? (
        <Gstr3bView range={range} />
      ) : tab === 'gstr2b' ? (
        <Gstr2bView range={range} />
      ) : tab === 'calendar' ? (
        <FilingCalendarView />
      ) : (
        <TdsView range={range} />
      )}
    </div>
  );
}

type Range = { startDate: string; endDate: string };

type SectionKey = keyof Gstr1Summary['summary'];

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'b2b', label: 'gst.gstr1.b2b' },
  { key: 'b2cl', label: 'gst.gstr1.b2cl' },
  { key: 'b2cs', label: 'gst.gstr1.b2cs' },
  { key: 'exp', label: 'gst.gstr1.exp' },
  { key: 'cdnr', label: 'gst.gstr1.cdnr' },
  { key: 'cdnur', label: 'gst.gstr1.cdnur' },
  { key: 'b2cs_credit', label: 'gst.gstr1.b2csCredit' },
];

function Gstr1View({ range }: { range: Range }) {
  const { t } = useAppContent();
  const { download, downloading } = useDownload();
  const data = useAsync(() => gstApi.gstr1(range), [range.startDate, range.endDate]);
  if (data.loading) return <LoadingBlock />;
  if (data.error || !data.data) return <ErrorBlock message={data.error ?? ''} onRetry={data.reload} />;
  const d = data.data;
  const hsn = [...d.json.hsn.hsn_b2b.map((r) => ({ ...r, table: 'B2B' })), ...d.json.hsn.hsn_b2c.map((r) => ({ ...r, table: 'B2C' }))];

  return (
    <>
      {d.warnings.map((w) => (
        <div key={w} className="alert alert-warning">
          {w}
        </div>
      ))}
      <Card
        title={t('gst.gstr1.title')}
        subtitle={t('gst.gstr1.subtitle', { from: formatDate(d.period.start), to: formatDate(d.period.end) })}
        footer={
          <div className="row wrap">
            <Button variant="primary" icon={<FileJson size={15} />} disabled={downloading} onClick={() => void download(() => gstApi.downloadGstr1(range, 'json'))}>
              {t('gst.downloadJson')}
            </Button>
            <Button icon={<FileSpreadsheet size={15} />} disabled={downloading} onClick={() => void download(() => gstApi.downloadGstr1(range, 'xlsx'))}>
              {t('gst.downloadExcel')}
            </Button>
          </div>
        }
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('gst.col.section')}</th>
                <th className="align-right">{t('gst.col.documents')}</th>
                <th className="align-right">{t('gst.col.taxable')}</th>
                <th className="align-right">IGST</th>
                <th className="align-right">CGST</th>
                <th className="align-right">SGST</th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map(({ key, label }) => {
                const row = d.summary[key];
                return (
                  <tr key={key}>
                    <td>{t(label)}</td>
                    <td className="align-right">{row.count}</td>
                    <td className="align-right">{formatCurrency(row.taxable)}</td>
                    <td className="align-right">{formatCurrency(row.igst)}</td>
                    <td className="align-right">{formatCurrency(row.cgst)}</td>
                    <td className="align-right">{formatCurrency(row.sgst)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={t('gst.hsn.title')}>
        {hsn.length === 0 ? (
          <EmptyState title={t('gst.hsn.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('gst.hsn.table')}</th>
                  <th>HSN/SAC</th>
                  <th>UQC</th>
                  <th className="align-right">{t('gst.hsn.qty')}</th>
                  <th className="align-right">{t('gst.hsn.rate')}</th>
                  <th className="align-right">{t('gst.col.taxable')}</th>
                  <th className="align-right">IGST</th>
                  <th className="align-right">CGST</th>
                  <th className="align-right">SGST</th>
                </tr>
              </thead>
              <tbody>
                {hsn.map((r) => (
                  <tr key={`${r.table}-${r.hsn_sc}-${r.uqc}-${r.rt}`}>
                    <td>{r.table}</td>
                    <td className="mono">{r.hsn_sc}</td>
                    <td>{r.uqc}</td>
                    <td className="align-right">{r.qty}</td>
                    <td className="align-right">{r.rt}%</td>
                    <td className="align-right">{formatCurrency(r.txval)}</td>
                    <td className="align-right">{formatCurrency(r.iamt)}</td>
                    <td className="align-right">{formatCurrency(r.camt)}</td>
                    <td className="align-right">{formatCurrency(r.samt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function HeadsRow({ label, heads, showTaxable = true }: { label: string; heads: TaxHeads; showTaxable?: boolean }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="align-right">{showTaxable && heads.taxable !== undefined ? formatCurrency(heads.taxable) : '—'}</td>
      <td className="align-right">{formatCurrency(heads.igst)}</td>
      <td className="align-right">{formatCurrency(heads.cgst)}</td>
      <td className="align-right">{formatCurrency(heads.sgst)}</td>
    </tr>
  );
}

function HeadsTable({ title, rows }: { title: string; rows: Array<{ label: string; heads: TaxHeads }> }) {
  const { t } = useAppContent();
  return (
    <Card title={title}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('gst.col.nature')}</th>
              <th className="align-right">{t('gst.col.taxable')}</th>
              <th className="align-right">IGST</th>
              <th className="align-right">CGST</th>
              <th className="align-right">SGST</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <HeadsRow key={row.label} label={row.label} heads={row.heads} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Gstr3bView({ range }: { range: Range }) {
  const { t } = useAppContent();
  const { download, downloading } = useDownload();
  const data = useAsync(() => gstApi.gstr3b(range), [range.startDate, range.endDate]);
  if (data.loading) return <LoadingBlock />;
  if (data.error || !data.data) return <ErrorBlock message={data.error ?? ''} onRetry={data.reload} />;
  const d: Gstr3b = data.data;
  const cash = d.payment.cashPayable;
  const totalCash = cash.igst + cash.cgst + cash.sgst + d.payment.reverseChargeCash.igst + d.payment.reverseChargeCash.cgst + d.payment.reverseChargeCash.sgst;

  return (
    <>
      <div className="stat-grid">
        <Card>
          <div className="text-subtle small">{t('gst.gstr3b.netItc')}</div>
          <strong>{formatCurrency(d.itc.net.igst + d.itc.net.cgst + d.itc.net.sgst)}</strong>
        </Card>
        <Card>
          <div className="text-subtle small">{t('gst.gstr3b.cashPayable')}</div>
          <strong className={totalCash > 0 ? 'text-danger' : 'text-success'}>{formatCurrency(totalCash)}</strong>
        </Card>
      </div>
      <HeadsTable
        title={t('gst.gstr3b.outward')}
        rows={[
          { label: t('gst.gstr3b.a'), heads: d.outward.taxable },
          { label: t('gst.gstr3b.b'), heads: d.outward.zeroRated },
          { label: t('gst.gstr3b.c'), heads: d.outward.nilExempt },
          { label: t('gst.gstr3b.d'), heads: d.outward.inwardReverseCharge },
        ]}
      />
      <HeadsTable
        title={t('gst.gstr3b.itc')}
        rows={[
          { label: t('gst.gstr3b.itcRcm'), heads: d.itc.reverseCharge },
          { label: t('gst.gstr3b.itcOther'), heads: d.itc.allOther },
          { label: t('gst.gstr3b.itcReversed'), heads: d.itc.reversed },
          { label: t('gst.gstr3b.itcNet'), heads: d.itc.net },
        ]}
      />
      <Card
        title={t('gst.gstr3b.payment')}
        subtitle={t('gst.gstr3b.paymentHint')}
        footer={
          <Button icon={<Download size={15} />} disabled={downloading} onClick={() => void download(() => gstApi.downloadGstr3b(range))}>
            {t('gst.downloadJson')}
          </Button>
        }
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th />
                <th className="align-right" />
                <th className="align-right">IGST</th>
                <th className="align-right">CGST</th>
                <th className="align-right">SGST</th>
              </tr>
            </thead>
            <tbody>
              <HeadsRow label={t('gst.gstr3b.creditUsed')} heads={d.payment.creditUsed} showTaxable={false} />
              <HeadsRow label={t('gst.gstr3b.cash')} heads={d.payment.cashPayable} showTaxable={false} />
              <HeadsRow label={t('gst.gstr3b.rcmCash')} heads={d.payment.reverseChargeCash} showTaxable={false} />
              <HeadsRow label={t('gst.gstr3b.carried')} heads={d.payment.creditCarriedForward} showTaxable={false} />
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function TdsView({ range }: { range: Range }) {
  const { t } = useAppContent();
  const { download, downloading } = useDownload();
  const data = useAsync(() => gstApi.tdsRegister(range), [range.startDate, range.endDate]);
  if (data.loading) return <LoadingBlock />;
  if (data.error || !data.data) return <ErrorBlock message={data.error ?? ''} onRetry={data.reload} />;
  const d = data.data;
  return (
    <>
      {d.missingPan.length ? <div className="alert alert-warning">{t('gst.tds.missingPan', { names: d.missingPan.join(', ') })}</div> : null}
      <Card
        title={t('gst.tds.title', { amount: formatCurrency(d.tdsTotal) })}
        footer={
          <Button icon={<FileSpreadsheet size={15} />} disabled={downloading} onClick={() => void download(() => gstApi.downloadTds(range))}>
            {t('gst.downloadExcel')}
          </Button>
        }
      >
        {d.tds.length === 0 ? (
          <EmptyState title={t('gst.tds.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('docflow.col.date')}</th>
                  <th>{t('gst.tds.bill')}</th>
                  <th>{t('docflow.form.vendor')}</th>
                  <th>PAN</th>
                  <th>{t('gst.tds.section')}</th>
                  <th className="align-right">{t('gst.col.taxable')}</th>
                  <th className="align-right">TDS</th>
                </tr>
              </thead>
              <tbody>
                {d.tds.map((r) => (
                  <tr key={r.billId}>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.billNumber}</td>
                    <td>{r.vendorName}</td>
                    <td className="mono">{r.vendorPan ?? '—'}</td>
                    <td>
                      {r.section} ({r.rate}%)
                    </td>
                    <td className="align-right">{formatCurrency(r.taxable)}</td>
                    <td className="align-right">{formatCurrency(r.tds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title={t('gst.tcs.title', { amount: formatCurrency(d.tcsTotal) })}>
        {d.tcs.length === 0 ? (
          <EmptyState title={t('gst.tcs.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('docflow.col.date')}</th>
                  <th>{t('docflow.col.invoice')}</th>
                  <th>{t('docflow.form.customer')}</th>
                  <th>PAN</th>
                  <th className="align-right">{t('gst.hsn.rate')}</th>
                  <th className="align-right">TCS</th>
                </tr>
              </thead>
              <tbody>
                {d.tcs.map((r) => (
                  <tr key={r.invoiceId}>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.invoiceNumber}</td>
                    <td>{r.customerName}</td>
                    <td className="mono">{r.customerPan ?? '—'}</td>
                    <td className="align-right">{r.rate}%</td>
                    <td className="align-right">{formatCurrency(r.tcs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
