/**
 * The signed-in organization's subscription (free trial, active plan, pending
 * plan request) for the tenant app.
 *
 * Starts from the copy on the auth organization, then loads GET /subscription.
 * The app is locked when the subscription says so, or as soon as any API call
 * answers 402 subscription_required (see `onSubscriptionRequired` in
 * api/client.ts). While locked it re-checks every 60 seconds and whenever the
 * window regains focus, so approval by the platform administrator unlocks the
 * app without a reload.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { onSubscriptionRequired } from '@/api/client';
import { normalizeSubscription, subscriptionApi, type Subscription } from '@/api/subscription';
import { useOptionalAuth } from '@/auth/AuthContext';

export const LOCKED_POLL_MS = 60_000;

export interface SubscriptionContextValue {
  subscription: Subscription | null;
  /** The first GET /subscription has not finished yet. */
  loading: boolean;
  /** Tenant pages are replaced by the lock screen. */
  locked: boolean;
  /** The signed-in user may choose / request a plan. */
  canManage: boolean;
  /** Re-fetch; resolves to the latest subscription (null when it could not be loaded). */
  reload: () => Promise<Subscription | null>;
  /** Apply a subscription returned by a mutation. */
  setSubscription: (next: Subscription) => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

/**
 * Whether a fresh subscription outweighs an earlier 402: only an active plan,
 * or a trial that demonstrably runs into the future (e.g. it was extended).
 */
function liftsLock(next: Subscription): boolean {
  if (next.locked) return false;
  if (next.status === 'active') return true;
  return next.status === 'trial' && Boolean(next.trialEndsAt) && Date.parse(next.trialEndsAt as string) > Date.now();
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const organization = auth?.organization ?? null;
  const isAdmin = auth?.isAdmin ?? false;
  const orgId = organization?.id ?? null;
  const [subscription, setSubscriptionState] = useState<Subscription | null>(() => normalizeSubscription(organization?.subscription));
  const [loading, setLoading] = useState(true);
  // Set by a 402 from any endpoint. Only a re-check (poll, focus, "Check
  // again", a plan request) that shows an active plan or a running trial
  // clears it, so an inconsistent server cannot make the app flicker.
  const [forcedLock, setForcedLock] = useState(false);
  const mounted = useRef(true);
  // Bumped on every 402: a check that was already in flight then must not unlock.
  const lockEpoch = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchLatest = useCallback(async (clearForced: boolean): Promise<Subscription | null> => {
    const epoch = lockEpoch.current;
    try {
      const next = await subscriptionApi.get();
      if (!mounted.current) return next;
      if (next) {
        setSubscriptionState(next);
        if (clearForced && epoch === lockEpoch.current && liftsLock(next)) setForcedLock(false);
      }
      return next;
    } catch {
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // Load on sign-in and whenever the organization changes (starting from the
  // copy on the organization, when it carries one).
  const orgSubscription = useRef(organization?.subscription);
  orgSubscription.current = organization?.subscription;
  const authInitializing = auth?.initializing ?? false;
  const previousOrgId = useRef<string | null>(null);
  useEffect(() => {
    if (!orgId) {
      if (!authInitializing) setLoading(false);
      return;
    }
    if (previousOrgId.current && previousOrgId.current !== orgId) {
      // A different organization: nothing known about it is carried over.
      setForcedLock(false);
      setSubscriptionState(null);
    }
    previousOrgId.current = orgId;
    const seeded = normalizeSubscription(orgSubscription.current);
    if (seeded) setSubscriptionState(seeded);
    void fetchLatest(true);
  }, [orgId, authInitializing, fetchLatest]);

  useEffect(
    () =>
      onSubscriptionRequired((detail) => {
        lockEpoch.current += 1;
        setForcedLock(true);
        setSubscriptionState((current) =>
          current
            ? { ...current, locked: true, status: detail.status === 'trial' || detail.status === 'active' ? current.status : 'expired' }
            : current,
        );
        void fetchLatest(false);
      }),
    [fetchLatest],
  );

  const locked = forcedLock || Boolean(subscription?.locked);

  // While locked, look for the platform administrator's approval.
  useEffect(() => {
    if (!locked) return;
    const check = () => void fetchLatest(true);
    const timer = window.setInterval(check, LOCKED_POLL_MS);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [locked, fetchLatest]);

  const reload = useCallback(() => fetchLatest(true), [fetchLatest]);

  const setSubscription = useCallback((next: Subscription) => {
    setSubscriptionState(next);
    if (liftsLock(next)) setForcedLock(false);
  }, []);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      subscription,
      loading,
      locked,
      canManage: subscription?.canManage ?? isAdmin,
      reload,
      setSubscription,
    }),
    [subscription, loading, locked, isAdmin, reload, setSubscription],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

const EMPTY: SubscriptionContextValue = {
  subscription: null,
  loading: false,
  locked: false,
  canManage: false,
  reload: async () => null,
  setSubscription: () => undefined,
};

/** The organization's subscription. Outside a provider nothing is known and nothing is locked. */
export function useSubscription(): SubscriptionContextValue {
  return useContext(SubscriptionContext) ?? EMPTY;
}
