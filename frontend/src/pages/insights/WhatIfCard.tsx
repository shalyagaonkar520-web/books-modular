/** What-if cash planner: change collections, costs or add a one-off and compare against the forecast. */
import { useState } from 'react';
import { Calculator } from 'lucide-react';

import { type WhatIf, planningApi } from '@/api/insights';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, parseNumber, todayIso } from '@/utils/format';

export function WhatIfCard() {
  const { t } = useAppContent();
  const [form, setForm] = useState({
    collectionDelayDays: '0',
    collectionRate: '100',
    paymentDelayDays: '0',
    extraMonthlyIncome: '0',
    extraMonthlyExpense: '0',
    spendChangePercent: '0',
    oneOffDate: todayIso(),
    oneOffAmount: '',
    oneOffType: 'outflow',
    oneOffLabel: '',
  });
  const [result, setResult] = useState<WhatIf | null>(null);
  const { submitting, error, run } = useSubmit();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const calculate = async () => {
    const amount = parseNumber(form.oneOffAmount, 0);
    const res = await run(() =>
      planningApi.whatIf({
        weeks: 13,
        collectionDelayDays: Math.round(parseNumber(form.collectionDelayDays, 0)),
        collectionRate: parseNumber(form.collectionRate, 100),
        paymentDelayDays: Math.round(parseNumber(form.paymentDelayDays, 0)),
        extraMonthlyIncome: parseNumber(form.extraMonthlyIncome, 0),
        extraMonthlyExpense: parseNumber(form.extraMonthlyExpense, 0),
        spendChangePercent: parseNumber(form.spendChangePercent, 0),
        oneOffs: amount > 0 ? [{ date: form.oneOffDate, amount, type: form.oneOffType as 'inflow' | 'outflow', label: form.oneOffLabel.trim() }] : [],
      }),
    );
    if (res) setResult(res);
  };

  return (
    <Card title={t('whatIf.title')} subtitle={t('whatIf.subtitle')}>
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('whatIf.collectionDelay')} type="number" min="0" max="180" value={form.collectionDelayDays} onChange={set('collectionDelayDays')} />
        <TextField label={t('whatIf.collectionRate')} type="number" min="0" max="100" value={form.collectionRate} onChange={set('collectionRate')} />
        <TextField label={t('whatIf.paymentDelay')} type="number" min="0" max="180" value={form.paymentDelayDays} onChange={set('paymentDelayDays')} />
        <TextField label={t('whatIf.spendChange')} type="number" min="-100" max="500" value={form.spendChangePercent} onChange={set('spendChangePercent')} />
        <TextField label={t('whatIf.extraIncome')} type="number" min="0" value={form.extraMonthlyIncome} onChange={set('extraMonthlyIncome')} />
        <TextField label={t('whatIf.extraExpense')} type="number" min="0" value={form.extraMonthlyExpense} onChange={set('extraMonthlyExpense')} />
      </div>
      <h4 className="form-section-title">{t('whatIf.oneOff')}</h4>
      <div className="form-grid">
        <SelectField
          label={t('whatIf.oneOffType')}
          value={form.oneOffType}
          options={[
            { value: 'outflow', label: t('whatIf.outflow') },
            { value: 'inflow', label: t('whatIf.inflow') },
          ]}
          onChange={set('oneOffType')}
        />
        <TextField label={t('whatIf.oneOffAmount')} type="number" min="0" value={form.oneOffAmount} onChange={set('oneOffAmount')} />
        <TextField label={t('whatIf.oneOffDate')} type="date" min={todayIso()} value={form.oneOffDate} onChange={set('oneOffDate')} />
        <TextField label={t('whatIf.oneOffLabel')} value={form.oneOffLabel} maxLength={80} onChange={set('oneOffLabel')} />
      </div>
      <div className="row form-section">
        <Button variant="primary" icon={<Calculator size={15} />} loading={submitting} onClick={calculate}>
          {t('whatIf.run')}
        </Button>
      </div>
      {result ? (
        <div className="stack form-section">
          <div className="stat-grid">
            <div className="card">
              <div className="text-subtle small">{t('whatIf.endNow')}</div>
              <strong>{formatCurrency(result.baseline.weeks[result.baseline.weeks.length - 1]?.closing ?? 0)}</strong>
            </div>
            <div className="card">
              <div className="text-subtle small">{t('whatIf.endScenario')}</div>
              <strong className={result.differenceAtEnd < 0 ? 'text-danger' : 'text-success'}>
                {formatCurrency(result.scenario.weeks[result.scenario.weeks.length - 1]?.closing ?? 0)}
              </strong>
              <div className="small">{t('whatIf.difference', { amount: formatCurrency(result.differenceAtEnd) })}</div>
            </div>
            <div className="card">
              <div className="text-subtle small">{t('whatIf.lowest')}</div>
              <strong className={result.scenario.lowestBalance < 0 ? 'text-danger' : ''}>{formatCurrency(result.scenario.lowestBalance)}</strong>
              {result.scenario.firstNegativeWeek ? (
                <div className="small text-danger">{t('whatIf.negativeFrom', { date: formatDate(result.scenario.firstNegativeWeek) })}</div>
              ) : (
                <div className="small text-success">{t('whatIf.staysPositive')}</div>
              )}
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('ai.forecast.week')}</th>
                <th className="align-right">{t('whatIf.colNow')}</th>
                <th className="align-right">{t('whatIf.colScenario')}</th>
              </tr>
            </thead>
            <tbody>
              {result.scenario.weeks.map((w, i) => (
                <tr key={w.weekStart}>
                  <td>{formatDate(w.weekStart)}</td>
                  <td className="align-right">{formatCurrency(result.baseline.weeks[i]?.closing ?? 0)}</td>
                  <td className={`align-right strong ${w.closing < 0 ? 'text-danger' : ''}`}>{formatCurrency(w.closing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small text-subtle">{result.summary}</p>
        </div>
      ) : null}
    </Card>
  );
}
