import { afterEach, describe, expect, it, vi } from 'vitest';

import { APP_MODULES } from './appContent';
import {
  DEFAULT_MODULE_PRICING,
  coreModules,
  dependentsOf,
  fetchModulePricing,
  formatPrice,
  freeMonths,
  normalizeModulePricing,
  planSummary,
  quote,
  resolveModules,
  withCore,
} from './modulePricing';

const catalog = DEFAULT_MODULE_PRICING;

describe('bundled module pricing', () => {
  it('prices every app module, in sidebar order, with the app-content labels', () => {
    expect(catalog.modules.map((module) => module.key)).toEqual(APP_MODULES.map((module) => module.key));
    expect(catalog.modules.map((module) => module.label)).toEqual(APP_MODULES.map((module) => module.label));
    expect(catalog.basePrice).toBe(499);
    expect(catalog.baseIncludes).toEqual(['Dashboard', 'Settings']);
    expect(catalog.yearlyMultiplier).toBe(10);
    expect(catalog.trialDays).toBe(3);
  });

  it('only requires modules that exist', () => {
    const keys = new Set(catalog.modules.map((module) => module.key));
    catalog.modules.forEach((module) => module.requires.forEach((key) => expect(keys.has(key)).toBe(true)));
  });
});

describe('resolveModules', () => {
  it('adds transitive requirements and returns catalog order', () => {
    expect(resolveModules(['paymentsReceived'], catalog)).toEqual(['customers', 'invoices', 'paymentsReceived']);
    expect(resolveModules(['receivablesPayables'], catalog)).toEqual(['customers', 'invoices', 'vendors', 'bills', 'receivablesPayables']);
  });

  it('drops unknown keys and duplicates', () => {
    expect(resolveModules(['nope', 'items', 'items'], catalog)).toEqual(['items']);
    expect(resolveModules([], catalog)).toEqual([]);
  });
});

describe('dependentsOf', () => {
  it('lists every selected module that needs the one being removed', () => {
    const selected = ['customers', 'invoices', 'paymentsReceived', 'razorpay', 'items'];
    expect(dependentsOf('customers', selected, catalog)).toEqual(['invoices', 'paymentsReceived', 'razorpay']);
    expect(dependentsOf('items', selected, catalog)).toEqual([]);
  });
});

describe('quote', () => {
  // Core modules (what Books needs to run) are in every plan.
  const core = ['items', 'customers', 'invoices', 'paymentsReceived', 'accounting', 'reports'];
  const coreTotal = 199 + 99 + 299 + 149 + 299 + 199;

  it('prices the core modules plus the selection on top of the base fee, monthly by default', () => {
    expect(coreModules(catalog)).toEqual(core);
    const monthly = 499 + coreTotal + 399;
    expect(quote(['payroll'], catalog)).toEqual({
      modules: [...core, 'payroll'],
      basePrice: 499,
      modulesTotal: coreTotal + 399,
      monthlyPrice: monthly,
      billingCycle: 'monthly',
      planPrice: monthly,
      yearlySaving: monthly * 2,
    });
    expect(quote([], catalog).modules).toEqual(core);
    expect(quote([], catalog).monthlyPrice).toBe(499 + coreTotal);
  });

  it('charges a yearly plan at the multiplier (10 × monthly: two months free)', () => {
    const q = quote(['vendors', 'bills'], catalog, 'yearly');
    const monthly = 499 + coreTotal + 99 + 249;
    expect(q.monthlyPrice).toBe(monthly);
    expect(q.billingCycle).toBe('yearly');
    expect(q.planPrice).toBe(monthly * 10);
    expect(q.yearlySaving).toBe(monthly * 12 - monthly * 10);
    expect(freeMonths(catalog)).toBe(2);
    expect(quote(['items'], { ...catalog, yearlyMultiplier: 12 }, 'yearly').yearlySaving).toBe(0);
  });

  it('adds the core modules to a selection', () => {
    expect(withCore(['bills'], catalog)).toEqual([...core.slice(0, 4), 'vendors', 'bills', 'accounting', 'reports']);
  });
});

describe('formatting', () => {
  it('drops paise on whole amounts', () => {
    expect(formatPrice(1594)).toBe('₹1,594');
    expect(formatPrice(99.5)).toBe('₹99.50');
  });

  it('summarizes a plan, or says all modules for a legacy organization', () => {
    expect(planSummary(['a', 'b', 'c', 'd', 'e', 'f'], 1594)).toBe('6 modules · ₹1,594/mo');
    expect(planSummary(['items'], null)).toBe('1 module');
    expect(planSummary(null, null)).toBe('All modules');
  });
});

describe('normalizeModulePricing', () => {
  it('falls back to the bundled catalog for malformed input', () => {
    expect(normalizeModulePricing(null)).toBe(DEFAULT_MODULE_PRICING);
    expect(normalizeModulePricing({ modules: 'x' })).toBe(DEFAULT_MODULE_PRICING);
    expect(normalizeModulePricing({ modules: [{ key: 'items' }] })).toBe(DEFAULT_MODULE_PRICING);
  });

  it('keeps valid entries and ignores unknown requirements', () => {
    const result = normalizeModulePricing({
      currency: 'INR',
      period: 'month',
      basePrice: 100,
      baseIncludes: ['Dashboard'],
      modules: [
        { key: 'customers', label: 'Customers', description: '', price: 10, requires: [] },
        { key: 'invoices', label: 'Invoices', description: '', price: 20, requires: ['customers', 'ghost'] },
        { key: 'bad', price: -1 },
      ],
    });
    expect(result.basePrice).toBe(100);
    // Missing yearly multiplier / trial length fall back to the bundled values.
    expect(result.yearlyMultiplier).toBe(10);
    expect(result.trialDays).toBe(3);
    expect(normalizeModulePricing({ ...result, yearlyMultiplier: 11, trialDays: 7 })).toMatchObject({ yearlyMultiplier: 11, trialDays: 7 });
    expect(result.modules.map((module) => module.key)).toEqual(['customers', 'invoices']);
    expect(result.modules[1].requires).toEqual(['customers']);
  });
});

describe('fetchModulePricing', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the server catalog', async () => {
    const served = { ...DEFAULT_MODULE_PRICING, basePrice: 999 };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(served), { status: 200 })));
    expect((await fetchModulePricing()).basePrice).toBe(999);
  });

  it('falls back to the bundled catalog when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })));
    expect(await fetchModulePricing()).toBe(DEFAULT_MODULE_PRICING);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(await fetchModulePricing()).toBe(DEFAULT_MODULE_PRICING);
  });
});
