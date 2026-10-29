/**
 * Plans by number of users (backend/services/plans.py): three plans with every
 * feature and a custom plan (users + chosen features). Paid by UPI / bank; the
 * payment reference goes with the request and a super admin accepts it.
 */
import { api } from './client';
import { orgPanelClient } from './orgPanelClient';

export type PlanKey = 'u100' | 'u500' | 'u1000' | 'custom';
export type Cycle = 'monthly' | 'yearly';

export interface PlanTier {
  key: Exclude<PlanKey, 'custom'>;
  label: string;
  users: number;
  monthly: number;
}

export interface PlanCatalog {
  currency: string;
  tiers: PlanTier[];
  per100Over: number;
  customMinimum: number;
  yearlyMonths: number;
  payment: { upiId: string; payeeName: string; bankDetails: string; note: string };
  /** Every feature (the same keys as custom roles), grouped; core ones are in every plan. */
  features: Array<{ key: string; label: string; group?: string; core: boolean }>;
}

export interface PlanQuote {
  planKey: PlanKey;
  maxUsers: number;
  modules: string[];
  billingCycle: Cycle;
  monthlyPrice: number;
  planPrice: number;
}

export interface PlanRequestBody {
  planKey: PlanKey;
  billingCycle: Cycle;
  paymentReference: string;
  users?: number;
  modules?: string[];
}

/** The same price the server computes (services/plans.quote), for showing before paying. */
export function quotePlan(catalog: PlanCatalog, planKey: PlanKey, cycle: Cycle, users?: number, modules?: string[]): PlanQuote | null {
  const every = catalog.features.map((f) => f.key);
  let monthly: number;
  let maxUsers: number;
  let chosen: string[];
  if (planKey === 'custom') {
    if (!users || users < 1 || users > 100000) return null;
    const wanted = new Set([...(modules ?? []), ...catalog.features.filter((f) => f.core).map((f) => f.key)]);
    chosen = every.filter((key) => wanted.has(key));
    const tiers = [...catalog.tiers].sort((a, b) => a.users - b.users);
    const covering = tiers.find((t) => users <= t.users);
    const top = tiers[tiers.length - 1];
    const base = covering ? covering.monthly : top.monthly + Math.ceil((users - top.users) / 100) * catalog.per100Over;
    monthly = Math.max(catalog.customMinimum, Math.ceil((base * chosen.length) / every.length));
    maxUsers = users;
  } else {
    const tier = catalog.tiers.find((t) => t.key === planKey);
    if (!tier) return null;
    chosen = every;
    monthly = tier.monthly;
    maxUsers = tier.users;
  }
  const planPrice = monthly * (cycle === 'yearly' ? catalog.yearlyMonths : 1);
  return { planKey, maxUsers, modules: chosen, billingCycle: cycle, monthlyPrice: monthly, planPrice };
}

/** Where the plan screens talk to: the tenant app or the org admin panel. */
export interface PlanApi {
  catalog: () => Promise<PlanCatalog>;
  payQr: (amount: number) => Promise<{ svg: string | null }>;
  request: (body: PlanRequestBody) => Promise<unknown>;
}

export const tenantPlanApi: PlanApi = {
  catalog: () => api.get<PlanCatalog>('/subscription/plans'),
  payQr: (amount) => api.get<{ svg: string | null }>('/subscription/pay-qr', { amount }),
  request: (body) => api.post<unknown>('/subscription/plan-request', body),
};

export const panelPlanApi: PlanApi = {
  catalog: () => orgPanelClient.get<PlanCatalog>('/org-admin/subscription/plans'),
  payQr: (amount) => orgPanelClient.get<{ svg: string | null }>('/org-admin/subscription/pay-qr', { amount }),
  request: (body) => orgPanelClient.post<unknown>('/org-admin/subscription/plan-request', body),
};

export function formatRupees(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}
