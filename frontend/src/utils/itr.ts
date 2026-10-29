// ============================================================================
// Indian Income Tax helpers — FY 2024-25 and FY 2025-26
// ----------------------------------------------------------------------------
// TypeScript port of src/utils/itr.js from Free GST Billing Software
// https://github.com/IamRamgarhia/Free-GST-Billing-Software
// MIT License, Copyright (c) 2026 DiceCodes.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: The above
// copyright notice and this permission notice shall be included in all copies
// or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
// WITHOUT WARRANTY OF ANY KIND.
//
// Everything here is pure math, kept rule-for-rule and number-for-number with
// the original. The one change: dates written as YYYY-MM-DD are read as local
// calendar dates (the original read them as UTC midnight, which shifts the
// day for browsers west of UTC), and "today" means today's date, not now.
//
// Rules from the original audit (v1.10.31):
//   - Budget 2025 new-regime slabs + ₹60k / ₹12L 87A rebate for FY 25-26
//   - Finance (No. 2) Act 2024 STCG 20%, LTCG 12.5% + ₹1.25L exemption
//   - Senior (60+) and super-senior (80+) old-regime basic exemption slabs
//   - Rule 119A ₹100 rounding for 234A / 234B / 234C
//   - Marginal relief on surcharge threshold crossings
//   - 80CCD(2) capped at 10 / 14% of salary
//   - 87A eligibility uses total-income base (includes capital gains)
//   - Special-rate tax (LTCG/STCG) surcharge capped at 15%
// ============================================================================

export type Regime = 'old' | 'new';
export type AdvanceTaxMode = 'regular' | 'presumptive';

export interface Slab {
  upto: number;
  rate: number;
}

type NumLike = number | string | null | undefined;

/** Current filing season. Every FY-relative slab / rate / due date resolves via this. */
export const CURRENT_FY = '2025-26';

// ----------------------------- Regimes ---------------------------------------

/** OLD REGIME slabs — individuals below 60 years. */
export const OLD_REGIME_SLABS: Slab[] = [
  { upto: 250_000, rate: 0 },
  { upto: 500_000, rate: 0.05 },
  { upto: 1_000_000, rate: 0.2 },
  { upto: Infinity, rate: 0.3 },
];

/** Senior citizen (60+ but < 80) old-regime slabs — ₹3L basic exemption. */
export const OLD_REGIME_SLABS_SENIOR: Slab[] = [
  { upto: 300_000, rate: 0 },
  { upto: 500_000, rate: 0.05 },
  { upto: 1_000_000, rate: 0.2 },
  { upto: Infinity, rate: 0.3 },
];

/** Super senior (80+) old-regime slabs — ₹5L basic exemption. */
export const OLD_REGIME_SLABS_SUPER_SENIOR: Slab[] = [
  { upto: 500_000, rate: 0 },
  { upto: 1_000_000, rate: 0.2 },
  { upto: Infinity, rate: 0.3 },
];

/** Old-regime slab table by taxpayer age: 80+ super senior, 60-79 senior, else regular. */
export function getOldRegimeSlabs(age: NumLike): Slab[] {
  const a = Number(age) || 0;
  if (a >= 80) return OLD_REGIME_SLABS_SUPER_SENIOR;
  if (a >= 60) return OLD_REGIME_SLABS_SENIOR;
  return OLD_REGIME_SLABS;
}

/** NEW REGIME (Section 115BAC) — Budget 2024 slabs for FY 2024-25. */
export const NEW_REGIME_SLABS_FY_2024_25: Slab[] = [
  { upto: 300_000, rate: 0 },
  { upto: 700_000, rate: 0.05 },
  { upto: 1_000_000, rate: 0.1 },
  { upto: 1_200_000, rate: 0.15 },
  { upto: 1_500_000, rate: 0.2 },
  { upto: Infinity, rate: 0.3 },
];

/** NEW REGIME — Budget 2025 slabs for FY 2025-26. */
export const NEW_REGIME_SLABS_FY_2025_26: Slab[] = [
  { upto: 400_000, rate: 0 },
  { upto: 800_000, rate: 0.05 },
  { upto: 1_200_000, rate: 0.1 },
  { upto: 1_600_000, rate: 0.15 },
  { upto: 2_000_000, rate: 0.2 },
  { upto: 2_400_000, rate: 0.25 },
  { upto: Infinity, rate: 0.3 },
];

/** Backward-compat alias: the CURRENT_FY's new-regime table. */
export const NEW_REGIME_SLABS: Slab[] = CURRENT_FY === '2025-26' ? NEW_REGIME_SLABS_FY_2025_26 : NEW_REGIME_SLABS_FY_2024_25;

/** New-regime slab table for a given FY. */
export function getNewRegimeSlabs(fy: string = CURRENT_FY): Slab[] {
  if (fy === '2025-26') return NEW_REGIME_SLABS_FY_2025_26;
  return NEW_REGIME_SLABS_FY_2024_25; // FY 24-25 and earlier
}

/** 87A rebate parameters per regime and FY. */
export function get87AConfig(regime: Regime, fy: string = CURRENT_FY): { threshold: number; cap: number } {
  if (regime === 'old') {
    return { threshold: 500_000, cap: 12_500 };
  }
  if (fy === '2025-26') return { threshold: 1_200_000, cap: 60_000 };
  return { threshold: 700_000, cap: 25_000 }; // FY 24-25
}

export interface CapitalGainsConfig {
  stcgRate: number;
  ltcgRate: number;
  ltcgExemption: number;
  preTransition: { stcgRate: number; ltcgRate: number; ltcgExemption: number };
}

/**
 * Capital gains rates (changed 23-Jul-2024): §111A STCG 20%, §112A LTCG 12.5%
 * over ₹1.25L. FY 2024-25 defaults to the newer (higher) rates.
 */
export function getCapitalGainsConfig(fy: string = CURRENT_FY): CapitalGainsConfig {
  if (fy === '2024-25') {
    return {
      stcgRate: 0.2,
      ltcgRate: 0.125,
      ltcgExemption: 125_000,
      preTransition: { stcgRate: 0.15, ltcgRate: 0.1, ltcgExemption: 100_000 },
    };
  }
  return {
    stcgRate: 0.2,
    ltcgRate: 0.125,
    ltcgExemption: 125_000,
    preTransition: { stcgRate: 0.15, ltcgRate: 0.1, ltcgExemption: 100_000 },
  };
}

/** Deduction caps under the OLD regime (static maximums). */
export const DEDUCTION_CAPS = {
  '80C': 150_000, // PPF, ELSS, LIC, EPF, tuition, home-loan principal, ULIP, NSC
  '80CCD1B': 50_000, // Additional NPS (employee contribution beyond ₹1.5L 80C)
  '80D': 100_000, // MAXIMUM only when BOTH self+family AND parents are seniors
  '80TTA': 10_000, // Savings-account interest (individuals below 60)
  '80TTB': 50_000, // Bank/PO deposit interest (senior citizens 60+)
  '80E': Infinity, // Education loan interest — no cap
  '80G': Infinity, // Donations
  '80GG': 60_000, // Rent paid when HRA not received
  '80DDB': 100_000, // Specified serious illness (₹1L for seniors, ₹40k otherwise)
  '80U': 125_000, // Self-disability (₹75k / ₹1.25L for severe)
  '24b': 200_000, // Home-loan interest on self-occupied property
} as const;

export type DeductionSection = keyof typeof DEDUCTION_CAPS;

/** Claimed deductions by section; '80CCD2' (employer NPS) is allowed in both regimes. */
export type Deductions = Partial<Record<DeductionSection | '80CCD2', NumLike>>;

export interface DeductionContext {
  selfSenior?: boolean;
  parentsSenior?: boolean;
  salary?: NumLike;
  isGovtEmployee?: boolean;
}

/** Actual cap for a section given the family's senior status (80D, 80DDB, 80TTA/80TTB). */
export function effectiveDeductionCap(section: string, ctx: DeductionContext = {}): number {
  const s = String(section || '').toUpperCase();
  if (s === '80D') {
    const selfCap = ctx.selfSenior ? 50_000 : 25_000;
    const parentsCap = ctx.parentsSenior ? 50_000 : 25_000;
    return selfCap + parentsCap;
  }
  if (s === '80DDB') {
    return ctx.selfSenior ? 100_000 : 40_000;
  }
  // 80TTA is only for under-60s and 80TTB only for 60+.
  if (s === '80TTA') return ctx.selfSenior ? 0 : DEDUCTION_CAPS['80TTA'];
  if (s === '80TTB') return ctx.selfSenior ? DEDUCTION_CAPS['80TTB'] : 0;
  return (DEDUCTION_CAPS as Record<string, number>)[section] ?? Infinity;
}

// -------------------------- Tax calculation ---------------------------------

/** Apply a slab table to a taxable-income figure (tax before rebate / cess / surcharge). */
export function computeSlabTax(taxableIncome: number, slabs: Slab[]): number {
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) return 0;
  let remaining = taxableIncome;
  let lower = 0;
  let tax = 0;
  for (const slab of slabs) {
    const width = slab.upto - lower;
    const slice = Math.min(remaining, width);
    if (slice <= 0) break;
    tax += slice * slab.rate;
    remaining -= slice;
    lower = slab.upto;
    if (remaining <= 0) break;
  }
  return round2(tax);
}

export interface SurchargeOptions {
  /** Tax attributable to 111A / 112A / 115AD (surcharge on it is capped at 15%). */
  specialRateTax?: NumLike;
  /** Tax if total income were `total` instead; enables the exact marginal-relief test. */
  taxAt?: (total: number) => number;
}

function surchargeTier(income: number, regime: Regime): number {
  if (income <= 10_000_000) return 0.1;
  if (income <= 20_000_000) return 0.15;
  if (income <= 50_000_000) return 0.25;
  return regime === 'new' ? 0.25 : 0.37;
}

/**
 * Surcharge on tax by total income, with the 15% cap on special-rate tax and
 * marginal relief at each threshold (₹50L, ₹1Cr, ₹2Cr, ₹5Cr).
 */
export function computeSurcharge(tax: number, totalIncome: number, regime: Regime = 'new', opts: SurchargeOptions = {}): number {
  if (!Number.isFinite(totalIncome)) return 0;
  if (totalIncome <= 5_000_000) return 0;

  const tierRate = surchargeTier(totalIncome, regime);
  const specialTax = Math.max(0, Number(opts.specialRateTax) || 0);
  const cappedSpecialRate = Math.min(tierRate, 0.15);
  const regularTax = Math.max(0, tax - specialTax);
  const rawSurcharge = regularTax * tierRate + specialTax * cappedSpecialRate;

  // Marginal relief: extra tax + surcharge from crossing a threshold cannot
  // exceed the extra income beyond it.
  const thresholds = [50_000_000, 20_000_000, 10_000_000, 5_000_000];
  let applicableThreshold = 0;
  for (const th of thresholds) {
    if (totalIncome > th) {
      applicableThreshold = th;
      break;
    }
  }
  if (applicableThreshold === 0) return round2(rawSurcharge);

  // Surcharge that would apply if income were exactly at the threshold.
  const surchargeAtThreshold = applicableThreshold === 5_000_000 ? 0 : computeSurchargeInner(tax, applicableThreshold - 1, regime, opts);

  const extraIncome = totalIncome - applicableThreshold;
  // With the tax at the threshold known: tax + surcharge now may exceed tax +
  // surcharge at the threshold by no more than the extra income.
  if (typeof opts.taxAt === 'function') {
    const taxAtT = Math.max(0, Number(opts.taxAt(applicableThreshold)) || 0);
    const surchargeAtT =
      applicableThreshold === 5_000_000
        ? 0
        : computeSurchargeInner(taxAtT, applicableThreshold, regime, { specialRateTax: Math.min(specialTax, taxAtT) });
    const ceiling = taxAtT + surchargeAtT + extraIncome;
    if (tax + rawSurcharge > ceiling) return round2(Math.max(0, ceiling - tax));
    return round2(rawSurcharge);
  }
  const extraTaxBurden = rawSurcharge - surchargeAtThreshold;
  if (extraTaxBurden > extraIncome) {
    const cappedSurcharge = surchargeAtThreshold + extraIncome;
    return round2(Math.max(0, cappedSurcharge));
  }
  return round2(rawSurcharge);
}

// Same math as computeSurcharge but without the marginal-relief guard.
function computeSurchargeInner(tax: number, totalIncome: number, regime: Regime, opts: SurchargeOptions): number {
  if (totalIncome <= 5_000_000) return 0;
  const tierRate = surchargeTier(totalIncome, regime);
  const specialTax = Math.max(0, Number(opts.specialRateTax) || 0);
  const cappedSpecialRate = Math.min(tierRate, 0.15);
  const regularTax = Math.max(0, tax - specialTax);
  return regularTax * tierRate + specialTax * cappedSpecialRate;
}

/**
 * Section 87A rebate. Eligibility uses TOTAL income (including 111A / 112A
 * gains). New regime: marginal relief just above the threshold, given as part
 * of the rebate (tax on slab income capped at the excess over the threshold).
 * The old regime has no such relief.
 */
export function computeRebate87A(totalIncome: number, tax: number, regime: Regime = 'new', fy: string = CURRENT_FY): number {
  const { threshold, cap } = get87AConfig(regime, fy);
  if (totalIncome <= threshold) return Math.min(tax, cap);
  if (regime === 'new') {
    const excess = totalIncome - threshold;
    if (tax > excess) return round2(tax - excess);
  }
  return 0;
}

/** Health & Education Cess — 4% on (tax + surcharge − rebate). */
export function computeCess(taxAfterRebateAndSurcharge: number): number {
  return round2(Math.max(0, taxAfterRebateAndSurcharge) * 0.04);
}

/** Standard deduction on salary: old ₹50,000, new ₹75,000. */
export function standardDeduction(regime: Regime = 'new'): number {
  return regime === 'new' ? 75_000 : 50_000;
}

/**
 * Cap each declared deduction to its statutory limit and return the sum.
 * New regime: only 80CCD(2), capped at 10% of salary (14% for govt employees).
 */
export function computeAllowedDeductions(userDeductions: Deductions = {}, regime: Regime = 'old', ctx: DeductionContext = {}): number {
  const salary = Math.max(0, Number(ctx.salary) || 0);
  const nps2Rate = ctx.isGovtEmployee ? 0.14 : 0.1;
  const nps2Cap = salary * nps2Rate;
  const rawNps2 = Number(userDeductions['80CCD2']) || 0;
  const allowedNps2 = Math.min(rawNps2, nps2Cap);

  if (regime === 'new') {
    return round2(allowedNps2);
  }

  let total = 0;
  for (const section of Object.keys(DEDUCTION_CAPS) as DeductionSection[]) {
    const claimed = Number(userDeductions[section]) || 0;
    const cap = effectiveDeductionCap(section, ctx);
    total += Math.min(claimed, cap);
  }
  total += allowedNps2;
  return round2(total);
}

export interface TaxInputs {
  /** Gross salary (Form 16). */
  salary?: number;
  /** Business / professional income (P&L bottom line or presumptive). */
  businessIncome?: number;
  /** Rent minus 30% standard deduction minus §24(b) interest. */
  housePropertyIncome?: number;
  /** Bank interest, dividends, etc. */
  otherSources?: number;
  /** STCG on listed equity (§111A, 20% flat). */
  stcgAtSpecialRate?: number;
  /** LTCG on listed equity (§112A, 12.5% over ₹1.25L). */
  ltcgAtSpecialRate?: number;
  deductions?: Deductions;
  regime?: Regime;
  fy?: string;
  age?: number;
  selfSenior?: boolean;
  parentsSenior?: boolean;
  isGovtEmployee?: boolean;
}

export interface TaxResult {
  fy: string;
  grossTotalIncome: number;
  salaryAfterStd: number;
  standardDeduction: number;
  allowedDeductions: number;
  taxableIncome: number;
  slabTax: number;
  stcgTax: number;
  ltcgTax: number;
  specialRateTax: number;
  taxBeforeRebate: number;
  rebate87A: number;
  taxAfterRebate: number;
  surcharge: number;
  cess: number;
  totalTax: number;
  regime: Regime;
}

/** End-to-end tax computation for one regime. */
export function computeTax(inputs: TaxInputs): TaxResult {
  const {
    salary = 0,
    businessIncome = 0,
    housePropertyIncome = 0,
    otherSources = 0,
    stcgAtSpecialRate = 0,
    ltcgAtSpecialRate = 0,
    deductions = {},
    regime = 'new',
    fy = CURRENT_FY,
    age = 0,
    selfSenior = false,
    parentsSenior = false,
    isGovtEmployee = false,
  } = inputs;

  // Standard deduction only applies against salary income
  const stdDed = salary > 0 ? Math.min(salary, standardDeduction(regime)) : 0;
  const salaryAfterStd = Math.max(0, salary - stdDed);

  // Gross Total Income = sum of heads (excludes special-rate gains)
  const gti = salaryAfterStd + businessIncome + housePropertyIncome + otherSources;

  const deductionCtx: DeductionContext = { selfSenior, parentsSenior, salary, isGovtEmployee };
  const allowedDeductions = computeAllowedDeductions(deductions, regime, deductionCtx);

  const taxableIncome = Math.max(0, gti - allowedDeductions);

  const slabs = regime === 'new' ? getNewRegimeSlabs(fy) : getOldRegimeSlabs(age);
  const slabTax = computeSlabTax(taxableIncome, slabs);

  const cgConfig = getCapitalGainsConfig(fy);
  const stcgTax = round2(stcgAtSpecialRate * cgConfig.stcgRate);
  const ltcgTaxable = Math.max(0, ltcgAtSpecialRate - cgConfig.ltcgExemption);
  const ltcgTax = round2(ltcgTaxable * cgConfig.ltcgRate);
  const specialRateTax = stcgTax + ltcgTax;

  const taxBeforeRebate = slabTax + specialRateTax;

  // 87A eligibility uses total income (gross 111A / 112A gains); the rebate
  // itself applies only to slab tax.
  const totalIncomeForRebate = taxableIncome + stcgAtSpecialRate + ltcgAtSpecialRate;
  const rebate = computeRebate87A(totalIncomeForRebate, slabTax, regime, fy);
  const taxAfterRebate = Math.max(0, taxBeforeRebate - rebate);

  const totalIncomeForSurcharge = taxableIncome + stcgAtSpecialRate + ltcgAtSpecialRate;
  // Tax if total income were `total` instead, for surcharge marginal relief.
  const taxAt = (total: number) => {
    const slabIncome = Math.max(0, taxableIncome - (totalIncomeForSurcharge - total));
    const t = computeSlabTax(slabIncome, slabs);
    return Math.max(0, t + specialRateTax - computeRebate87A(total, t, regime, fy));
  };
  const surcharge = computeSurcharge(taxAfterRebate, totalIncomeForSurcharge, regime, { specialRateTax, taxAt });

  const cess = computeCess(taxAfterRebate + surcharge);
  const totalTax = round2(taxAfterRebate + surcharge + cess);

  return {
    fy,
    grossTotalIncome: round2(gti),
    salaryAfterStd: round2(salaryAfterStd),
    standardDeduction: round2(stdDed),
    allowedDeductions: round2(allowedDeductions),
    taxableIncome: round2(taxableIncome),
    slabTax: round2(slabTax),
    stcgTax: round2(stcgTax),
    ltcgTax: round2(ltcgTax),
    specialRateTax: round2(specialRateTax),
    taxBeforeRebate: round2(taxBeforeRebate),
    rebate87A: round2(rebate),
    taxAfterRebate: round2(taxAfterRebate),
    surcharge: round2(surcharge),
    cess: round2(cess),
    totalTax,
    regime,
  };
}

export interface RegimeComparison {
  old: TaxResult;
  new: TaxResult;
  savings: number;
  recommended: Regime;
}

/** Old-vs-New side by side. Recommends the cheaper regime; a tie goes to NEW (the default). */
export function compareRegimes(inputs: TaxInputs): RegimeComparison {
  const old_ = computeTax({ ...inputs, regime: 'old' });
  const new_ = computeTax({ ...inputs, regime: 'new' });
  const savings = new_.totalTax - old_.totalTax;
  const recommended: Regime = savings > 0.5 ? 'old' : 'new';
  return { old: old_, new: new_, savings: round2(Math.abs(savings)), recommended };
}

// -------------------------- Bank-statement helpers ---------------------------

export type BankCategory =
  | 'salary'
  | 'business_in'
  | 'business_out'
  | 'interest'
  | 'rent_received'
  | 'investment'
  | 'deduction_80C'
  | 'deduction_80D'
  | 'gst_paid'
  | 'transfer'
  | 'personal';

/** Rule-based auto-categorisation of bank narrations. First match wins. */
export const AUTO_CATEGORY_RULES: Array<{ pattern: RegExp; category: BankCategory }> = [
  { pattern: /\bsalary|sal\b|payroll/i, category: 'salary' },
  { pattern: /\bint\b|interest|savings interest|sb\s*int/i, category: 'interest' },
  // Rent PAID is checked before rent received: "office rent" also contains "rent".
  { pattern: /\brent paid|office rent/i, category: 'business_out' },
  { pattern: /\brent\b|rental/i, category: 'rent_received' },
  { pattern: /\bsip\b|mutual fund|elss|mf\b/i, category: 'investment' },
  { pattern: /\bppf|nps\b/i, category: 'investment' },
  { pattern: /\blic\b|life insurance/i, category: 'deduction_80C' },
  { pattern: /health insurance|mediclaim/i, category: 'deduction_80D' },
  { pattern: /\bgst\b|cgst|sgst|igst/i, category: 'gst_paid' },
  { pattern: /\bemi\b|home loan|housing loan/i, category: 'business_out' },
  { pattern: /electric|utility|broadband|internet|telephone/i, category: 'business_out' },
  { pattern: /aws|amazon web|azure|google cloud|adobe|figma/i, category: 'business_out' },
  { pattern: /amazon|flipkart|swiggy|zomato/i, category: 'personal' },
  { pattern: /\batm|cash withdrawal/i, category: 'personal' },
  { pattern: /\bimps|neft|rtgs|upi/i, category: 'transfer' },
];

/** First matching category for a bank narration, else 'transfer'. */
export function autoCategorize(description: unknown): BankCategory {
  const d = String(description || '');
  for (const rule of AUTO_CATEGORY_RULES) {
    if (rule.pattern.test(d)) return rule.category;
  }
  return 'transfer';
}

// ------------------------- CSV parsers per bank ------------------------------

export interface BankTransaction {
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

type HeaderIndex = Record<string, number>;

interface BankFormat {
  name: string;
  match: (headers: string[]) => boolean;
  map: (row: string[], hIdx: HeaderIndex) => BankTransaction;
  headerMap: (headers: string[]) => HeaderIndex;
}

const mapStandard = (row: string[], hIdx: HeaderIndex): BankTransaction => ({
  date: row[hIdx.date],
  description: row[hIdx.description],
  debit: parseAmt(row[hIdx.debit]),
  credit: parseAmt(row[hIdx.credit]),
  balance: parseAmt(row[hIdx.balance]),
});

const BANK_FORMATS: BankFormat[] = [
  {
    name: 'SBI',
    match: (headers) => headers.some((h) => /Txn Date/i.test(h)) && headers.some((h) => /Value Date/i.test(h)),
    map: (row, hIdx) => ({
      date: row[hIdx.txnDate] || row[hIdx.valueDate],
      description: row[hIdx.description],
      debit: parseAmt(row[hIdx.debit]),
      credit: parseAmt(row[hIdx.credit]),
      balance: parseAmt(row[hIdx.balance]),
    }),
    headerMap: (headers) => ({
      txnDate: findCol(headers, /Txn Date/i),
      valueDate: findCol(headers, /Value Date/i),
      description: findCol(headers, /Description|Narration/i),
      debit: findCol(headers, /Debit/i),
      credit: findCol(headers, /Credit/i),
      balance: findCol(headers, /Balance/i),
    }),
  },
  {
    name: 'HDFC',
    match: (headers) => headers.some((h) => /Narration/i.test(h)) && headers.some((h) => /Withdrawal Amt/i.test(h)),
    map: mapStandard,
    headerMap: (headers) => ({
      date: findCol(headers, /Date/i),
      description: findCol(headers, /Narration/i),
      debit: findCol(headers, /Withdrawal Amt/i),
      credit: findCol(headers, /Deposit Amt/i),
      balance: findCol(headers, /Closing Balance/i),
    }),
  },
  {
    name: 'ICICI',
    match: (headers) => headers.some((h) => /Transaction Remarks/i.test(h)),
    map: mapStandard,
    headerMap: (headers) => ({
      date: findCol(headers, /Transaction Date|Value Date/i),
      description: findCol(headers, /Transaction Remarks|Description/i),
      debit: findCol(headers, /Withdrawal Amount|Debit/i),
      credit: findCol(headers, /Deposit Amount|Credit/i),
      balance: findCol(headers, /Balance/i),
    }),
  },
  {
    name: 'Axis',
    match: (headers) => headers.some((h) => /Tran Date/i.test(h)) && headers.some((h) => /Particulars/i.test(h)),
    map: mapStandard,
    headerMap: (headers) => ({
      date: findCol(headers, /Tran Date/i),
      description: findCol(headers, /Particulars/i),
      debit: findCol(headers, /Debit/i),
      credit: findCol(headers, /Credit/i),
      balance: findCol(headers, /Balance/i),
    }),
  },
  {
    name: 'Kotak',
    match: (headers) => headers.some((h) => /Chq\/Ref No/i.test(h)) || headers.some((h) => /Withdrawal\(Dr\)/i.test(h)),
    map: mapStandard,
    headerMap: (headers) => ({
      date: findCol(headers, /Date/i),
      description: findCol(headers, /Description|Narration/i),
      debit: findCol(headers, /Withdrawal|Debit/i),
      credit: findCol(headers, /Deposit|Credit/i),
      balance: findCol(headers, /Balance/i),
    }),
  },
  {
    name: 'PNB',
    match: (headers) => headers.some((h) => /Chq No/i.test(h)) && headers.some((h) => /Narration/i.test(h)),
    map: mapStandard,
    headerMap: (headers) => ({
      date: findCol(headers, /Transaction Date|Date/i),
      description: findCol(headers, /Narration/i),
      debit: findCol(headers, /Debit/i),
      credit: findCol(headers, /Credit/i),
      balance: findCol(headers, /Balance/i),
    }),
  },
  {
    name: 'Yes Bank',
    match: (headers) => headers.some((h) => /Chq No\.|Instrument No/i.test(h)) && headers.some((h) => /Value Date/i.test(h)),
    map: mapStandard,
    headerMap: (headers) => ({
      date: findCol(headers, /Transaction Date|Value Date/i),
      description: findCol(headers, /Description|Narration/i),
      debit: findCol(headers, /Debit/i),
      credit: findCol(headers, /Credit/i),
      balance: findCol(headers, /Balance/i),
    }),
  },
  // Fallback — best-effort column detection.
  {
    name: 'Generic',
    match: () => true,
    map: mapStandard,
    headerMap: (headers) => ({
      date: findCol(headers, /Date/i),
      description: findCol(headers, /Description|Narration|Particulars|Remarks/i),
      debit: findCol(headers, /Debit|Withdrawal|Dr/i),
      credit: findCol(headers, /Credit|Deposit|Cr/i),
      balance: findCol(headers, /Balance/i),
    }),
  },
];

/** Parse a bank-statement CSV: detected bank name plus categorised transactions. */
export function parseBankStatement(csvText: string): { bankName: string; transactions: Array<BankTransaction & { category: BankCategory }> } {
  const rows = parseCSV(csvText);
  if (rows.length < 2) throw new Error('CSV must have a header row + at least one transaction');
  // Find the actual header row — some banks prepend account-info lines
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i];
    if (r.some((c) => /date/i.test(c)) && r.some((c) => /balance|amount/i.test(c))) {
      headerRowIdx = i;
      break;
    }
  }
  const headers = rows[headerRowIdx];
  const dataRows = rows.slice(headerRowIdx + 1);

  // The Generic format matches everything, so a format is always found.
  const format = BANK_FORMATS.find((f) => f.match(headers)) as BankFormat;
  const hIdx = format.headerMap(headers);

  const transactions: Array<BankTransaction & { category: BankCategory }> = [];
  for (const r of dataRows) {
    if (!(r.length >= 3 && r.some((c) => c && String(c).trim()))) continue; // skip blank / footer rows
    const parsed = format.map(r, hIdx);
    if (!parsed.date) continue;
    transactions.push({ ...parsed, category: autoCategorize(parsed.description) });
  }

  return { bankName: format.name, transactions };
}

function parseCSV(text: string): string[][] {
  const lines = String(text || '').split(/\r?\n/);
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') inQuotes = false;
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') {
        row.push(cur);
        cur = '';
      } else cur += c;
    }
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function findCol(headers: string[], pattern: RegExp): number {
  return headers.findIndex((h) => pattern.test(String(h || '').trim()));
}

function parseAmt(v: NumLike): number {
  if (v === null || v === undefined || v === '') return 0;
  const cleaned = String(v).replace(/[₹,\s]/g, '').replace(/^-$/, '0');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// Presumptive taxation — Sections 44AD, 44ADA, 44AE
// ============================================================================

export interface PresumptiveResult {
  turnover?: number;
  digitalReceipts?: number;
  cashReceipts?: number;
  heavyIncome?: number;
  lightIncome?: number;
  deemedIncome: number;
  presumptiveIncome: number;
  isEligible: boolean;
  section: '44AD' | '44ADA' | '44AE';
  threshold?: number;
  notes: string[];
}

export interface ReceiptsInput {
  digitalReceipts?: NumLike;
  cashReceipts?: NumLike;
  declaredIncome?: NumLike;
}

/**
 * Section 44AD — traders / retailers / manufacturers. Limit ₹2Cr (₹3Cr if cash
 * receipts ≤ 5% of turnover). Deemed income 6% of digital + 8% of cash
 * receipts; a higher declared income is used if given.
 */
export function compute44AD({ digitalReceipts = 0, cashReceipts = 0, declaredIncome }: ReceiptsInput): PresumptiveResult {
  const digital = Math.max(0, Number(digitalReceipts) || 0);
  const cash = Math.max(0, Number(cashReceipts) || 0);
  const turnover = digital + cash;
  const notes: string[] = [];

  const cashPct = turnover > 0 ? cash / turnover : 0;
  const threshold = cashPct <= 0.05 ? 30_000_000 : 20_000_000;
  const isEligible = turnover <= threshold;
  if (!isEligible) {
    notes.push(
      `Turnover of ${formatINR(turnover)} exceeds the §44AD limit of ${formatINR(threshold)}. You must maintain regular books and file ITR-3 with a Tax Audit Report (§44AB).`,
    );
  }
  // The cash share only matters once turnover is above ₹2Cr.
  if (cashPct > 0.05 && turnover > 20_000_000 && turnover <= 30_000_000) {
    notes.push(
      `${(cashPct * 100).toFixed(1)}% of your turnover is in cash — above the 5% threshold. Reduce cash receipts to qualify for the ₹3Cr limit.`,
    );
  }

  const deemed = round2(digital * 0.06 + cash * 0.08);
  const finalIncome = Math.max(deemed, Number(declaredIncome) || 0);

  if (Number(declaredIncome) && Number(declaredIncome) < deemed) {
    notes.push(
      `Declared income (${formatINR(declaredIncome)}) is less than the presumptive minimum (${formatINR(deemed)}). Assessee must maintain full books and file ITR-3.`,
    );
  }

  return {
    turnover: round2(turnover),
    digitalReceipts: round2(digital),
    cashReceipts: round2(cash),
    deemedIncome: deemed,
    presumptiveIncome: round2(finalIncome),
    isEligible,
    section: '44AD',
    threshold,
    notes,
  };
}

/**
 * Section 44ADA — professionals. Limit ₹50L (₹75L if cash receipts ≤ 5%).
 * Deemed income 50% of gross receipts.
 */
export function compute44ADA({ digitalReceipts = 0, cashReceipts = 0, declaredIncome }: ReceiptsInput): PresumptiveResult {
  const digital = Math.max(0, Number(digitalReceipts) || 0);
  const cash = Math.max(0, Number(cashReceipts) || 0);
  const turnover = digital + cash;
  const notes: string[] = [];

  const cashPct = turnover > 0 ? cash / turnover : 0;
  const threshold = cashPct <= 0.05 ? 7_500_000 : 5_000_000;
  const isEligible = turnover <= threshold;
  if (!isEligible) {
    notes.push(`Gross receipts of ${formatINR(turnover)} exceed the §44ADA limit of ${formatINR(threshold)}. Full books + ITR-3 + audit (§44AB) apply.`);
  }

  const deemed = round2(turnover * 0.5);
  const finalIncome = Math.max(deemed, Number(declaredIncome) || 0);

  if (Number(declaredIncome) && Number(declaredIncome) < deemed) {
    notes.push(`Declared income is below 50% of gross receipts. Full books required.`);
  }

  return {
    turnover: round2(turnover),
    digitalReceipts: round2(digital),
    cashReceipts: round2(cash),
    deemedIncome: deemed,
    presumptiveIncome: round2(finalIncome),
    isEligible,
    section: '44ADA',
    threshold,
    notes,
  };
}

export interface VehiclesInput {
  heavyVehicleMonths?: NumLike;
  heavyVehicleTonnage?: NumLike;
  lightVehicleMonths?: NumLike;
  declaredIncome?: NumLike;
}

/**
 * Section 44AE — goods carriages (≤ 10 vehicles). Deemed income per vehicle
 * per month: heavy (> 12,000 kg) ₹1,000 per tonne; light ₹7,500 flat.
 */
export function compute44AE({ heavyVehicleMonths = 0, heavyVehicleTonnage = 0, lightVehicleMonths = 0, declaredIncome }: VehiclesInput): PresumptiveResult {
  const hMonths = Math.max(0, Number(heavyVehicleMonths) || 0);
  const hTonnes = Math.max(0, Number(heavyVehicleTonnage) || 0);
  const lMonths = Math.max(0, Number(lightVehicleMonths) || 0);
  const heavy = round2(hMonths * hTonnes * 1000);
  const light = round2(lMonths * 7500);
  const deemed = heavy + light;
  const finalIncome = Math.max(deemed, Number(declaredIncome) || 0);

  const notes: string[] = [];
  // (vehicle-months / 12) approximates the fleet size; a proxy for the
  // "more than 10 vehicles at any time" disqualifier.
  const impliedFleet = (hMonths + lMonths) / 12;
  const isEligible = impliedFleet <= 10.0001;
  if (!isEligible) {
    notes.push(
      `Implied fleet size ≈ ${impliedFleet.toFixed(1)} vehicles exceeds the §44AE cap of 10 goods carriages. Assessee must maintain regular books and file ITR-3 with a §44AB audit report.`,
    );
  }
  if (Number(declaredIncome) && Number(declaredIncome) < deemed) {
    notes.push(
      `Declared income (${formatINR(declaredIncome)}) is less than the presumptive minimum (${formatINR(deemed)}). Assessee must maintain full books and file ITR-3.`,
    );
  }

  return {
    heavyIncome: heavy,
    lightIncome: light,
    deemedIncome: deemed,
    presumptiveIncome: round2(finalIncome),
    isEligible,
    section: '44AE',
    notes,
  };
}

// ============================================================================
// Advance Tax — Sections 208, 234B, 234C
// ============================================================================

export interface AdvanceInstallment {
  installment: number;
  dueDate: string;
  cumulativePct: number;
  label: string;
}

/** The four advance-tax due dates for an FY: 15 Jun (15%), 15 Sep (45%), 15 Dec (75%), 15 Mar (100%). */
export function getAdvanceTaxSchedule(fy: string = CURRENT_FY): AdvanceInstallment[] {
  const startYear = Number(String(fy).split('-')[0]);
  if (!Number.isFinite(startYear)) {
    throw new Error(`Invalid FY: ${fy}. Expected format YYYY-YY (e.g. "2025-26").`);
  }
  const endYear = startYear + 1;
  return [
    { installment: 1, dueDate: `${startYear}-06-15`, cumulativePct: 0.15, label: 'By 15 June' },
    { installment: 2, dueDate: `${startYear}-09-15`, cumulativePct: 0.45, label: 'By 15 Sept' },
    { installment: 3, dueDate: `${startYear}-12-15`, cumulativePct: 0.75, label: 'By 15 Dec' },
    { installment: 4, dueDate: `${endYear}-03-15`, cumulativePct: 1.0, label: 'By 15 March' },
  ];
}

/** Backward-compat: the CURRENT_FY schedule. */
export const ADVANCE_TAX_SCHEDULE = getAdvanceTaxSchedule(CURRENT_FY);

export interface TaxPayment {
  /** YYYY-MM-DD */
  date: string;
  amount: NumLike;
}

export interface ScheduleRow extends AdvanceInstallment {
  installmentDue: number;
  cumulativeDue: number;
  totalPaidByDue: number;
  shortfall: number;
}

export interface AdvanceTaxScheduleResult {
  applies: boolean;
  netLiability: number;
  note?: string;
  totalPaid?: number;
  paidByYearEnd?: number;
  totalOutstanding?: number;
  schedule: ScheduleRow[];
  mode?: AdvanceTaxMode;
  fy?: string;
}

/**
 * Advance-tax schedule after TDS. Applies only when the net liability is
 * ₹10,000 or more. Presumptive mode (44AD / 44ADA) is one 100% instalment by 15 March.
 */
export function computeAdvanceTaxSchedule(
  totalTax: number,
  tdsAlreadyDeducted: NumLike = 0,
  paid: TaxPayment[] = [],
  mode: AdvanceTaxMode = 'regular',
  fy: string = CURRENT_FY,
): AdvanceTaxScheduleResult {
  const netLiability = Math.max(0, totalTax - (Number(tdsAlreadyDeducted) || 0));
  if (netLiability < 10_000) {
    return {
      netLiability,
      applies: false,
      note: 'Net liability (after TDS) is below ₹10,000 — no advance tax required.',
      schedule: [],
      fy,
    };
  }
  const schedule = getAdvanceTaxSchedule(fy);
  const base = mode === 'presumptive' ? [schedule[3]] : schedule;
  const rows: ScheduleRow[] = base.map((row, i, arr) => {
    const cumulativeDue = round2(netLiability * row.cumulativePct);
    const totalPaidByDue = paid.filter((p) => p.date <= row.dueDate).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const shortfall = Math.max(0, cumulativeDue - totalPaidByDue);
    const prevCumulative = mode === 'presumptive' ? 0 : arr[i - 1]?.cumulativePct || 0;
    const installmentDue = round2(netLiability * (row.cumulativePct - prevCumulative));
    return { ...row, installmentDue, cumulativeDue, totalPaidByDue, shortfall };
  });
  const totalPaid = paid.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  // Advance tax is what is paid by 31 March; §234B looks only at that.
  const yearEnd = `${Number(String(fy).split('-')[0]) + 1}-03-31`;
  const paidByYearEnd = paid.filter((p) => p.date && p.date <= yearEnd).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return {
    applies: true,
    netLiability,
    totalPaid: round2(totalPaid),
    paidByYearEnd: round2(paidByYearEnd),
    totalOutstanding: round2(Math.max(0, netLiability - totalPaid)),
    schedule: rows,
    mode,
    fy,
  };
}

/** Rule 119A: interest is computed on the amount rounded DOWN to the nearest ₹100. */
function rule119A(amount: NumLike): number {
  return Math.floor(Math.max(0, Number(amount) || 0) / 100) * 100;
}

/**
 * Section 234C — shortfall in instalments. 1% × 3 months for instalments 1-3
 * (waived if ≥ 12% paid by 15 Jun / ≥ 36% by 15 Sep), 1% × 1 month for the
 * fourth. Presumptive: one 15-March instalment, 1% × 1 month.
 */
export function compute234CInterest(schedule: AdvanceTaxScheduleResult): number {
  if (!schedule.applies || !schedule.schedule.length) return 0;
  const netLiab = schedule.netLiability;
  if (schedule.mode === 'presumptive' || schedule.schedule.length === 1) {
    const only = schedule.schedule[0];
    const shortfall = rule119A(netLiab - (only?.totalPaidByDue || 0));
    return round2(shortfall * 0.01);
  }
  let interest = 0;
  const [i1, i2, i3, i4] = schedule.schedule;
  if (i1 && i1.totalPaidByDue < 0.12 * netLiab) {
    const shortfall = rule119A(netLiab * 0.15 - i1.totalPaidByDue);
    interest += shortfall * 0.03;
  }
  if (i2 && i2.totalPaidByDue < 0.36 * netLiab) {
    const shortfall = rule119A(netLiab * 0.45 - i2.totalPaidByDue);
    interest += shortfall * 0.03;
  }
  if (i3) {
    const shortfall = rule119A(netLiab * 0.75 - i3.totalPaidByDue);
    interest += shortfall * 0.03;
  }
  if (i4) {
    const shortfall = rule119A(netLiab - i4.totalPaidByDue);
    interest += shortfall * 0.01;
  }
  return round2(interest);
}

/** A YYYY-MM-DD string as a local calendar date (other strings via Date). Empty → today. */
function toLocalDate(value: string | undefined): Date {
  if (!value) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** Calendar months from `from` to `to`, any part of a month counting as a whole one (minimum 1). */
function monthsCounted(from: Date, to: Date): number {
  const yearDiff = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  let months = yearDiff * 12 + monthDiff;
  if (to.getDate() > from.getDate()) months += 1;
  return Math.max(1, months);
}

/**
 * Section 234A — late filing. 1% per month (part month = full month) on the
 * tax still unpaid, from the day after the due date to the filing date.
 * Due date defaults to 31 July of the assessment year; pass 31 October for audit cases.
 */
export function compute234AInterest(netTaxPayable: NumLike, taxPaid: NumLike, filingDate?: string, dueDate?: string, fy: string = CURRENT_FY): number {
  const outstanding = Math.max(0, (Number(netTaxPayable) || 0) - (Number(taxPaid) || 0));
  if (outstanding <= 0) return 0;
  let due: Date;
  if (dueDate) {
    due = toLocalDate(dueDate);
  } else {
    const startYear = Number(String(fy).split('-')[0]);
    if (!Number.isFinite(startYear)) return 0;
    due = toLocalDate(`${startYear + 1}-07-31`);
  }
  const filed = toLocalDate(filingDate);
  if (!(filed > due)) return 0;
  const months = monthsCounted(due, filed);
  const shortfall = rule119A(outstanding);
  return round2(shortfall * 0.01 * months);
}

/**
 * Section 234B — advance tax paid by 31 March below 90% of the assessed tax.
 * 1% per month from 1 April of the assessment year until the payment date.
 */
export function compute234BInterest(schedule: AdvanceTaxScheduleResult, assessmentPaymentDate?: string, fy?: string): number {
  if (!schedule.applies) return 0;
  // Only advance tax paid by 31 March counts towards the 90% test.
  const paidByYearEnd = schedule.paidByYearEnd ?? schedule.totalPaid ?? 0;
  const netLiab = schedule.netLiability;
  if (paidByYearEnd >= 0.9 * netLiab) return 0;
  const shortfall = rule119A(netLiab - paidByYearEnd);
  const useFy = schedule?.fy || fy || CURRENT_FY;
  const startYear = Number(String(useFy).split('-')[0]);
  if (!Number.isFinite(startYear)) return 0;
  const fyEnd = toLocalDate(`${startYear + 1}-04-01`);
  const payDate = toLocalDate(assessmentPaymentDate);
  if (payDate <= fyEnd) return 0;
  const months = monthsCounted(fyEnd, payDate);
  return round2(shortfall * 0.01 * months);
}

// ============================================================================
// ITR-4 field mapping (AY 2025-26 layout)
// ============================================================================

export interface Itr4Row {
  section: string;
  field: string;
  value: number | string;
  note?: string;
  bold?: boolean;
  big?: boolean;
}

export interface Itr4Inputs {
  salary?: NumLike;
  housePropertyIncome?: NumLike;
  businessIncome?: NumLike;
  otherSources?: NumLike;
  age?: NumLike;
  parentsSenior?: boolean;
}

/** Build the ITR-4 field list from computed tax + presumptive income + deductions. */
export function buildITR4FieldMap(
  inputs: Itr4Inputs,
  tax: TaxResult,
  presumptive: PresumptiveResult | null | undefined,
  deductions: Deductions | null | undefined,
  pan = '',
): Itr4Row[] {
  const rows: Itr4Row[] = [];
  const panText = String(pan || '').trim().toUpperCase();
  rows.push(
    panText
      ? { section: 'Part A — General', field: 'PAN', value: panText }
      : { section: 'Part A — General', field: 'PAN', value: '', note: 'Fill from your profile' },
  );
  rows.push({ section: 'Part A — General', field: 'Filing Status', value: 'Filed under §139(1) — before due date' });
  rows.push({ section: 'Part A — General', field: 'Aadhaar', value: '', note: 'Must be linked' });

  if (presumptive?.section === '44AD') {
    rows.push({ section: 'Part A — Nature of Business', field: 'Section 44AD (Trading / Retail / Manufacturing)', value: 'Yes' });
    rows.push({ section: 'Part A — Nature of Business', field: 'Gross Turnover (digital)', value: presumptive.digitalReceipts ?? 0 });
    rows.push({ section: 'Part A — Nature of Business', field: 'Gross Turnover (cash)', value: presumptive.cashReceipts ?? 0 });
  } else if (presumptive?.section === '44ADA') {
    rows.push({ section: 'Part A — Nature of Business', field: 'Section 44ADA (Profession)', value: 'Yes' });
    rows.push({ section: 'Part A — Nature of Business', field: 'Gross Receipts', value: presumptive.turnover ?? 0 });
  } else if (presumptive?.section === '44AE') {
    rows.push({ section: 'Part A — Nature of Business', field: 'Section 44AE (Transport)', value: 'Yes' });
  }

  const salary = Number(inputs.salary) || 0;
  const std = tax.standardDeduction || 0;
  rows.push({ section: 'B — Income', field: 'B1. Salary (gross)', value: salary, note: salary > 0 ? 'From Form 16' : undefined });
  if (std) rows.push({ section: 'B — Income', field: '  Less: Standard Deduction', value: -std });
  rows.push({ section: 'B — Income', field: '  Net Salary', value: Math.max(0, salary - std) });
  rows.push({ section: 'B — Income', field: 'B2. House Property (net)', value: Number(inputs.housePropertyIncome) || 0 });
  rows.push({
    section: 'B — Income',
    field: 'B3. Business / Profession',
    value: presumptive?.presumptiveIncome ?? (Number(inputs.businessIncome) || 0),
    note: presumptive ? `Presumptive @ §${presumptive.section}` : 'From books',
  });
  rows.push({ section: 'B — Income', field: 'B4. Other Sources', value: Number(inputs.otherSources) || 0 });
  rows.push({ section: 'B — Income', field: 'B5. Gross Total Income', value: tax.grossTotalIncome, bold: true });

  if (tax.regime === 'old') {
    rows.push({ section: 'C — Deductions (Chapter VI-A)', field: '§80C', value: Math.min(150_000, Number(deductions?.['80C']) || 0) });
    rows.push({ section: 'C — Deductions (Chapter VI-A)', field: '§80CCD(1B) — NPS', value: Math.min(50_000, Number(deductions?.['80CCD1B']) || 0) });
    // Same age-dependent limit the tax figure used.
    const ageCtx = { selfSenior: Number(inputs?.age) >= 60, parentsSenior: !!inputs?.parentsSenior };
    const cap80D = effectiveDeductionCap('80D', ageCtx);
    rows.push({ section: 'C — Deductions (Chapter VI-A)', field: '§80D — Health Insurance', value: Math.min(cap80D, Number(deductions?.['80D']) || 0) });
    rows.push(
      ageCtx.selfSenior
        ? {
            section: 'C — Deductions (Chapter VI-A)',
            field: '§80TTB — Deposit Interest (60+)',
            value: Math.min(effectiveDeductionCap('80TTB', ageCtx), Number(deductions?.['80TTB']) || 0),
          }
        : {
            section: 'C — Deductions (Chapter VI-A)',
            field: '§80TTA — Savings Interest',
            value: Math.min(effectiveDeductionCap('80TTA', ageCtx), Number(deductions?.['80TTA']) || 0),
          },
    );
    rows.push({ section: 'C — Deductions (Chapter VI-A)', field: '§80E — Education Loan Interest', value: Number(deductions?.['80E']) || 0 });
    rows.push({ section: 'C — Deductions (Chapter VI-A)', field: '§80G — Donations', value: Number(deductions?.['80G']) || 0 });
    rows.push({ section: 'C — Deductions (Chapter VI-A)', field: '  Total Chapter VI-A', value: tax.allowedDeductions, bold: true });
  } else {
    rows.push({
      section: 'C — Deductions (Chapter VI-A)',
      field: '§80CCD(2) — Employer NPS',
      value: tax.allowedDeductions,
      note: 'Only deduction allowed under new regime',
    });
  }

  rows.push({ section: 'D — Tax Computation', field: 'D1. Taxable Income', value: tax.taxableIncome, bold: true });
  rows.push({ section: 'D — Tax Computation', field: 'D2. Tax on Total Income (slab)', value: tax.slabTax });
  if (tax.stcgTax) rows.push({ section: 'D — Tax Computation', field: '   + STCG (20%)', value: tax.stcgTax });
  if (tax.ltcgTax) rows.push({ section: 'D — Tax Computation', field: '   + LTCG (12.5%)', value: tax.ltcgTax });
  if (tax.rebate87A) rows.push({ section: 'D — Tax Computation', field: '   − §87A Rebate', value: -tax.rebate87A });
  if (tax.surcharge) rows.push({ section: 'D — Tax Computation', field: '   + Surcharge', value: tax.surcharge });
  rows.push({ section: 'D — Tax Computation', field: '   + Health & Ed Cess (4%)', value: tax.cess });
  rows.push({ section: 'D — Tax Computation', field: 'D3. TOTAL TAX PAYABLE', value: tax.totalTax, bold: true, big: true });

  return rows;
}

function formatINR(n: NumLike): string {
  const rounded = Math.round(Number(n) || 0);
  return '₹' + rounded.toLocaleString('en-IN');
}
