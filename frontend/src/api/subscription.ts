/**
 * The organization's subscription, as the tenant app sees it.
 *
 * Every approved organization starts on a free trial with all modules. Its
 * admin then chooses modules and a billing cycle, which sends a request to the
 * platform administrator. Once the trial is over without an active plan the
 * organization is locked: data endpoints answer 402 subscription_required.
 */
import { api } from './client';
import type { BillingCycle } from './modulePricing';

export type SubscriptionStatus = 'trial' | 'active' | 'expired';

export interface SubscriptionPlan {
  modules: string[];
  billingCycle: BillingCycle;
  monthlyPrice: number;
  /** Price per billing cycle. */
  planPrice: number;
}

export interface SubscriptionPlanRequest extends SubscriptionPlan {
  requestedAt: string;
  /** A plan by users: which one, how many users, and the payment reference to check. */
  planKey?: string | null;
  maxUsers?: number | null;
  paymentReference?: string | null;
}

export interface Subscription {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  /** Tenant data is refused (HTTP 402) until a plan is approved. */
  locked: boolean;
  plan: SubscriptionPlan | null;
  pendingRequest: SubscriptionPlanRequest | null;
  lastRejection: { reason: string; decidedAt: string | null } | null;
  /** Whether the signed-in user may request a plan; undefined when the server did not say. */
  canManage?: boolean;
  /** Plans by users: the plan, its user cap and end of the paid period. */
  planKey?: string | null;
  maxUsers?: number | null;
  planEndsAt?: string | null;
  planDaysLeft?: number | null;
  /** Logins in use and the most allowed now (null = no cap). */
  usersUsed?: number;
  userLimit?: number | null;
  /** Uploaded documents against the plan's storage (null = no cap). */
  storageUsedBytes?: number;
  storageLimitBytes?: number | null;
}

export interface SubscriptionRequestBody {
  modules: string[];
  billingCycle: BillingCycle;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const asString = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

function normalizePlan(raw: unknown): SubscriptionPlan | null {
  if (!isRecord(raw) || !Array.isArray(raw.modules)) return null;
  const monthlyPrice = asNumber(raw.monthlyPrice) ?? 0;
  const billingCycle: BillingCycle = raw.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  return {
    modules: raw.modules.filter((key): key is string => typeof key === 'string'),
    billingCycle,
    monthlyPrice,
    planPrice: asNumber(raw.planPrice) ?? monthlyPrice,
  };
}

/** Whole days until `iso` (rounded up; 0 once it has passed), or null. */
export function daysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const end = Date.parse(iso);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - now) / DAY_MS));
}

/**
 * Validate a subscription from the API (GET /subscription, or the partial
 * copy on the organization). Returns null when there is nothing usable.
 */
export function normalizeSubscription(raw: unknown): Subscription | null {
  if (!isRecord(raw)) return null;
  const status = raw.status;
  if (status !== 'trial' && status !== 'active' && status !== 'expired') return null;
  const trialEndsAt = asString(raw.trialEndsAt);
  const pending = normalizePlan(raw.pendingRequest);
  const rejection = isRecord(raw.lastRejection) ? raw.lastRejection : null;
  return {
    status,
    trialEndsAt,
    trialDaysLeft: asNumber(raw.trialDaysLeft) ?? daysUntil(trialEndsAt),
    locked: typeof raw.locked === 'boolean' ? raw.locked : status === 'expired',
    plan: normalizePlan(raw.plan),
    pendingRequest: pending
      ? {
          ...pending,
          requestedAt: asString((raw.pendingRequest as Record<string, unknown>).requestedAt) ?? '',
          planKey: asString((raw.pendingRequest as Record<string, unknown>).planKey),
          maxUsers: asNumber((raw.pendingRequest as Record<string, unknown>).maxUsers),
          paymentReference: asString((raw.pendingRequest as Record<string, unknown>).paymentReference),
        }
      : null,
    lastRejection: rejection
      ? { reason: typeof rejection.reason === 'string' ? rejection.reason : '', decidedAt: asString(rejection.decidedAt) }
      : null,
    canManage: typeof raw.canManage === 'boolean' ? raw.canManage : undefined,
    planKey: asString(raw.planKey),
    maxUsers: asNumber(raw.maxUsers),
    planEndsAt: asString(raw.planEndsAt),
    planDaysLeft: asNumber(raw.planDaysLeft),
    usersUsed: asNumber(raw.usersUsed) ?? undefined,
    userLimit: asNumber(raw.userLimit),
    storageUsedBytes: asNumber(raw.storageUsedBytes) ?? undefined,
    storageLimitBytes: asNumber(raw.storageLimitBytes),
  };
}

/** "Free trial · 2 days left" style remainder: "2 days left", "1 day left", "ends today". */
export function trialRemaining(daysLeft: number | null | undefined): string {
  if (daysLeft === null || daysLeft === undefined) return 'in progress';
  if (daysLeft <= 0) return 'ends today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}

export const subscriptionApi = {
  get: async (signal?: AbortSignal) => normalizeSubscription(await api.get<unknown>('/subscription', undefined, signal)),
  /** Admin only. Replaces any pending request. */
  request: async (body: SubscriptionRequestBody) => normalizeSubscription(await api.post<unknown>('/subscription/request', body)),
  cancelRequest: async () => normalizeSubscription(await api.delete<unknown>('/subscription/request')),
};
