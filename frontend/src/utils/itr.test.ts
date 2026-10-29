// Port of the itr.js cases in scripts/tax-test.mjs from Free GST Billing Software
// (https://github.com/IamRamgarhia/Free-GST-Billing-Software, MIT, Copyright (c) 2026 DiceCodes).
// Cases that test other files of that app (invoices, GST returns, stock...) are left out.
import { describe, expect, it } from 'vitest';

import {
  AUTO_CATEGORY_RULES,
  buildITR4FieldMap,
  compute234AInterest,
  compute234BInterest,
  compute234CInterest,
  compute44AE,
  computeAdvanceTaxSchedule,
  computeAllowedDeductions,
  computeSurcharge,
  computeTax,
  effectiveDeductionCap,
  getAdvanceTaxSchedule,
  getCapitalGainsConfig,
  getOldRegimeSlabs,
  type AdvanceTaxScheduleResult,
} from './itr';

/** Same tolerance as the original harness: |actual - expected| < 0.01. */
function approx(actual: number, expected: number, tol = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThan(tol);
}

describe('[H8] 234C for presumptive: 1% × 1 month × Q4 shortfall', () => {
  it('234C = 1000 (single Q4 installment, 1% × 1 month)', () => {
    const sched = computeAdvanceTaxSchedule(100000, 0, [], 'presumptive');
    approx(compute234CInterest(sched), 1000);
  });
});

describe('[H9] Surcharge 15% cap on 111A/112A gains', () => {
  it('surcharge respects 15% cap on 111A/112A tax portion', () => {
    const s = computeSurcharge(1000000, 55000000, 'new', { specialRateTax: 15000 });
    approx(s, 248500);
  });
});

describe('[H10] 80D cap depends on senior status', () => {
  it('80D non-senior + non-senior parents = 50k', () => {
    approx(effectiveDeductionCap('80D', { selfSenior: false, parentsSenior: false }), 50_000);
  });
  it('80D non-senior + senior parents = 75k', () => {
    approx(effectiveDeductionCap('80D', { selfSenior: false, parentsSenior: true }), 75_000);
  });
  it('80D both senior = 100k', () => {
    approx(effectiveDeductionCap('80D', { selfSenior: true, parentsSenior: true }), 100_000);
  });
  it('80C untouched', () => {
    approx(effectiveDeductionCap('80C', {}), 150_000);
  });
});

describe('[M6] 234B uses calendar months (not 30-day months)', () => {
  it('Apr-1 to May-31 = 2 calendar months → 2000', () => {
    const sched: AdvanceTaxScheduleResult = { applies: true, netLiability: 100000, totalPaid: 0, fy: '2024-25', schedule: [] };
    approx(compute234BInterest(sched, '2025-05-31'), 2000);
  });
});

describe('[V31-C2] FY 25-26 new regime — Budget 2025 slabs + ₹60k rebate at ₹12L', () => {
  it('₹12.75L salary FY 25-26 new regime → ₹0 tax', () => {
    approx(computeTax({ salary: 1_275_000, regime: 'new', fy: '2025-26' }).totalTax, 0);
  });
  it('₹14L salary above rebate threshold → some tax', () => {
    expect(computeTax({ salary: 1_400_000, regime: 'new', fy: '2025-26' }).totalTax).toBeGreaterThan(0);
  });
});

describe('[V31-C4] Capital gains rates — STCG 20%, LTCG 12.5%, exempt ₹1.25L', () => {
  it('FY 25-26 rates', () => {
    const cg = getCapitalGainsConfig('2025-26');
    approx(cg.stcgRate, 0.2);
    approx(cg.ltcgRate, 0.125);
    approx(cg.ltcgExemption, 125_000);
  });
  it('₹10L LTCG → ₹1,09,375 tax at 12.5% over ₹1.25L exempt', () => {
    approx(computeTax({ ltcgAtSpecialRate: 1_000_000, regime: 'new', fy: '2025-26' }).ltcgTax, 109_375);
  });
  it('₹5L STCG → ₹1,00,000 tax at 20%', () => {
    approx(computeTax({ stcgAtSpecialRate: 500_000, regime: 'new', fy: '2025-26' }).stcgTax, 100_000);
  });
});

describe('[V31-C1] 15% surcharge cap on 111A/112A gains wired through computeTax', () => {
  const r = computeTax({ salary: 55_000_000, ltcgAtSpecialRate: 1_000_000, regime: 'new', fy: '2025-26' });
  it('specialRateTax populated', () => {
    expect(r.specialRateTax).toBeGreaterThan(0);
  });
  it('surcharge computed', () => {
    expect(r.surcharge).toBeGreaterThan(0);
  });
  it('15% cap on specialRateTax portion honored', () => {
    const specialSurcharge = computeSurcharge(r.specialRateTax, 55_000_000, 'new', { specialRateTax: r.specialRateTax });
    approx(specialSurcharge, r.specialRateTax * 0.15);
  });
});

describe('[V31-C3] Advance-tax due dates are FY-relative', () => {
  it('due dates follow the FY', () => {
    const s2526 = getAdvanceTaxSchedule('2025-26');
    expect(s2526[0].dueDate).toBe('2025-06-15');
    expect(s2526[3].dueDate).toBe('2026-03-15');
    expect(getAdvanceTaxSchedule('2024-25')[0].dueDate).toBe('2024-06-15');
  });
  it('FY 25-26 payment 2025-06-14 counts toward Q1', () => {
    const sched = computeAdvanceTaxSchedule(500_000, 0, [{ date: '2025-06-14', amount: 75_000 }], 'regular', '2025-26');
    approx(sched.schedule[0].totalPaidByDue, 75_000);
  });
});

describe('[V31-H1] effectiveDeductionCap wired into computeAllowedDeductions', () => {
  it('Non-senior 80D capped at ₹50k', () => {
    approx(computeAllowedDeductions({ '80D': 100_000 }, 'old', { selfSenior: false, parentsSenior: false }), 50_000);
  });
  it('Both senior 80D allows full ₹1L', () => {
    approx(computeAllowedDeductions({ '80D': 100_000 }, 'old', { selfSenior: true, parentsSenior: true }), 100_000);
  });
});

describe('[V31-H5] 80CCD(2) capped at 10% of salary (14% for govt)', () => {
  it('private sector 10%', () => {
    approx(computeAllowedDeductions({ '80CCD2': 500_000 }, 'new', { salary: 1_000_000 }), 100_000);
  });
  it('govt 14%', () => {
    approx(computeAllowedDeductions({ '80CCD2': 500_000 }, 'new', { salary: 1_000_000, isGovtEmployee: true }), 140_000);
  });
  it('without salary context → 0 allowed', () => {
    approx(computeAllowedDeductions({ '80CCD2': 500_000 }, 'new', {}), 0);
  });
});

describe('[V31-H6] Senior / super-senior old-regime basic exemption slabs', () => {
  it('slab tables by age', () => {
    expect(getOldRegimeSlabs(65)[0].upto).toBe(300_000);
    expect(getOldRegimeSlabs(85)[0].upto).toBe(500_000);
    expect(getOldRegimeSlabs(30)[0].upto).toBe(250_000);
  });
  it('Senior with ₹3L salary → ₹0 slab tax', () => {
    approx(computeTax({ salary: 300_000, regime: 'old', fy: '2025-26', age: 65 }).slabTax, 0);
  });
});

describe('[V31-H2] 87A eligibility uses TOTAL income including capital gains', () => {
  it('₹5.3L salary + ₹50k LTCG → 87A rebate denied', () => {
    approx(computeTax({ salary: 530_000, ltcgAtSpecialRate: 50_000, regime: 'old', fy: '2025-26' }).rebate87A, 0);
  });
  it('₹5.3L salary alone → 87A rebate applies', () => {
    expect(computeTax({ salary: 530_000, regime: 'old', fy: '2025-26' }).rebate87A).toBeGreaterThan(0);
  });
});

describe('[V31-H3] Marginal relief on surcharge crossings', () => {
  it('₹50,00,010 caps surcharge way under the raw ₹1,31,250', () => {
    expect(computeSurcharge(1_312_500, 5_000_010, 'old')).toBeLessThan(50_000);
  });
});

describe('[V31-H4] Rule 119A ₹100 rounding on 234B shortfall', () => {
  it('shortfall ₹1,49,999 → interest on ₹1,49,900', () => {
    const sched: AdvanceTaxScheduleResult = { applies: true, netLiability: 149_999, totalPaid: 0, fy: '2024-25', schedule: [] };
    approx(compute234BInterest(sched, '2025-05-31'), 2998);
  });
});

describe('[V31-M2] Section 234A — late-filing interest', () => {
  it('15 days late (rounded to 1 month) → ₹1,000', () => {
    approx(compute234AInterest(100_000, 0, '2026-08-15', undefined, '2025-26'), 1000);
  });
  it('Filed on due date → no 234A', () => {
    approx(compute234AInterest(100_000, 0, '2026-07-31', undefined, '2025-26'), 0);
  });
  it('3m+1d late rounds up to 4 months → ₹4,000', () => {
    approx(compute234AInterest(100_000, 0, '2026-11-01', undefined, '2025-26'), 4000);
  });
  it('Zero outstanding → no 234A', () => {
    approx(compute234AInterest(100_000, 100_000, '2026-08-15', undefined, '2025-26'), 0);
  });
  it('Rule 119A: ₹1,49,999 rounded down to ₹1,49,900', () => {
    approx(compute234AInterest(149_999, 0, '2026-08-15', undefined, '2025-26'), 1499);
  });
  it('Audit case: due 31-Oct, filed 15-Nov → 1 month', () => {
    approx(compute234AInterest(100_000, 0, '2026-11-15', '2026-10-31', '2025-26'), 1000);
  });
});

describe('[V31-M3] §44AE parity — isEligible, negative clamp, declared-below-deemed', () => {
  it('Small fleet within 10-vehicle cap → eligible, ₹2,88,000', () => {
    const ok = compute44AE({ heavyVehicleMonths: 24, heavyVehicleTonnage: 12, lightVehicleMonths: 0 });
    expect(ok.isEligible).toBe(true);
    approx(ok.deemedIncome, 288_000);
  });
  it('Implied fleet > 10 → not eligible, with a note', () => {
    const over = compute44AE({ heavyVehicleMonths: 132, heavyVehicleTonnage: 15, lightVehicleMonths: 0 });
    expect(over.isEligible).toBe(false);
    expect(over.notes.some((n) => /fleet.*10/i.test(n))).toBe(true);
  });
  it('Negative vehicle-months clamped to 0', () => {
    approx(compute44AE({ heavyVehicleMonths: -5, heavyVehicleTonnage: 15, lightVehicleMonths: 0 }).deemedIncome, 0);
  });
  it('Warns when declared < deemed', () => {
    const under = compute44AE({ heavyVehicleMonths: 24, heavyVehicleTonnage: 12, lightVehicleMonths: 0, declaredIncome: 100_000 });
    expect(under.notes.some((n) => /less than the presumptive minimum/i.test(n))).toBe(true);
  });
});

describe('[V71] Income tax: bank categories and the ITR-4 80D line', () => {
  const cat = (d: string) => AUTO_CATEGORY_RULES.find((r) => r.pattern.test(d))?.category;
  it('Office rent is an expense, not rent received', () => {
    expect(cat('OFFICE RENT SEPT')).toBe('business_out');
  });
  it('Rent from a tenant is still rent received', () => {
    expect(cat('NEFT RENT FROM TENANT')).toBe('rent_received');
  });
  const inputs = { salary: 1200000, deductions: { '80D': 90000 }, age: 0, parentsSenior: false };
  it('The PDF shows the same ₹50,000 limit the tax used', () => {
    const row = buildITR4FieldMap(inputs, computeTax({ ...inputs, regime: 'old' }), null, inputs.deductions).find((r) => r.field.startsWith('§80D'));
    expect(row?.value).toBe(50000);
  });
  it('Senior self and parents allow up to ₹1 lakh, so all 90,000 counts', () => {
    const senior = { ...inputs, age: 60, selfSenior: true, parentsSenior: true };
    const row = buildITR4FieldMap(senior, computeTax({ ...senior, regime: 'old' }), null, senior.deductions).find((r) => r.field.startsWith('§80D'));
    expect(row?.value).toBe(90000);
  });
});

describe('[Audit 2026-10] Income tax marginal relief', () => {
  const t = (inc: number, regime: 'old' | 'new') => computeTax({ businessIncome: inc, regime, fy: '2025-26' });
  it('₹12.1L new regime: tax capped at the ₹10,000 above ₹12L, + 4% cess', () => {
    approx(t(1_210_000, 'new').totalTax, 10400);
  });
  it('₹12.5L new regime: ₹50,000 + cess', () => {
    approx(t(1_250_000, 'new').totalTax, 52000);
  });
  it('₹13L: past the relief band, normal slab tax', () => {
    approx(t(1_300_000, 'new').totalTax, 78000);
  });
  it('Old regime has no 87A marginal relief', () => {
    approx(t(530_000, 'old').rebate87A, 0);
  });
  it('₹10,000 over ₹50L: extra tax + surcharge = ₹10,000 (surcharge marginal relief)', () => {
    const base = t(5_000_000, 'old');
    const over = t(5_010_000, 'old');
    approx(over.taxAfterRebate + over.surcharge - (base.taxAfterRebate + base.surcharge), 10000);
  });
  it('234B: ₹1L all paid in June -> 1% x 3 months', () => {
    const sched = computeAdvanceTaxSchedule(100000, 0, [{ date: '2026-06-10', amount: 100000 }], 'regular', '2025-26');
    approx(compute234BInterest(sched, '2026-06-10'), 3000);
  });
});
