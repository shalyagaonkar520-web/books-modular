/** AI assistant: ask questions about the books, scan a bill into a draft, and the cash-flow forecast. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ScanLine, Send, Sparkles } from 'lucide-react';

import { aiApi, type ExtractedDocument } from '@/api/ai';
import { billsApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ComingSoon } from '@/components/ui/ComingSoon';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, todayIso } from '@/utils/format';
import { WhatIfCard } from '@/pages/insights/WhatIfCard';

type Tab = 'ask' | 'scan' | 'forecast';

export function AiAssistantPage() {
  const { t } = useAppContent();
  const { can } = useAuth();
  const status = useAsync(() => aiApi.status(), []);
  const [tab, setTab] = useState<Tab>('ask');
  const tabs: Tab[] = can('admin', 'viewer') ? ['ask', 'scan', 'forecast'] : ['ask', 'scan'];
  // No AI key on the server yet: the AI tabs say "Coming soon"; the forecast needs no AI.
  const aiOff = status.data ? !status.data.configured : false;
  return (
    <div className="stack">
      <PageHeader title={t('ai.title')} subtitle={t('ai.subtitle')} />
      <Tabs tabs={tabs.map((id) => ({ id, label: t(`ai.tab.${id}`) }))} active={tab} onChange={(id) => setTab(id as Tab)} />
      {tab === 'ask' ? aiOff ? <ComingSoon title={t('ai.ask.title')} description={t('comingSoon.ai.ask')} /> : <AskTab /> : null}
      {tab === 'scan' ? aiOff ? <ComingSoon title={t('ai.scan.title')} description={t('comingSoon.ai.scan')} icon={<ScanLine size={22} />} /> : <ScanTab /> : null}
      {tab === 'forecast' ? <ForecastTab /> : null}
    </div>
  );
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

function AskTab() {
  const { t } = useAppContent();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const { submitting, error, run } = useSubmit();
  const suggestions = [t('ai.ask.example1'), t('ai.ask.example2'), t('ai.ask.example3')];

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    const history = turns;
    setTurns((c) => [...c, { role: 'user', content: q }]);
    setQuestion('');
    const res = await run(() => aiApi.ask(q, history));
    if (res) setTurns((c) => [...c, { role: 'assistant', content: res.answer }]);
  };

  return (
    <Card title={t('ai.ask.title')} subtitle={t('ai.ask.subtitle')}>
      <div className="chat-log">
        {turns.length === 0 ? (
          <div className="row wrap">
            {suggestions.map((s) => (
              <Button key={s} size="sm" icon={<Sparkles size={13} />} onClick={() => ask(s)}>
                {s}
              </Button>
            ))}
          </div>
        ) : (
          turns.map((turn, i) => (
            <div key={i} className={`chat-bubble ${turn.role === 'user' ? 'is-user' : ''}`}>
              <p className="pre-line">{turn.content}</p>
            </div>
          ))
        )}
        {submitting ? <LoadingBlock label={t('ai.ask.thinking')} /> : null}
      </div>
      <FormError message={error} />
      <form
        className="row form-section"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input className="input" style={{ flex: 1 }} value={question} maxLength={1000} placeholder={t('ai.ask.placeholder')} aria-label={t('ai.ask.placeholder')} onChange={(e) => setQuestion(e.target.value)} />
        <Button type="submit" variant="primary" icon={<Send size={15} />} disabled={submitting || !question.trim()}>
          {t('ai.ask.send')}
        </Button>
      </form>
      <p className="small text-subtle">{t('ai.ask.disclaimer')}</p>
    </Card>
  );
}

function ScanTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const [draft, setDraft] = useState<ExtractedDocument | null>(null);
  const { submitting, error, run, setError } = useSubmit();

  const scan = async (file: File | undefined) => {
    if (!file) return;
    setDraft(null);
    const res = await run(() => aiApi.extract(file));
    if (res) setDraft(res);
  };

  const createBill = async () => {
    if (!draft) return;
    if (!draft.vendor_id) {
      setError(t('ai.scan.noVendor', { name: draft.vendor_name || '?' }));
      return;
    }
    const lines = draft.lines
      .filter((l) => l.description)
      .map((l) => ({ accountId: l.account_id || null, description: l.description, quantity: l.quantity || 1, rate: l.rate || l.amount, taxRate: l.tax_rate || 0 }));
    const saved = await run(() =>
      billsApi.create({
        vendorId: draft.vendor_id,
        vendorBillNumber: draft.bill_number || null,
        date: draft.date || todayIso(),
        dueDate: draft.due_date || null,
        discountAmount: draft.discount || 0,
        status: 'draft',
        notes: t('ai.scan.createdNote'),
        lines,
      }),
    );
    if (saved) {
      toast.success(t('ai.scan.billCreated', { number: saved.billNumber }));
      navigate(`/bills/${saved.id}/edit`);
    }
  };

  return (
    <Card title={t('ai.scan.title')} subtitle={t('ai.scan.subtitle')}>
      <FormError message={error} />
      <label className="btn btn-secondary btn-md">
        <ScanLine size={15} aria-hidden="true" /> <span>{t('ai.scan.choose')}</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onChange={(e) => void scan(e.target.files?.[0])} />
      </label>{' '}
      <label className="btn btn-secondary btn-md">
        <Camera size={15} aria-hidden="true" /> <span>{t('ai.scan.camera')}</span>
        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => void scan(e.target.files?.[0])} />
      </label>
      {submitting && !draft ? <LoadingBlock label={t('ai.scan.reading')} /> : null}
      {draft ? (
        <div className="form-section">
          {draft.document_type === 'not_a_bill' ? <div className="alert alert-warning">{t('ai.scan.notABill')}</div> : null}
          <div className="form-grid">
            <TextField label={t('ai.scan.vendor')} value={draft.vendor_name} onChange={(e) => setDraft({ ...draft, vendor_name: e.target.value })} hint={draft.vendor_id ? t('ai.scan.vendorMatched') : t('ai.scan.vendorNew')} />
            <TextField label="GSTIN" value={draft.vendor_gstin} onChange={(e) => setDraft({ ...draft, vendor_gstin: e.target.value })} />
            <TextField label={t('ai.scan.billNumber')} value={draft.bill_number} onChange={(e) => setDraft({ ...draft, bill_number: e.target.value })} />
            <TextField label={t('docflow.form.date')} type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </div>
          <table className="data-table form-section">
            <thead>
              <tr>
                <th>{t('docflow.lines.description')}</th>
                <th className="align-right">{t('docflow.lines.qty')}</th>
                <th className="align-right">{t('docflow.lines.rate')}</th>
                <th className="align-right">{t('docflow.lines.tax')}</th>
                <th>{t('ai.scan.account')}</th>
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.description}</td>
                  <td className="align-right">{l.quantity}</td>
                  <td className="align-right">{formatCurrency(l.rate)}</td>
                  <td className="align-right">{l.tax_rate}%</td>
                  <td>{l.account_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals-list" style={{ maxWidth: 320, marginLeft: 'auto' }}>
            <div>
              <span>{t('docflow.totals.tax')}</span>
              <span>{formatCurrency(draft.tax_total)}</span>
            </div>
            <div className="grand">
              <span>{t('docflow.totals.total')}</span>
              <span>{formatCurrency(draft.total)}</span>
            </div>
          </div>
          {canWrite ? (
            <div className="row form-section">
              <Button variant="primary" loading={submitting} onClick={createBill}>
                {t('ai.scan.createBill')}
              </Button>
            </div>
          ) : null}
          <p className="small text-subtle">{t('ai.scan.review')}</p>
        </div>
      ) : null}
    </Card>
  );
}

function ForecastTab() {
  const { t } = useAppContent();
  const data = useAsync(() => aiApi.forecast(13), []);
  if (data.loading) return <LoadingBlock />;
  if (data.error || !data.data) return <ErrorBlock message={data.error ?? ''} onRetry={data.reload} />;
  const f = data.data;
  const max = Math.max(1, ...f.weeks.map((w) => Math.abs(w.closing)));
  return (
    <>
      <div className="stat-grid">
        <Card>
          <div className="text-subtle small">{t('ai.forecast.today')}</div>
          <strong>{formatCurrency(f.openingCash)}</strong>
        </Card>
        <Card>
          <div className="text-subtle small">{t('ai.forecast.lowest')}</div>
          <strong className={f.lowestBalance < 0 ? 'text-danger' : ''}>{formatCurrency(f.lowestBalance)}</strong>
          {f.lowestWeek ? <div className="small">{t('ai.forecast.weekOf', { date: formatDate(f.lowestWeek) })}</div> : null}
        </Card>
        <Card>
          <div className="text-subtle small">{t('ai.forecast.dailySpend')}</div>
          <strong>{formatCurrency(f.averageDailySpend)}</strong>
        </Card>
      </div>
      <Card title={t('ai.forecast.title')}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('ai.forecast.week')}</th>
              <th className="align-right">{t('ai.forecast.in')}</th>
              <th className="align-right">{t('ai.forecast.out')}</th>
              <th className="align-right">{t('ai.forecast.closing')}</th>
              <th style={{ width: '30%' }} />
            </tr>
          </thead>
          <tbody>
            {f.weeks.map((w) => (
              <tr key={w.weekStart}>
                <td>{formatDate(w.weekStart)}</td>
                <td className="align-right text-success">{formatCurrency(w.inflow)}</td>
                <td className="align-right text-danger">{formatCurrency(w.outflow)}</td>
                <td className={`align-right strong ${w.closing < 0 ? 'text-danger' : ''}`}>{formatCurrency(w.closing)}</td>
                <td>
                  <div className="forecast-bar" style={{ width: `${(Math.abs(w.closing) / max) * 100}%`, background: w.closing < 0 ? 'var(--danger, #dc2626)' : 'var(--primary)' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="plain-list small text-subtle form-section">
          {f.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </Card>
      <WhatIfCard />
    </>
  );
}
