import { useState } from 'react';
import { Hourglass, Lock, Pencil, RefreshCw } from 'lucide-react';

import { useSubscription } from '@/app/SubscriptionContext';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useModulePricing } from '@/hooks/useModulePricing';

import { tenantPlanApi } from '@/api/plans';

import { SubscriptionStatusCard } from './PlanBuilder';
import { PlanChooser } from './PlanChooser';
import { AskAdminNote } from './SubscriptionPage';

/**
 * Shown instead of every tenant page once the trial is over without an
 * active plan. Admins choose a plan right here; everyone can check again
 * after the platform administrator approves it.
 */
export function SubscriptionLockScreen() {
  const { subscription, canManage, reload } = useSubscription();
  const catalog = useModulePricing();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [changing, setChanging] = useState(false);
  const pending = subscription?.pendingRequest ?? null;
  const hadPlan = Boolean(subscription?.plan);

  const checkAgain = async () => {
    setChecking(true);
    const next = await reload();
    setChecking(false);
    if (next && !next.locked) toast.success('Your plan is active. Welcome back!');
    else if (next?.pendingRequest) toast.notify('Your plan is still waiting for approval.', 'info');
    else if (!next) toast.error('Could not check your subscription. Please try again.');
  };

  let title: string;
  let lead: string;
  if (pending) {
    title = 'Waiting for the platform administrator to approve your plan';
    lead = 'Your plan request has been sent. The app unlocks as soon as it is approved; this page checks automatically.';
  } else if (canManage) {
    title = hadPlan ? 'Your plan has expired — renew to continue' : 'Your free trial has ended — choose a plan to continue';
    lead = 'Your data is safe. Choose a plan by users, pay by UPI or bank transfer and send the payment reference.';
  } else {
    title = hadPlan ? 'Your organization’s plan has expired' : 'Your organization’s free trial has ended';
    lead = 'Your data is safe. Ask your organization to renew it; the app unlocks as soon as the renewal is confirmed.';
  }

  const showBuilder = canManage && (!pending || changing);

  return (
    <div className="lock-screen">
      <section className="lock-screen-hero" aria-labelledby="lock-screen-title">
        <span className={`lock-screen-icon${pending ? ' is-pending' : ''}`} aria-hidden="true">
          {pending ? <Hourglass size={22} /> : <Lock size={22} />}
        </span>
        <h1 id="lock-screen-title">{title}</h1>
        <p>{lead}</p>
        <div className="lock-screen-actions">
          <Button variant="secondary" icon={<RefreshCw size={15} />} loading={checking} onClick={() => void checkAgain()}>
            Check again
          </Button>
          {canManage && pending && !changing ? (
            <Button variant="secondary" icon={<Pencil size={15} />} onClick={() => setChanging(true)}>
              Change request
            </Button>
          ) : null}
        </div>
        {!canManage ? <AskAdminNote>Request your organization to renew the plan.</AskAdminNote> : null}
      </section>

      {subscription && (pending || subscription.lastRejection) ? (
        <SubscriptionStatusCard subscription={subscription} catalog={catalog} />
      ) : null}

      {showBuilder ? (
        <section className="card" aria-labelledby="lock-plan-title">
          <div className="card-body stack" style={{ gap: 12 }}>
            <h2 className="card-title" id="lock-plan-title">
              {pending ? 'Change your plan request' : 'Choose your plan'}
            </h2>
            <PlanChooser
              planApi={tenantPlanApi}
              currentUsers={subscription?.usersUsed}
              trial="ended"
              onDone={() => {
                setChanging(false);
                void reload();
              }}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
