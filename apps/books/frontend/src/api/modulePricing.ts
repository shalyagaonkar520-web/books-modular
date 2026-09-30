/**
 * Module pricing: which tenant-app modules an organization can subscribe to,
 * what each costs per month, and which modules a module needs to work.
 *
 * The catalog is public (GET /api/public/module-pricing). A copy is bundled so
 * the subscription page and the platform dialogs can price a selection
 * instantly, and still work when the API is unreachable.
 *
 * Organizations start on a free trial with every module; their admin then
 * chooses modules and a billing cycle (monthly, or yearly at
 * `yearlyMultiplier` × the monthly price).
 */
import defaultPricingJson from '@/content/modulePricingDefault.json';
import { formatCurrency } from '@/utils/format';

import type { AppModuleKey } from './appContent';

export interface PricedModule {
  key: AppModuleKey;
  label: string;
  description: string;
  /** Per `period`, in `currency`. */
  price: number;
  /** Modules this one needs; selecting it selects them too. */
  requires: AppModuleKey[];
}

export interface ModulePricing {
  currency: string;
  period: string;
  /** Platform fee charged whatever modules are chosen. */
  basePrice: number;
  /** Always-on areas covered by the base fee (Dashboard, Settings). */
  baseIncludes: string[];
  modules: PricedModule[];
  /** A yearly plan costs this many months (10: two months free). */
  yearlyMultiplier: number;
  /** Length of the free trial a newly approved organization gets. */
  trialDays: number;
}

export type BillingCycle = 'monthly' | 'yearly';

export interface ModuleQuote {
  /** The resolved selection (requirements added), in catalog order. */
  modules: AppModuleKey[];
  basePrice: number;
  modulesTotal: number;
  /** Base fee + modules, per month. */
  monthlyPrice: number;
  billingCycle: BillingCycle;
  /** What one billing cycle costs: the monthly price, or `yearlyMultiplier` × it. */
  planPrice: number;
  /** What a yearly plan saves over paying monthly for 12 months (whatever the cycle). */
  yearlySaving: number;
}

/** The bundled catalog (mirrors the backend's placeholder pricing). */
export const DEFAULT_MODULE_PRICING = defaultPricingJson as ModulePricing;

/** A plan with nothing chosen yet starts with a useful sales starter set. */
export const DEFAULT_SELECTED_MODULES: AppModuleKey[] = ['items', 'customers', 'invoices', 'paymentsReceived'];

export interface ModuleGroup {
  id: string;
  label: string;
  keys: AppModuleKey[];
}

/** How the picker groups modules. Modules not listed fall into "Other". */
export const MODULE_GROUPS: ModuleGroup[] = [
  { id: 'sales', label: 'Sales', keys: ['items', 'customers', 'invoices', 'paymentsReceived', 'razorpay'] },
  { id: 'purchases', label: 'Purchases', keys: ['vendors', 'bills', 'expenses', 'paymentsMade', 'expenseDashboard'] },
  { id: 'finance', label: 'Finance', keys: ['banking', 'accounting', 'financialHub', 'receivablesPayables', 'reports'] },
  { id: 'other', label: 'Other', keys: ['timeTracking', 'documents', 'payroll'] },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isPrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isWholeNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/**
 * Validate a catalog from the API. Anything malformed falls back to the
 * bundled copy; bad entries are dropped and unknown requirements ignored.
 */
export function normalizeModulePricing(raw: unknown): ModulePricing {
  const fallback = DEFAULT_MODULE_PRICING;
  if (!isRecord(raw) || !Array.isArray(raw.modules)) return fallback;

  const modules: PricedModule[] = [];
  raw.modules.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.key !== 'string' || !isPrice(entry.price)) return;
    if (modules.some((module) => module.key === entry.key)) return;
    const known = fallback.modules.find((module) => module.key === entry.key);
    modules.push({
      key: entry.key as AppModuleKey,
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label : (known?.label ?? entry.key),
      description: typeof entry.description === 'string' ? entry.description : (known?.description ?? ''),
      price: entry.price,
      requires: Array.isArray(entry.requires) ? (entry.requires.filter((key) => typeof key === 'string') as AppModuleKey[]) : [],
    });
  });
  if (!modules.length) return fallback;
  const keys = new Set(modules.map((module) => module.key));
  modules.forEach((module) => {
    module.requires = module.requires.filter((key) => keys.has(key) && key !== module.key);
  });

  return {
    currency: typeof raw.currency === 'string' && raw.currency ? raw.currency : fallback.currency,
    period: typeof raw.period === 'string' && raw.period ? raw.period : fallback.period,
    basePrice: isPrice(raw.basePrice) ? raw.basePrice : fallback.basePrice,
    baseIncludes: Array.isArray(raw.baseIncludes)
      ? raw.baseIncludes.filter((item): item is string => typeof item === 'string')
      : fallback.baseIncludes,
    modules,
    yearlyMultiplier: isPrice(raw.yearlyMultiplier) && raw.yearlyMultiplier > 0 ? raw.yearlyMultiplier : fallback.yearlyMultiplier,
    trialDays: isWholeNumber(raw.trialDays, 0, 365) ? raw.trialDays : fallback.trialDays,
  };
}

/** Public, unauthenticated read. Never throws: any failure returns the bundled catalog. */
export async function fetchModulePricing(signal?: AbortSignal): Promise<ModulePricing> {
  try {
    const response = await fetch('/api/public/module-pricing', { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return DEFAULT_MODULE_PRICING;
    return normalizeModulePricing(await response.json());
  } catch {
    return DEFAULT_MODULE_PRICING;
  }
}

/** The selection plus everything it (transitively) requires, in catalog order. Unknown keys are dropped. */
export function resolveModules(selected: Iterable<string>, catalog: ModulePricing): AppModuleKey[] {
  const byKey = new Map(catalog.modules.map((module) => [module.key as string, module]));
  const chosen = new Set<string>();
  const stack = [...selected];
  while (stack.length) {
    const key = stack.pop() as string;
    const module = byKey.get(key);
    if (!module || chosen.has(key)) continue;
    chosen.add(key);
    stack.push(...module.requires);
  }
  return catalog.modules.filter((module) => chosen.has(module.key)).map((module) => module.key);
}

/** Every selected module that (transitively) depends on `key`, i.e. what removing `key` must also remove. */
export function dependentsOf(key: string, selected: Iterable<string>, catalog: ModulePricing): AppModuleKey[] {
  const remaining = new Set(selected);
  const removed = new Set<string>([key]);
  let changed = true;
  while (changed) {
    changed = false;
    catalog.modules.forEach((module) => {
      if (remaining.has(module.key) && !removed.has(module.key) && module.requires.some((req) => removed.has(req))) {
        removed.add(module.key);
        changed = true;
      }
    });
  }
  removed.delete(key);
  return catalog.modules.filter((module) => removed.has(module.key) && remaining.has(module.key)).map((module) => module.key);
}

/** Money rounded to paise, so sums of prices do not pick up floating-point dust. */
const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

/**
 * Price a selection for a billing cycle: requirements are added first, so the
 * quote matches what the server will store.
 */
export function quote(selected: Iterable<string>, catalog: ModulePricing, billingCycle: BillingCycle = 'monthly'): ModuleQuote {
  const modules = resolveModules(selected, catalog);
  const prices = new Map(catalog.modules.map((module) => [module.key, module.price]));
  const modulesTotal = roundMoney(modules.reduce((sum, key) => sum + (prices.get(key) ?? 0), 0));
  const monthlyPrice = roundMoney(catalog.basePrice + modulesTotal);
  const yearlyPrice = roundMoney(monthlyPrice * catalog.yearlyMultiplier);
  return {
    modules,
    basePrice: catalog.basePrice,
    modulesTotal,
    monthlyPrice,
    billingCycle,
    planPrice: billingCycle === 'yearly' ? yearlyPrice : monthlyPrice,
    yearlySaving: Math.max(0, roundMoney(monthlyPrice * 12 - yearlyPrice)),
  };
}

/** How many months a yearly plan gives free (12 − multiplier), e.g. 2. */
export function freeMonths(catalog: ModulePricing): number {
  return Math.max(0, roundMoney(12 - catalog.yearlyMultiplier));
}

/** "Monthly" / "Yearly". */
export function cycleLabel(cycle: BillingCycle | string | null | undefined): string {
  return cycle === 'yearly' ? 'Yearly' : 'Monthly';
}

/** "/mo" / "/yr". */
export function cycleSuffix(cycle: BillingCycle | string | null | undefined): string {
  return cycle === 'yearly' ? '/yr' : '/mo';
}

/** ₹1,594 (whole amounts drop the paise), ₹1,594.50 otherwise. */
export function formatPrice(amount: number, currency = 'INR'): string {
  const text = formatCurrency(amount, currency);
  return Number.isInteger(amount) ? text.replace(/\.00$/, '') : text;
}

/** "month" → "/mo", anything else → "/<period>". */
export function periodSuffix(period: string): string {
  return period === 'month' ? '/mo' : `/${period}`;
}

/** Label of a module key, from the catalog (falls back to the key). */
export function moduleLabel(key: string, catalog: ModulePricing): string {
  return catalog.modules.find((module) => module.key === key)?.label ?? key;
}

/** "6 modules · ₹1,594/mo"; "All modules" for a legacy organization with no quote. */
export function planSummary(
  requestedModules: string[] | null | undefined,
  monthlyPrice: number | null | undefined,
  catalog: ModulePricing = DEFAULT_MODULE_PRICING,
): string {
  if (!requestedModules) return 'All modules';
  const count = `${requestedModules.length} module${requestedModules.length === 1 ? '' : 's'}`;
  if (typeof monthlyPrice !== 'number') return count;
  return `${count} · ${formatPrice(monthlyPrice, catalog.currency)}${periodSuffix(catalog.period)}`;
}
