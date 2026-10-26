/** Bank statement import: upload the bank's CSV, then match, pay or book each line - matched lines are reconciled. */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, EyeOff, Sparkles, Undo2, Upload, Wand2 } from 'lucide-react';

import { aiApi } from '@/api/ai';
import { accountingApi, bankingApi } from '@/api/endpoints';
import { type MatchCandidate, type StatementLine, bankStatementsApi } from '@/api/operations';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ComingSoonBadge } from '@/components/ui/ComingSoon';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate } from '@/utils/format';

type View = 'unmatched' | 'matched' | 'ignored';

/** Most statement lines the AI categorizer accepts in one call. */
const AI_SUGGEST_BATCH = 100;

export function BankStatementPage() {
  const { t } = useAppContent();
  const { accountId = '' } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { canWrite } = useAuth();
  const [view, setView] = useState<View>('unmatched');
  const accounts = useAsync(() => bankingApi.accounts(), []);
  const ledger = useAsync(() => accountingApi.accountOptions(), []);
  const aiStatus = useAsync(() => aiApi.status(), []);
  const lines = useAsync(() => bankStatementsApi.lines(accountId, view), [accountId, view]);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [suggested, setSuggested] = useState<Record<string, string>>({});
  const { submitting, run, errorRef } = useSubmit();
  const account = accounts.data?.find((a) => a.id === accountId);

  const act = async (action: () => Promise<unknown>, message?: string) => {
    const res = await run(action);
    if (res === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      if (message) toast.success(message);
      lines.reload();
      accounts.reload();
    }
    return res;
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const res = await run(() => bankStatementsApi.import(accountId, file));
    if (res === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t('ops.bank.imported', { imported: res.imported, duplicates: res.duplicates, matched: res.autoMatched }));
      setView('unmatched');
      lines.reload();
      accounts.reload();
    }
  };

  const suggest = async () => {
    const rows = (lines.data ?? []).filter((l) => l.status === 'unmatched');
    // The server takes at most 100 rows per call: send them in batches and map each
    // returned index back to its line.
    const res = await run(async () => {
      const found: Record<string, string> = {};
      for (let start = 0; start < rows.length; start += AI_SUGGEST_BATCH) {
        const batch = rows.slice(start, start + AI_SUGGEST_BATCH);
        const out = await aiApi.categorize(batch.map((l) => ({ description: l.description, amount: l.amount, type: l.type })));
        out.suggestions.forEach((s) => {
          const line = batch[s.index];
          if (line && s.account_id) found[line.id] = s.account_id;
        });
      }
      return found;
    });
    if (res === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      const next = res;
      setSuggested(next);
      setChosen((current) => ({ ...next, ...current }));
      toast.success(t('ops.bank.suggested', { count: Object.keys(next).length }));
    }
  };

  const applyCandidate = (line: StatementLine, c: MatchCandidate) => {
    if (c.kind === 'transaction') return act(() => bankStatementsApi.match(line.id, c.id), t('ops.bank.matched'));
    return act(() => bankStatementsApi.apply(line.id, c.kind === 'invoice' ? { invoiceId: c.id } : { billId: c.id }), t('ops.bank.paid'));
  };

  const accountOptions = (ledger.data ?? []).filter((a) => a.id !== account?.ledgerAccountId);

  return (
    <div className="stack">
      <PageHeader
        title={t('ops.bank.title', { name: account?.name ?? '' })}
        subtitle={t('ops.bank.subtitle')}
        actions={
          <div className="row wrap">
            <Button icon={<ArrowLeft size={15} />} onClick={() => navigate('/banking')}>
              {t('ops.bank.back')}
            </Button>
            {canWrite ? (
              <>
                <Button icon={<Wand2 size={15} />} disabled={submitting} onClick={() => act(() => bankStatementsApi.autoMatch(accountId).then((m) => (toast.success(m.message), m)))}>
                  {t('ops.bank.autoMatch')}
                </Button>
                <label className="btn btn-primary btn-md">
                  <Upload size={15} aria-hidden="true" /> <span>{t('ops.bank.upload')}</span>
                  <input type="file" accept=".csv,text/csv" hidden onChange={(e) => {
                      void upload(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </>
            ) : null}
          </div>
        }
      />
      <p className="small text-subtle">{t('ops.bank.formatHint')}</p>
      <Tabs tabs={(['unmatched', 'matched', 'ignored'] as View[]).map((id) => ({ id, label: t(`ops.bank.tab.${id}`) }))} active={view} onChange={(id) => setView(id as View)} />
      {view === 'unmatched' && canWrite && aiStatus.data && (lines.data ?? []).length > 0 ? (
        <div className="row">
          <Button size="sm" icon={<Sparkles size={13} />} loading={submitting} disabled={!aiStatus.data.configured} onClick={suggest}>
            {t('ops.bank.aiSuggest')}
          </Button>
          {aiStatus.data.configured ? null : <ComingSoonBadge />}
        </div>
      ) : null}
      {lines.loading ? <LoadingBlock /> : null}
      {lines.error ? <ErrorBlock message={lines.error} onRetry={lines.reload} /> : null}
      {lines.data && lines.data.length === 0 ? <EmptyState title={t(`ops.bank.empty.${view}`)} description={t('ops.bank.emptyHint')} /> : null}
      {(lines.data ?? []).map((line) => (
        <Card key={line.id}>
          <div className="row-between wrap">
            <div className="cell-stack">
              <span className="strong">{line.description}</span>
              <small className="text-subtle">
                {formatDate(line.date)}
                {line.reference ? ` · ${line.reference}` : ''}
              </small>
            </div>
            <span className={`strong num ${line.type === 'deposit' ? 'text-success' : 'text-danger'}`}>
              {line.type === 'deposit' ? '+' : '−'}
              {formatCurrency(line.amount)}
            </span>
          </div>
          {line.status === 'unmatched' && canWrite ? (
            <div className="stack form-section">
              {line.candidates.length ? (
                <div className="stack">
                  <span className="small text-subtle">{t('ops.bank.suggestions')}</span>
                  {line.candidates.map((c) => (
                    <div key={`${c.kind}-${c.id}`} className="row-between">
                      <span className="small">
                        <Badge tone={c.kind === 'transaction' ? 'info' : 'warning'}>{t(`ops.bank.kind.${c.kind}`)}</Badge> {c.label} · {formatDate(c.date)}
                      </span>
                      <Button size="sm" icon={<Check size={13} />} disabled={submitting} onClick={() => applyCandidate(line, c)}>
                        {c.kind === 'transaction' ? t('ops.bank.match') : t('ops.bank.recordPayment')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="row wrap">
                <select
                  className="select"
                  style={{ maxWidth: 320 }}
                  aria-label={t('ops.bank.bookTo')}
                  value={chosen[line.id] ?? ''}
                  onChange={(e) => setChosen({ ...chosen, [line.id]: e.target.value })}
                >
                  <option value="">{t('ops.bank.bookTo')}</option>
                  {accountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
                {suggested[line.id] && suggested[line.id] === chosen[line.id] ? <Badge tone="info">{t('ops.bank.aiPick')}</Badge> : null}
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!chosen[line.id] || submitting}
                  onClick={() => act(() => bankStatementsApi.categorize(line.id, chosen[line.id]), t('ops.bank.booked'))}
                >
                  {t('ops.bank.book')}
                </Button>
                <Button size="sm" variant="ghost" icon={<EyeOff size={13} />} disabled={submitting} onClick={() => act(() => bankStatementsApi.ignore(line.id))}>
                  {t('ops.bank.ignore')}
                </Button>
              </div>
            </div>
          ) : null}
          {line.status !== 'unmatched' && canWrite ? (
            <div className="row form-section">
              <Badge tone={line.status === 'matched' ? 'success' : 'neutral'}>{t(`ops.bank.tab.${line.status}`)}</Badge>
              <Button size="sm" variant="ghost" icon={<Undo2 size={13} />} disabled={submitting} onClick={() => act(() => bankStatementsApi.undo(line.id))}>
                {t('ops.bank.undo')}
              </Button>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
