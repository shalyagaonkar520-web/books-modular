/**
 * Income tax estimate: old vs new regime, presumptive income (44AD / 44ADA /
 * 44AE), deductions, taxes already paid, interest under 234A / 234B / 234C and
 * the advance-tax schedule. Everything is worked out in the browser from
 * utils/itr (ported from Free GST Billing Software, MIT); nothing is saved.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { formatCurrency, formatDate, todayIso } from '@/utils/format';
import {
  compareRegimes,
  compute234AInterest,
  compute234BInterest,
  compute234CInterest,
  compute44AD,
  compute44ADA,
  compute44AE,
  computeAdvanceTaxSchedule,
  CURRENT_FY,
  effectiveDeductionCap,
  type Deductions,
  type PresumptiveResult,
  type Regime,
  type TaxPayment,
  type TaxResult,
} from '@/utils/itr';

type Tab = 'income' | 'deductions' | 'paid' | 'advance';
type AgeBand = 'below60' | 'senior' | 'superSenior';
type BusinessMode = 'books' | '44AD' | '44ADA' | '44AE';

const FY_OPTIONS = ['2025-26', '2024-25'];
const AGE_FOR_BAND: Record<AgeBand, number> = { below60: 0, senior: 60, superSenior: 80 };

const AMOUNT_KEYS = [
  'salary',
  'businessIncome',
  'digitalReceipts',
  'cashReceipts',
  'declaredIncome',
  'heavyVehicleMonths',
  'heavyVehicleTonnage',
  'lightVehicleMonths',
  'housePropertyIncome',
  'stcg',
  'ltcg',
  'otherSources',
  'd80C',
  'd80CCD1B',
  'd80CCD2',
  'd80D',
  'd80TTA',
  'd80TTB',
  'd80E',
  'd80G',
  'd80GG',
  'd80DDB',
  'd80U',
  'd24b',
  'tds',
  'selfAssessment',
] as const;
type AmountKey = (typeof AMOUNT_KEYS)[number];

interface PaymentRow {
  id: number;
  date: string;
  amount: string;
}

/** "2025-26" -> "2026-27" */
function assessmentYear(fy: string): string {
  const start = Number(fy.split('-')[0]) + 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function startYearOf(fy: string): number {
  return Number(fy.split('-')[0]);
}

export function IncomeTaxPage() {
  const { t } = useAppContent();
  const [tab, setTab] = useState<Tab>('income');
  const [fy, setFy] = useState(CURRENT_FY);
  const [ageBand, setAgeBand] = useState<AgeBand>('below60');
  const [parentsSenior, setParentsSenior] = useState(false);
  const [govtEmployee, setGovtEmployee] = useState(false);
  const [regime, setRegime] = useState<Regime>('new');
  const [businessMode, setBusinessMode] = useState<BusinessMode>('books');
  const [amounts, setAmounts] = useState<Record<AmountKey, string>>(() => {
    const blank = Object.fromEntries(AMOUNT_KEYS.map((k) => [k, ''])) as Record<AmountKey, string>;
    // A heavy goods vehicle is one over 12,000 kg, so start at 13 tonnes.
    return { ...blank, heavyVehicleTonnage: '13' };
  });
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [nextPaymentId, setNextPaymentId] = useState(1);
  const [selfAssessmentDate, setSelfAssessmentDate] = useState('');
  const [filingDate, setFilingDate] = useState(todayIso);
  const [auditCase, setAuditCase] = useState(false);

  const setAmount = (key: AmountKey, value: string) => setAmounts((prev) => ({ ...prev, [key]: value }));
  const n = (key: AmountKey) => Number(amounts[key]) || 0;

  const age = AGE_FOR_BAND[ageBand];
  const selfSenior = age >= 60;
  const ay = assessmentYear(fy);

  const presumptive: PresumptiveResult | null = useMemo(() => {
    if (businessMode === '44AD') return compute44AD(amounts);
    if (businessMode === '44ADA') return compute44ADA(amounts);
    if (businessMode === '44AE') return compute44AE(amounts);
    return null;
  }, [businessMode, amounts]);

  const deductions: Deductions = {
    '80C': n('d80C'),
    '80CCD1B': n('d80CCD1B'),
    '80CCD2': n('d80CCD2'),
    '80D': n('d80D'),
    // Only one of 80TTA (under 60) and 80TTB (60+) can apply.
    '80TTA': selfSenior ? 0 : n('d80TTA'),
    '80TTB': selfSenior ? n('d80TTB') : 0,
    '80E': n('d80E'),
    '80G': n('d80G'),
    '80GG': n('d80GG'),
    '80DDB': n('d80DDB'),
    '80U': n('d80U'),
    '24b': n('d24b'),
  };

  const comparison = compareRegimes({
    salary: n('salary'),
    businessIncome: presumptive ? presumptive.presumptiveIncome : n('businessIncome'),
    housePropertyIncome: n('housePropertyIncome'),
    otherSources: n('otherSources'),
    stcgAtSpecialRate: n('stcg'),
    ltcgAtSpecialRate: n('ltcg'),
    deductions,
    fy,
    age,
    selfSenior,
    parentsSenior,
    isGovtEmployee: govtEmployee,
  });
  const tax = comparison[regime];

  // Taxes already paid.
  const tds = n('tds');
  const advancePaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const selfAssessment = n('selfAssessment');
  const paidList: TaxPayment[] = payments.filter((p) => p.date && Number(p.amount)).map((p) => ({ date: p.date, amount: Number(p.amount) }));
  if (selfAssessment && selfAssessmentDate) paidList.push({ date: selfAssessmentDate, amount: selfAssessment });

  // 44AD / 44ADA pay all advance tax in one instalment by 15 March.
  const mode = businessMode === '44AD' || businessMode === '44ADA' ? 'presumptive' : 'regular';
  const schedule = computeAdvanceTaxSchedule(tax.totalTax, tds, paidList, mode, fy);
  const dueDate = auditCase ? `${startYearOf(fy) + 1}-10-31` : `${startYearOf(fy) + 1}-07-31`;
  // Self-assessment tax paid by the due date reduces the base for 234A.
  const paidByDueDate = tds + advancePaid + (selfAssessment && selfAssessmentDate && selfAssessmentDate <= dueDate ? selfAssessment : 0);
  const interest234A = compute234AInterest(tax.totalTax, paidByDueDate, filingDate || undefined, dueDate, fy);
  const interest234B = compute234BInterest(schedule, (selfAssessment && selfAssessmentDate) || filingDate || undefined, fy);
  const interest234C = compute234CInterest(schedule);
  const totalInterest = interest234A + interest234B + interest234C;
  const totalPaid = tds + advancePaid + selfAssessment;
  const balance = Math.round((tax.totalTax + totalInterest - totalPaid) * 100) / 100;

  const regimeLabel = (r: Regime) => t(r === 'old' ? 'incomeTax.regime.old' : 'incomeTax.regime.new');
  const cheaper = comparison.recommended;

  const addPayment = () => {
    setPayments((prev) => [...prev, { id: nextPaymentId, date: todayIso(), amount: '' }]);
    setNextPaymentId((id) => id + 1);
  };
  const updatePayment = (id: number, patch: Partial<PaymentRow>) => setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePayment = (id: number) => setPayments((prev) => prev.filter((p) => p.id !== id));

  const amountField = (key: AmountKey, label: string, hint?: string, allowNegative = false) => (
    <TextField
      label={label}
      hint={hint}
      type="number"
      inputMode="decimal"
      prefix="₹"
      min={allowNegative ? undefined : 0}
      value={amounts[key]}
      onChange={(e) => setAmount(key, e.target.value)}
    />
  );

  return (
    <div className="stack">
      <PageHeader title={t('incomeTax.title')} subtitle={t('incomeTax.subtitle', { fy, ay })} />
      <div className="alert alert-info">{t('incomeTax.estimateNote')}</div>

      <Card title={t('incomeTax.about.title')}>
        <div className="form-grid-3">
          <SelectField
            label={t('incomeTax.year.label')}
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            options={FY_OPTIONS.map((value) => ({ value, label: t('incomeTax.year.option', { fy: value, ay: assessmentYear(value) }) }))}
          />
          <SelectField
            label={t('incomeTax.age.label')}
            value={ageBand}
            onChange={(e) => setAgeBand(e.target.value as AgeBand)}
            options={[
              { value: 'below60', label: t('incomeTax.age.below60') },
              { value: 'senior', label: t('incomeTax.age.senior') },
              { value: 'superSenior', label: t('incomeTax.age.superSenior') },
            ]}
          />
          <SelectField
            label={t('incomeTax.regime.label')}
            hint={t('incomeTax.regime.hint')}
            value={regime}
            onChange={(e) => setRegime(e.target.value as Regime)}
            options={[
              { value: 'new', label: t('incomeTax.regime.new') },
              { value: 'old', label: t('incomeTax.regime.old') },
            ]}
          />
        </div>
        <div className="row wrap">
          <CheckboxField label={t('incomeTax.parentsSenior')} checked={parentsSenior} onChange={(e) => setParentsSenior(e.target.checked)} />
          <CheckboxField
            label={t('incomeTax.govtEmployee')}
            hint={t('incomeTax.govtEmployeeHint')}
            checked={govtEmployee}
            onChange={(e) => setGovtEmployee(e.target.checked)}
          />
        </div>
      </Card>

      <Tabs
        tabs={[
          { id: 'income', label: t('incomeTax.tab.income') },
          { id: 'deductions', label: t('incomeTax.tab.deductions') },
          { id: 'paid', label: t('incomeTax.tab.paid') },
          { id: 'advance', label: t('incomeTax.tab.advance') },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {tab === 'income' ? (
        <>
          <Card title={t('incomeTax.income.salaryTitle')}>
            <div className="form-grid">{amountField('salary', t('incomeTax.income.salary'), t('incomeTax.income.salaryHint'))}</div>
          </Card>

          <Card title={t('incomeTax.business.title')} subtitle={t('incomeTax.business.subtitle')}>
            <div className="form-grid">
              <SelectField
                label={t('incomeTax.business.mode')}
                value={businessMode}
                onChange={(e) => setBusinessMode(e.target.value as BusinessMode)}
                options={[
                  { value: 'books', label: t('incomeTax.business.books') },
                  { value: '44AD', label: t('incomeTax.business.44AD') },
                  { value: '44ADA', label: t('incomeTax.business.44ADA') },
                  { value: '44AE', label: t('incomeTax.business.44AE') },
                ]}
              />
              {businessMode === 'books' ? amountField('businessIncome', t('incomeTax.business.profit'), t('incomeTax.business.profitHint'), true) : null}
              {businessMode === '44AD' || businessMode === '44ADA' ? (
                <>
                  {amountField(
                    'digitalReceipts',
                    t('incomeTax.business.digitalReceipts'),
                    t(businessMode === '44AD' ? 'incomeTax.business.digitalHint44AD' : 'incomeTax.business.digitalHint44ADA'),
                  )}
                  {amountField(
                    'cashReceipts',
                    t('incomeTax.business.cashReceipts'),
                    t(businessMode === '44AD' ? 'incomeTax.business.cashHint44AD' : 'incomeTax.business.cashHint44ADA'),
                  )}
                </>
              ) : null}
              {businessMode === '44AE' ? (
                <>
                  <TextField
                    label={t('incomeTax.business.heavyMonths')}
                    hint={t('incomeTax.business.heavyMonthsHint')}
                    type="number"
                    min={0}
                    value={amounts.heavyVehicleMonths}
                    onChange={(e) => setAmount('heavyVehicleMonths', e.target.value)}
                  />
                  <TextField
                    label={t('incomeTax.business.heavyTonnage')}
                    type="number"
                    min={0}
                    value={amounts.heavyVehicleTonnage}
                    onChange={(e) => setAmount('heavyVehicleTonnage', e.target.value)}
                  />
                  <TextField
                    label={t('incomeTax.business.lightMonths')}
                    hint={t('incomeTax.business.lightMonthsHint')}
                    type="number"
                    min={0}
                    value={amounts.lightVehicleMonths}
                    onChange={(e) => setAmount('lightVehicleMonths', e.target.value)}
                  />
                </>
              ) : null}
              {presumptive ? amountField('declaredIncome', t('incomeTax.business.declared'), t('incomeTax.business.declaredHint')) : null}
            </div>
            {presumptive ? <PresumptiveSummary presumptive={presumptive} declared={n('declaredIncome')} /> : null}
          </Card>

          <Card title={t('incomeTax.income.otherTitle')}>
            <div className="form-grid">
              {amountField('housePropertyIncome', t('incomeTax.income.houseProperty'), t('incomeTax.income.housePropertyHint'), true)}
              {amountField('otherSources', t('incomeTax.income.otherSources'), t('incomeTax.income.otherSourcesHint'))}
              {amountField('stcg', t('incomeTax.income.stcg'), t('incomeTax.income.stcgHint'))}
              {amountField('ltcg', t('incomeTax.income.ltcg'), t('incomeTax.income.ltcgHint'))}
            </div>
          </Card>
        </>
      ) : null}

      {tab === 'deductions' ? (
        <Card title={t('incomeTax.deductions.title')} subtitle={t('incomeTax.deductions.subtitle')}>
          {regime === 'new' ? <div className="alert alert-info">{t('incomeTax.deductions.newRegimeNote')}</div> : null}
          <div className="form-grid">
            {amountField('d80C', t('incomeTax.deductions.80C'), t('incomeTax.deductions.80CHint'))}
            {amountField('d80CCD1B', t('incomeTax.deductions.80CCD1B'), t('incomeTax.deductions.80CCD1BHint'))}
            {amountField('d80CCD2', t('incomeTax.deductions.80CCD2'), t(govtEmployee ? 'incomeTax.deductions.80CCD2HintGovt' : 'incomeTax.deductions.80CCD2Hint'))}
            {amountField(
              'd80D',
              t('incomeTax.deductions.80D'),
              t('incomeTax.deductions.80DHint', { cap: formatCurrency(effectiveDeductionCap('80D', { selfSenior, parentsSenior })) }),
            )}
            {selfSenior
              ? amountField('d80TTB', t('incomeTax.deductions.80TTB'), t('incomeTax.deductions.80TTBHint'))
              : amountField('d80TTA', t('incomeTax.deductions.80TTA'), t('incomeTax.deductions.80TTAHint'))}
            {amountField('d80E', t('incomeTax.deductions.80E'), t('incomeTax.deductions.80EHint'))}
            {amountField('d80G', t('incomeTax.deductions.80G'), t('incomeTax.deductions.80GHint'))}
            {amountField('d80GG', t('incomeTax.deductions.80GG'), t('incomeTax.deductions.80GGHint'))}
            {amountField(
              'd80DDB',
              t('incomeTax.deductions.80DDB'),
              t('incomeTax.deductions.80DDBHint', { cap: formatCurrency(effectiveDeductionCap('80DDB', { selfSenior })) }),
            )}
            {amountField('d80U', t('incomeTax.deductions.80U'), t('incomeTax.deductions.80UHint'))}
            {amountField('d24b', t('incomeTax.deductions.24b'), t('incomeTax.deductions.24bHint'))}
          </div>
        </Card>
      ) : null}

      {tab === 'paid' ? (
        <Card title={t('incomeTax.paid.title')} subtitle={t('incomeTax.paid.subtitle')}>
          <div className="form-grid">{amountField('tds', t('incomeTax.paid.tds'), t('incomeTax.paid.tdsHint'))}</div>

          <h3 className="card-title">{t('incomeTax.paid.advanceTitle')}</h3>
          {payments.length === 0 ? <p className="text-subtle small">{t('incomeTax.paid.noAdvance')}</p> : null}
          {payments.map((p) => (
            <div key={p.id} className="form-grid-3">
              <TextField label={t('incomeTax.paid.date')} type="date" value={p.date} onChange={(e) => updatePayment(p.id, { date: e.target.value })} />
              <TextField
                label={t('incomeTax.paid.amount')}
                type="number"
                inputMode="decimal"
                prefix="₹"
                min={0}
                value={p.amount}
                onChange={(e) => updatePayment(p.id, { amount: e.target.value })}
              />
              <div className="row">
                <Button variant="ghost" icon={<Trash2 size={15} />} aria-label={t('incomeTax.paid.remove')} onClick={() => removePayment(p.id)}>
                  {t('incomeTax.paid.remove')}
                </Button>
              </div>
            </div>
          ))}
          <div className="row">
            <Button icon={<Plus size={15} />} onClick={addPayment}>
              {t('incomeTax.paid.addAdvance')}
            </Button>
          </div>

          <h3 className="card-title">{t('incomeTax.paid.selfTitle')}</h3>
          <div className="form-grid">
            {amountField('selfAssessment', t('incomeTax.paid.selfAmount'), t('incomeTax.paid.selfHint'))}
            <TextField label={t('incomeTax.paid.selfDate')} type="date" value={selfAssessmentDate} onChange={(e) => setSelfAssessmentDate(e.target.value)} />
          </div>

          <h3 className="card-title">{t('incomeTax.paid.filingTitle')}</h3>
          <div className="form-grid">
            <TextField
              label={t('incomeTax.paid.filingDate')}
              hint={t('incomeTax.paid.filingDateHint', { date: formatDate(dueDate) })}
              type="date"
              value={filingDate}
              onChange={(e) => setFilingDate(e.target.value)}
            />
          </div>
          <CheckboxField label={t('incomeTax.paid.auditCase')} hint={t('incomeTax.paid.auditCaseHint')} checked={auditCase} onChange={(e) => setAuditCase(e.target.checked)} />
        </Card>
      ) : null}

      {tab === 'advance' ? (
        <Card
          title={t('incomeTax.advance.title')}
          subtitle={t('incomeTax.advance.subtitle', { regime: regimeLabel(regime), amount: formatCurrency(schedule.netLiability) })}
        >
          {mode === 'presumptive' ? <div className="alert alert-info">{t('incomeTax.advance.presumptiveNote')}</div> : null}
          {!schedule.applies ? (
            <p className="text-success">{t('incomeTax.advance.notNeeded')}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('incomeTax.advance.col.installment')}</th>
                    <th>{t('incomeTax.advance.col.dueDate')}</th>
                    <th className="align-right">{t('incomeTax.advance.col.cumulative')}</th>
                    <th className="align-right">{t('incomeTax.advance.col.thisInstallment')}</th>
                    <th className="align-right">{t('incomeTax.advance.col.paidByDue')}</th>
                    <th className="align-right">{t('incomeTax.advance.col.shortfall')}</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.schedule.map((row) => (
                    <tr key={row.installment}>
                      <td>{t('incomeTax.advance.installment', { number: row.installment })}</td>
                      <td>{formatDate(row.dueDate)}</td>
                      <td className="align-right">{Math.round(row.cumulativePct * 100)}%</td>
                      <td className="align-right">{formatCurrency(row.installmentDue)}</td>
                      <td className="align-right">{formatCurrency(row.totalPaidByDue)}</td>
                      <td className={`align-right ${row.shortfall > 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(row.shortfall)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <div className="stat-grid">
        <StatTile label={t('incomeTax.result.totalTax', { regime: regimeLabel(regime) })} value={formatCurrency(tax.totalTax)} />
        <StatTile
          label={balance >= 0 ? t('incomeTax.result.payable') : t('incomeTax.result.refund')}
          value={formatCurrency(Math.abs(balance))}
          tone={balance > 0 ? 'negative' : balance < 0 ? 'positive' : 'neutral'}
        />
        <StatTile
          label={t('incomeTax.compare.cheaperLabel')}
          value={regimeLabel(cheaper)}
          sublabel={comparison.savings > 0 ? t('incomeTax.compare.saves', { amount: formatCurrency(comparison.savings) }) : t('incomeTax.compare.same')}
          tone="positive"
        />
      </div>

      <div className="grid-2">
        <Card
          title={t('incomeTax.compare.title')}
          subtitle={
            comparison.savings > 0
              ? t('incomeTax.compare.cheaper', { regime: regimeLabel(cheaper), amount: formatCurrency(comparison.savings) })
              : t('incomeTax.compare.tie')
          }
          footer={
            regime !== cheaper ? (
              <Button variant="primary" onClick={() => setRegime(cheaper)}>
                {t('incomeTax.compare.use', { regime: regimeLabel(cheaper) })}
              </Button>
            ) : undefined
          }
        >
          <ComparisonTable oldTax={comparison.old} newTax={comparison.new} cheaper={cheaper} />
        </Card>

        <Card title={t('incomeTax.result.title', { regime: regimeLabel(regime) })}>
          <div className="table-wrap">
            <table className="data-table">
              <tbody>
                <AmountRow label={t('incomeTax.result.grossTotalIncome')} amount={tax.grossTotalIncome} />
                {tax.standardDeduction ? <AmountRow label={t('incomeTax.result.standardDeduction')} amount={-tax.standardDeduction} /> : null}
                {tax.allowedDeductions ? <AmountRow label={t('incomeTax.result.deductions')} amount={-tax.allowedDeductions} /> : null}
                <AmountRow label={t('incomeTax.result.taxableIncome')} amount={tax.taxableIncome} strong />
                <AmountRow label={t('incomeTax.result.slabTax')} amount={tax.slabTax} />
                {tax.stcgTax ? <AmountRow label={t('incomeTax.result.stcgTax')} amount={tax.stcgTax} /> : null}
                {tax.ltcgTax ? <AmountRow label={t('incomeTax.result.ltcgTax')} amount={tax.ltcgTax} /> : null}
                {tax.rebate87A ? <AmountRow label={t('incomeTax.result.rebate')} amount={-tax.rebate87A} /> : null}
                <AmountRow label={t('incomeTax.result.surcharge')} amount={tax.surcharge} />
                <AmountRow label={t('incomeTax.result.cess')} amount={tax.cess} />
                <AmountRow label={t('incomeTax.result.totalTaxRow')} amount={tax.totalTax} strong />
                <AmountRow label={t('incomeTax.result.interest234A')} amount={interest234A} />
                <AmountRow label={t('incomeTax.result.interest234B')} amount={interest234B} />
                <AmountRow label={t('incomeTax.result.interest234C')} amount={interest234C} />
                <AmountRow label={t('incomeTax.result.lessTds')} amount={-tds} />
                <AmountRow label={t('incomeTax.result.lessAdvance')} amount={-advancePaid} />
                <AmountRow label={t('incomeTax.result.lessSelf')} amount={-selfAssessment} />
                <AmountRow label={balance >= 0 ? t('incomeTax.result.payable') : t('incomeTax.result.refund')} amount={Math.abs(balance)} strong />
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="text-subtle small">{t('incomeTax.credit')}</p>
    </div>
  );
}

function AmountRow({ label, amount, strong = false }: { label: string; amount: number; strong?: boolean }) {
  return (
    <tr className={strong ? 'strong' : undefined}>
      <td>{strong ? <strong>{label}</strong> : label}</td>
      <td className="align-right">{strong ? <strong>{formatCurrency(amount)}</strong> : formatCurrency(amount)}</td>
    </tr>
  );
}

function ComparisonTable({ oldTax, newTax, cheaper }: { oldTax: TaxResult; newTax: TaxResult; cheaper: Regime }) {
  const { t } = useAppContent();
  const rows: Array<{ label: string; key: keyof TaxResult; strong?: boolean }> = [
    { label: t('incomeTax.result.grossTotalIncome'), key: 'grossTotalIncome' },
    { label: t('incomeTax.result.standardDeduction'), key: 'standardDeduction' },
    { label: t('incomeTax.result.deductions'), key: 'allowedDeductions' },
    { label: t('incomeTax.result.taxableIncome'), key: 'taxableIncome', strong: true },
    { label: t('incomeTax.result.slabTax'), key: 'slabTax' },
    { label: t('incomeTax.result.capitalGainsTax'), key: 'specialRateTax' },
    { label: t('incomeTax.result.rebate'), key: 'rebate87A' },
    { label: t('incomeTax.result.surcharge'), key: 'surcharge' },
    { label: t('incomeTax.result.cess'), key: 'cess' },
    { label: t('incomeTax.result.totalTaxRow'), key: 'totalTax', strong: true },
  ];
  const cell = (r: TaxResult, key: keyof TaxResult, strong?: boolean) => {
    const text = formatCurrency(r[key] as number);
    return <td className="align-right">{strong ? <strong>{text}</strong> : text}</td>;
  };
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th />
            <th className="align-right">
              {t('incomeTax.regime.old')}
              {cheaper === 'old' ? ` · ${t('incomeTax.compare.cheaperTag')}` : ''}
            </th>
            <th className="align-right">
              {t('incomeTax.regime.new')}
              {cheaper === 'new' ? ` · ${t('incomeTax.compare.cheaperTag')}` : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.strong ? <strong>{row.label}</strong> : row.label}</td>
              {cell(oldTax, row.key, row.strong)}
              {cell(newTax, row.key, row.strong)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PresumptiveSummary({ presumptive, declared }: { presumptive: PresumptiveResult; declared: number }) {
  const { t } = useAppContent();
  const belowDeemed = declared > 0 && declared < presumptive.deemedIncome;
  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="data-table">
          <tbody>
            {presumptive.section === '44AE' ? (
              <>
                <AmountRow label={t('incomeTax.business.heavyIncome')} amount={presumptive.heavyIncome ?? 0} />
                <AmountRow label={t('incomeTax.business.lightIncome')} amount={presumptive.lightIncome ?? 0} />
              </>
            ) : (
              <AmountRow label={t('incomeTax.business.turnover')} amount={presumptive.turnover ?? 0} />
            )}
            <AmountRow label={t('incomeTax.business.deemed')} amount={presumptive.deemedIncome} />
            <AmountRow label={t('incomeTax.business.incomeUsed')} amount={presumptive.presumptiveIncome} strong />
          </tbody>
        </table>
      </div>
      {!presumptive.isEligible ? (
        <div className="alert alert-warning">
          {presumptive.section === '44AE'
            ? t('incomeTax.business.notEligible44AE')
            : t('incomeTax.business.notEligible', { section: presumptive.section, limit: formatCurrency(presumptive.threshold ?? 0) })}
        </div>
      ) : null}
      {belowDeemed ? <div className="alert alert-warning">{t('incomeTax.business.belowDeemed')}</div> : null}
    </div>
  );
}
