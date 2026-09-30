/**
 * Subscription operator actions shared by the Subscriptions & Pricing page,
 * the organization drawer and the organizations list: status badge / plan
 * label, and the Accept (optionally adjusted) / Change plan, Reject and
 * Extend trial dialogs.
 */
import { useCallback, useState } from 'react';
import { BadgeCheck, Ban, CalendarPlus } from 'lucide-react';

import type { AppModuleKey } from '@/api/appContent';
import {
  DEFAULT_SELECTED_MODULES,
  formatPrice,
  planSummary,
  quote,
  resolveModules,
  type BillingCycle,
  type ModulePricing,
} from '@/api/modulePricing';
import { platformApi, type OrgPlan, type OrgSubscriptionFields, type OrgSubscriptionStatus } from '@/api/platform';
import { daysUntil, trialRemaining } from '@/api/subscription';
import { BillingCycleToggle, ModulePicker, PlanQuoteSummary } from '@/components/modules/ModulePicker';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useModulePricing } from '@/hooks/useModulePricing';
import { useSubmit } from '@/hooks/useSubmit';
import { formatDate } from '@/utils/format';

/** Fired on window after a subscription decision so other views (e.g. the nav) can refresh. */
export const SUBSCRIPTION_CHANGED_EVENT = 'platform:subscription-changed';

export function SubscriptionStatusBadge({ status }: { status: OrgSubscriptionStatus | null | undefined }) {
  if (status === 'active') return <Badge tone="success">Active</Badge>;
  if (status === 'trial') return <Badge tone="info">Trial</Badge>;
  if (status === 'expired') return <Badge tone="danger">Expired</Badge>;
  return null;
}

/** "Trial · 2 days left" / "Trial · ends today". */
export function trialLabel(trialEndsAt: string | null | undefined): string {
  return `Trial · ${trialRemaining(daysUntil(trialEndsAt))}`;
}

/** "Monthly · ₹1,594/mo" or "Yearly · ₹15,940/yr (₹1,594/mo)". */
export function planPriceLabel(plan: Pick<OrgPlan, 'billingCycle' | 'monthlyPrice' | 'planPrice'>, catalog: ModulePricing): string {
  const monthly = `${formatPrice(plan.monthlyPrice, catalog.currency)}/mo`;
  if (plan.billingCycle === 'yearly') return `Yearly · ${formatPrice(plan.planPrice, catalog.currency)}/yr (${monthly})`;
  return `Monthly · ${monthly}`;
}

/**
 * The organizations list "Plan" cell: "Request pending", "Active · 6 modules ·
 * ₹1,594/mo", "Trial · 2 days left", "Expired". Older payloads without
 * subscription fields fall back to the legacy module summary.
 */
export function orgPlanLabel(org: OrgSubscriptionFields & { approvalStatus?: string }, catalog: ModulePricing): string {
  if (org.approvalStatus === 'pending' || org.approvalStatus === 'rejected') return '—';
  if (org.pendingRequest) return 'Request pending';
  switch (org.subscriptionStatus) {
    case 'active':
      return org.plan ? `Active · ${planSummary(org.plan.modules, org.plan.monthlyPrice, catalog)}` : 'Active';
    case 'trial':
      return trialLabel(org.trialEndsAt);
    case 'expired':
      return 'Expired';
    default:
      break;
  }
  if (org.requestedModules !== undefined) return planSummary(org.requestedModules, org.monthlyPrice, catalog);
  return '—';
}

/** The minimum a subscription action needs to know about an organization. */
export interface PlanTarget {
  id: string;
  name: string;
  trialEndsAt?: string | null;
}

export interface PlanStart {
  modules?: string[] | null;
  billingCycle?: BillingCycle | null;
}

type Decision =
  | { kind: 'accept' | 'change'; org: PlanTarget; start: PlanStart }
  | { kind: 'reject'; org: PlanTarget }
  | { kind: 'trial'; org: PlanTarget }
  | null;

const REASON_MAX = 500;
const TRIAL_DAYS_MAX = 90;

/**
 * Owns the Accept / Change plan, Reject and Extend trial dialogs. Render
 * `dialogs` once (outside any clickable row) and call the request functions.
 * `onChanged` runs after a successful decision.
 */
export function usePlanDecisions({ onChanged }: { onChanged?: (orgId: string) => void } = {}) {
  const toast = useToast();
  const catalog = useModulePricing();
  const submit = useSubmit();
  const [decision, setDecision] = useState<Decision>(null);
  const [modules, setModules] = useState<AppModuleKey[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('7');
  const [localError, setLocalError] = useState<string | null>(null);

  const { reset } = submit;
  const openPlan = useCallback(
    (kind: 'accept' | 'change', org: PlanTarget, start: PlanStart = {}) => {
      reset();
      setLocalError(null);
      setModules(resolveModules(start.modules ?? DEFAULT_SELECTED_MODULES, catalog));
      setCycle(start.billingCycle === 'yearly' ? 'yearly' : 'monthly');
      setDecision({ kind, org, start });
    },
    [reset, catalog],
  );

  const requestReject = useCallback(
    (org: PlanTarget) => {
      reset();
      setLocalError(null);
      setReason('');
      setDecision({ kind: 'reject', org });
    },
    [reset],
  );

  const requestExtendTrial = useCallback(
    (org: PlanTarget) => {
      reset();
      setLocalError(null);
      setDays('7');
      setDecision({ kind: 'trial', org });
    },
    [reset],
  );

  const close = () => {
    if (!submit.submitting) setDecision(null);
  };

  const done = (orgId: string, message: string) => {
    toast.success(message);
    setDecision(null);
    window.dispatchEvent(new Event(SUBSCRIPTION_CHANGED_EVENT));
    onChanged?.(orgId);
  };

  const confirm = async () => {
    if (!decision) return;
    const { org } = decision;
    if (decision.kind === 'accept' || decision.kind === 'change') {
      const q = quote(modules, catalog, cycle);
      if (!q.modules.length) {
        setLocalError('Choose at least one module.');
        return;
      }
      const ok = await submit.run(async () => {
        await platformApi.subscriptions.approve(org.id, { modules: q.modules, billingCycle: cycle });
        return true;
      });
      if (ok) {
        done(
          org.id,
          decision.kind === 'accept' ? `${org.name}’s plan was approved and is now active.` : `${org.name}’s plan was updated.`,
        );
      }
    } else if (decision.kind === 'reject') {
      const trimmed = reason.trim();
      if (!trimmed) {
        setLocalError('Enter a reason for the organization’s admin.');
        return;
      }
      const ok = await submit.run(async () => {
        await platformApi.subscriptions.reject(org.id, { reason: trimmed });
        return true;
      });
      if (ok) done(org.id, `${org.name}’s plan request was rejected.`);
    } else {
      const value = Number(days);
      if (!days.trim() || !Number.isInteger(value) || value < 1 || value > TRIAL_DAYS_MAX) {
        setLocalError(`Enter whole days between 1 and ${TRIAL_DAYS_MAX}.`);
        return;
      }
      const ok = await submit.run(async () => {
        await platformApi.subscriptions.extendTrial(org.id, { days: value });
        return true;
      });
      if (ok) done(org.id, `${org.name}’s free trial was extended by ${value} day${value === 1 ? '' : 's'}.`);
    }
  };

  const planOpen = decision?.kind === 'accept' || decision?.kind === 'change';
  const modulesError = localError ?? submit.fieldErrors.modules ?? null;

  const planDialog = (
    <Modal
      open={planOpen}
      title={decision?.kind === 'accept' ? 'Accept plan request' : 'Change plan'}
      subtitle={
        decision && planOpen
          ? decision.kind === 'accept'
            ? `Pre-filled with what ${decision.org.name} asked for. Adjust before accepting if needed.`
            : `Set the plan for ${decision.org.name}. It takes effect straight away.`
          : undefined
      }
      size="md"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submit.submitting}>
            Cancel
          </Button>
          <Button variant="primary" icon={<BadgeCheck size={14} />} loading={submit.submitting} onClick={() => void confirm()}>
            {decision?.kind === 'accept' ? 'Accept plan' : 'Save plan'}
          </Button>
        </>
      }
    >
      {planOpen ? (
        <div className="stack">
          <FormError message={modulesError ? null : submit.error} />
          <div className="stack" style={{ gap: 6 }}>
            <h3 className="plan-builder-title">Billing cycle</h3>
            <BillingCycleToggle catalog={catalog} value={cycle} disabled={submit.submitting} onChange={setCycle} />
          </div>
          <ModulePicker
            catalog={catalog}
            value={modules}
            compact
            label="Plan modules"
            error={modulesError}
            disabled={submit.submitting}
            onChange={(next) => {
              setModules(next);
              setLocalError(null);
            }}
          />
          <PlanQuoteSummary catalog={catalog} value={modules} billingCycle={cycle} compact />
        </div>
      ) : null}
    </Modal>
  );

  const rejectDialog = (
    <Modal
      open={decision?.kind === 'reject'}
      title="Reject plan request"
      size="sm"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submit.submitting}>
            Cancel
          </Button>
          <Button variant="danger" icon={<Ban size={14} />} loading={submit.submitting} onClick={() => void confirm()}>
            Reject request
          </Button>
        </>
      }
    >
      {decision?.kind === 'reject' ? (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <FormError message={localError || submit.fieldErrors.reason ? null : submit.error} />
          <p style={{ margin: 0 }}>
            Reject the plan request from <strong>{decision.org.name}</strong>? Its admin sees the reason and can choose again.
            Its trial and data are not changed.
          </p>
          <TextAreaField
            label="Reason"
            required
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            error={localError ?? submit.fieldErrors.reason}
            hint={`Shown to the organization’s admin. ${reason.length}/${REASON_MAX}`}
            onChange={(event) => {
              setReason(event.target.value);
              setLocalError(null);
            }}
            autoFocus
          />
        </form>
      ) : null}
    </Modal>
  );

  const trialDialog = (
    <Modal
      open={decision?.kind === 'trial'}
      title="Extend free trial"
      size="sm"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submit.submitting}>
            Cancel
          </Button>
          <Button variant="primary" icon={<CalendarPlus size={14} />} loading={submit.submitting} onClick={() => void confirm()}>
            Extend trial
          </Button>
        </>
      }
    >
      {decision?.kind === 'trial' ? (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <FormError message={localError || submit.fieldErrors.days ? null : submit.error} />
          <p style={{ margin: 0 }}>
            Give <strong>{decision.org.name}</strong> more time with every module.
            {decision.org.trialEndsAt ? ` The trial currently ends on ${formatDate(decision.org.trialEndsAt)}.` : ''} A locked
            organization is unlocked straight away.
          </p>
          <TextField
            label="Extend by (days)"
            type="number"
            inputMode="numeric"
            min={1}
            max={TRIAL_DAYS_MAX}
            step={1}
            required
            value={days}
            error={localError ?? submit.fieldErrors.days}
            hint={`1 – ${TRIAL_DAYS_MAX}`}
            onChange={(event) => {
              setDays(event.target.value);
              setLocalError(null);
            }}
            autoFocus
          />
        </form>
      ) : null}
    </Modal>
  );

  const dialogs = (
    <>
      {planDialog}
      {rejectDialog}
      {trialDialog}
    </>
  );

  return {
    requestAccept: (org: PlanTarget, start?: PlanStart) => openPlan('accept', org, start),
    requestChangePlan: (org: PlanTarget, start?: PlanStart) => openPlan('change', org, start),
    requestReject,
    requestExtendTrial,
    dialogs,
  };
}
