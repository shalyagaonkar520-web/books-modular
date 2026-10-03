/**
 * Building blocks of the tenant subscription screens: the status card (trial,
 * active plan, pending request) and the plan builder (modules + billing cycle
 * + overall value) that sends a plan request to the platform administrator.
 * Used by the /subscription page and by the lock screen.
 */
import { useEffect, useRef, useState } from 'react';
import { Ban, CheckCircle2, Clock, Hourglass, Send, X } from 'lucide-react';

import type { AppModuleKey } from '@/api/appContent';
import {
  DEFAULT_SELECTED_MODULES,
  cycleLabel,
  cycleSuffix,
  formatPrice,
  quote,
  resolveModules,
  type BillingCycle,
  type ModulePricing,
} from '@/api/modulePricing';
import { subscriptionApi, trialRemaining, type Subscription, type SubscriptionPlan } from '@/api/subscription';
import { useSubscription } from '@/app/SubscriptionContext';
import { BillingCycleToggle, ModuleBadges, ModulePicker, PlanQuoteSummary } from '@/components/modules/ModulePicker';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';
import { formatDate, formatDateTime } from '@/utils/format';

/** "₹1,594/mo · billed ₹15,940/yr" (or just "₹1,594/mo" for a monthly plan). */
export function planPriceText(plan: Pick<SubscriptionPlan, 'billingCycle' | 'monthlyPrice' | 'planPrice'>, catalog: ModulePricing): string {
  const monthly = `${formatPrice(plan.monthlyPrice, catalog.currency)}/mo`;
  if (plan.billingCycle !== 'yearly') return monthly;
  return `${monthly} · billed ${formatPrice(plan.planPrice, catalog.currency)}${cycleSuffix('yearly')}`;
}

function PlanDetails({ plan, catalog }: { plan: SubscriptionPlan; catalog: ModulePricing }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small">
        <strong>{cycleLabel(plan.billingCycle)}</strong> · {plan.modules.length} module{plan.modules.length === 1 ? '' : 's'} ·{' '}
        <span className="num">{planPriceText(plan, catalog)}</span>
      </span>
      {plan.modules.length ? <ModuleBadges catalog={catalog} value={plan.modules} /> : null}
    </div>
  );
}

/** What the organization has now, and what it has asked for. */
export function SubscriptionStatusCard({ subscription, catalog }: { subscription: Subscription; catalog: ModulePricing }) {
  const { status, plan, pendingRequest, lastRejection } = subscription;
  let heading;
  if (status === 'active') {
    heading = (
      <>
        <CheckCircle2 size={18} aria-hidden="true" className="text-success" />
        <strong>Active plan</strong>
        <Badge tone="success">Active</Badge>
      </>
    );
  } else if (status === 'trial') {
    heading = (
      <>
        <Clock size={18} aria-hidden="true" />
        <strong>Free trial · {trialRemaining(subscription.trialDaysLeft)}</strong>
        <Badge tone="info">Trial</Badge>
      </>
    );
  } else {
    heading = (
      <>
        <Ban size={18} aria-hidden="true" />
        <strong>{plan ? 'Subscription ended' : 'Free trial ended'}</strong>
        <Badge tone="danger">Expired</Badge>
      </>
    );
  }

  return (
    <section className="card subscription-status" aria-labelledby="subscription-status-title">
      <div className="card-body stack" style={{ gap: 12 }}>
        <h2 className="subscription-status-head" id="subscription-status-title">
          {heading}
        </h2>
        {status === 'trial' ? (
          <p className="text-muted small" style={{ margin: 0 }}>
            Every module is included during the trial
            {subscription.trialEndsAt ? `, which ends on ${formatDate(subscription.trialEndsAt)}` : ''}. Choose a plan before it
            ends to keep working without interruption.
          </p>
        ) : null}
        {status === 'expired' ? (
          <p className="text-muted small" style={{ margin: 0 }}>
            {subscription.trialEndsAt && !plan ? `The free trial ended on ${formatDate(subscription.trialEndsAt)}. ` : ''}
            Your data is safe; choose a plan to continue using the app.
          </p>
        ) : null}
        {plan && status === 'active' ? <PlanDetails plan={plan} catalog={catalog} /> : null}

        {pendingRequest ? (
          <div className="subscription-note is-pending" role="status">
            <Hourglass size={16} aria-hidden="true" />
            <div className="stack" style={{ gap: 6, minWidth: 0 }}>
              <span>
                <strong>Plan request sent — waiting for approval</strong>
                {pendingRequest.requestedAt ? (
                  <span className="text-muted small"> · {formatDateTime(pendingRequest.requestedAt)}</span>
                ) : null}
              </span>
              <PlanDetails plan={pendingRequest} catalog={catalog} />
            </div>
          </div>
        ) : lastRejection ? (
          <div className="subscription-note is-rejected" role="status">
            <Ban size={16} aria-hidden="true" />
            <span>
              <strong>Your last plan request was declined.</strong>{' '}
              {lastRejection.reason ? `Reason: ${lastRejection.reason}` : 'No reason was given.'}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

const sameModules = (a: string[], b: string[]) => a.length === b.length && a.every((key) => b.includes(key));

interface PlanBuilderProps {
  catalog: ModulePricing;
  /** Called with the updated subscription after a request is sent or cancelled. */
  onDone?: (next: Subscription | null) => void;
}

/**
 * Modules + Monthly/Yearly + the overall value, and "Send request to
 * administrator" (or "Update request" / "Cancel request" while one is pending).
 */
export function PlanBuilder({ catalog, onDone }: PlanBuilderProps) {
  const { subscription, setSubscription, reload } = useSubscription();
  const toast = useToast();
  const submit = useSubmit();
  const cancelSubmit = useSubmit();
  const plan = subscription?.plan ?? null;
  const pending = subscription?.pendingRequest ?? null;
  // Start from what is being changed: the pending request (that is what "Update request"
  // edits), else the current plan, else a starter set.
  const start = pending ?? plan;
  const startModules = resolveModules(start?.modules ?? DEFAULT_SELECTED_MODULES, catalog);
  const startCycle: BillingCycle = start?.billingCycle ?? 'monthly';
  const [modules, setModules] = useState<AppModuleKey[]>(startModules);
  const [cycle, setCycle] = useState<BillingCycle>(startCycle);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const touched = useRef(false);

  // The subscription may arrive after the builder mounts: follow it until the user makes a choice.
  const startKey = `${startModules.join(',')}|${startCycle}`;
  useEffect(() => {
    if (touched.current) return;
    const [keys, nextCycle] = startKey.split('|');
    setModules((keys ? keys.split(',') : []) as AppModuleKey[]);
    setCycle(nextCycle as BillingCycle);
  }, [startKey]);

  const q = quote(modules, catalog, cycle);
  const unchanged = Boolean(plan && !pending && plan.billingCycle === cycle && sameModules(plan.modules, q.modules));
  // Re-sending the request that is already waiting would change nothing.
  const alreadyRequested = Boolean(pending && pending.billingCycle === cycle && sameModules(pending.modules, q.modules));
  const busy = submit.submitting || cancelSubmit.submitting;

  const apply = async (next: Subscription | null) => {
    if (next) setSubscription(next);
    else await reload();
    onDone?.(next);
  };

  const send = async () => {
    if (!q.modules.length) {
      setModulesError('Choose at least one module.');
      return;
    }
    setModulesError(null);
    const result = await submit.run(async () => ({
      next: await subscriptionApi.request({ modules: q.modules, billingCycle: cycle }),
    }));
    if (!result) return;
    toast.success(pending ? 'Your plan request was updated.' : 'Plan request sent to the platform administrator.');
    touched.current = false;
    await apply(result.next);
  };

  const cancel = async () => {
    const result = await cancelSubmit.run(async () => ({ next: await subscriptionApi.cancelRequest() }));
    if (!result) return;
    toast.success('Your plan request was cancelled.');
    touched.current = false;
    await apply(result.next);
  };

  return (
    <div className="plan-builder">
      <div className="plan-builder-main stack" style={{ gap: 14 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="plan-builder-title">Billing cycle</h3>
          <BillingCycleToggle
            catalog={catalog}
            value={cycle}
            disabled={busy}
            onChange={(next) => {
              touched.current = true;
              setCycle(next);
            }}
          />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h3 className="plan-builder-title">Modules</h3>
          <p className="text-muted small" style={{ margin: 0 }}>
            Pay only for what you use. Ticking a module adds the modules it needs; unticking one also removes the modules that
            depend on it.
          </p>
          <ModulePicker
            catalog={catalog}
            value={modules}
            label="Plan modules"
            disabled={busy}
            error={modulesError ?? submit.fieldErrors.modules ?? null}
            onChange={(next) => {
              touched.current = true;
              setModules(next);
              if (next.length) setModulesError(null);
            }}
          />
        </div>
        {/* Phones: the running total stays in view while scrolling the modules. */}
        <div className="plan-builder-mobile-total" aria-hidden="true">
          <span>
            {q.modules.length} module{q.modules.length === 1 ? '' : 's'} · {cycleLabel(cycle)}
          </span>
          <strong className="num">
            {formatPrice(q.planPrice, catalog.currency)}
            <small>{cycleSuffix(cycle)}</small>
          </strong>
        </div>
      </div>

      <aside className="plan-builder-aside" aria-label="Plan value">
        <PlanQuoteSummary
          catalog={catalog}
          value={modules}
          billingCycle={cycle}
          note="The platform administrator reviews and approves your plan."
        />
        <FormError message={submit.error && !submit.fieldErrors.modules ? submit.error : cancelSubmit.error} />
        {unchanged ? <p className="text-muted small" style={{ margin: 0 }}>This is your current plan.</p> : null}
        {alreadyRequested ? (
          <p className="text-muted small" style={{ margin: 0 }}>
            This request is waiting for the administrator. Change the modules or billing cycle to update it.
          </p>
        ) : null}
        <Button
          variant="primary"
          icon={<Send size={15} />}
          className="btn-block"
          loading={submit.submitting}
          disabled={busy || unchanged || alreadyRequested}
          onClick={() => void send()}
        >
          {pending ? 'Update request' : 'Send request to administrator'}
        </Button>
        {pending ? (
          <Button
            variant="secondary"
            icon={<X size={15} />}
            className="btn-block"
            loading={cancelSubmit.submitting}
            disabled={busy}
            onClick={() => void cancel()}
          >
            Cancel request
          </Button>
        ) : null}
      </aside>
    </div>
  );
}
