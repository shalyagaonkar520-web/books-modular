/**
 * Plans by number of users (backend/services/plans.py): three plans with every
 * feature and a custom plan (users + chosen features). Paid online with Razorpay
 * (the plan starts at once) or, when Razorpay is not set up, by UPI / bank with
 * a payment reference that a super admin accepts.
 */
import type { CheckoutResult } from '@/utils/razorpayCheckout';

import { api } from './client';

export type PlanKey = 'u100' | 'u500' | 'u1000' | 'custom';
export type Cycle = 'monthly' | 'yearly';

export interface PlanTier {
  key: Exclude<PlanKey, 'custom'>;
  label: string;
  users: number;
  monthly: number;
  /** File storage for uploaded documents, in GB. */
  storageGb: number;
}

export interface PlanCatalog {
  currency: string;
  tiers: PlanTier[];
  /** The free trial's length; the trial has the smallest plan's users and storage. */
  trialDays?: number;
  per100Over: number;
  customMinimum: number;
  yearlyMonths: number;
  payment: { upiId: string; payeeName: string; bankDetails: string; note: string };
  /** Every feature (the same keys as custom roles), grouped; core ones are in every plan. */
  features: Array<{ key: string; label: string; group?: string; core: boolean }>;
  /** Razorpay is set up: pay online and the plan starts straight away. */
  onlinePayment?: boolean;
}

export interface PlanCheckoutBody {
  planKey: PlanKey;
  billingCycle: Cycle;
  users?: number;
  modules?: string[];
}

/** A Razorpay order for the plan's price (services/plan_payments.create_order). */
export interface PlanCheckoutOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  mode: string;
  description: string;
  prefill: { name: string; email: string };
}

export interface PlanQuote {
  planKey: PlanKey;
  maxUsers: number;
  storageGb: number;
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
  let storageGb: number;
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
    storageGb = (covering ?? top)?.storageGb;
  } else {
    const tier = catalog.tiers.find((t) => t.key === planKey);
    if (!tier) return null;
    chosen = every;
    monthly = tier.monthly;
    maxUsers = tier.users;
    storageGb = tier.storageGb;
  }
  const planPrice = monthly * (cycle === 'yearly' ? catalog.yearlyMonths : 1);
  return { planKey, maxUsers, storageGb, modules: chosen, billingCycle: cycle, monthlyPrice: monthly, planPrice };
}

/** Where the plan screens talk to: the tenant app or the org admin panel. */
export interface PlanApi {
  catalog: () => Promise<PlanCatalog>;
  payQr: (amount: number) => Promise<{ svg: string | null }>;
  request: (body: PlanRequestBody) => Promise<unknown>;
  checkout: (body: PlanCheckoutBody) => Promise<PlanCheckoutOrder>;
  confirm: (body: CheckoutResult) => Promise<unknown>;
}

export const tenantPlanApi: PlanApi = {
  catalog: () => api.get<PlanCatalog>('/subscription/plans'),
  payQr: (amount) => api.get<{ svg: string | null }>('/subscription/pay-qr', { amount }),
  request: (body) => api.post<unknown>('/subscription/plan-request', body),
  checkout: (body) => api.post<PlanCheckoutOrder>('/subscription/checkout', body),
  confirm: (body) => api.post<unknown>('/subscription/checkout/confirm', body),
};

/** The plans as the public website shows them (GET /api/public/plans). */
export interface PublicPlans {
  currency: string;
  tiers: PlanTier[];
  per100Over: number;
  customMinimum: number;
  yearlyMonths: number;
  trialDays?: number;
}

/** The server's defaults (services/plans.DEFAULTS), shown until the live plans load. */
export const DEFAULT_PUBLIC_PLANS: PublicPlans = {
  currency: 'INR',
  tiers: [
    { key: 'u100', label: 'Starter', users: 100, monthly: 299, storageGb: 10 },
    { key: 'u500', label: 'Business', users: 500, monthly: 599, storageGb: 50 },
    { key: 'u1000', label: 'Enterprise', users: 1000, monthly: 999, storageGb: 200 },
  ],
  per100Over: 99,
  customMinimum: 99,
  yearlyMonths: 10,
  trialDays: 3,
};

/** No login needed; null when the request fails (the page keeps its defaults). */
export async function fetchPublicPlans(signal?: AbortSignal): Promise<PublicPlans | null> {
  try {
    const response = await fetch('/api/public/plans', { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const body = (await response.json()) as PublicPlans;
    return Array.isArray(body.tiers) && body.tiers.length ? body : null;
  } catch {
    return null;
  }
}

/** "10 GB", or "1 TB" from 1024 GB up. */
export function formatStorage(gb: number): string {
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb.toLocaleString('en-IN')} GB`;
}

export function formatRupees(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
}
