import { Users } from 'lucide-react';

import { useSubscription } from '@/app/SubscriptionContext';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useModulePricing } from '@/hooks/useModulePricing';

import { tenantPlanApi } from '@/api/plans';

import { SubscriptionStatusCard } from './PlanBuilder';
import { PlanChooser } from './PlanChooser';

/** Ask-your-admin note for users who cannot choose the plan. */
export function AskAdminNote({ children = 'Ask your organization to renew its plan.' }: { children?: string }) {
  return (
    <p className="subscription-ask-admin">
      <Users size={16} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * /subscription: the organization's trial / plan, and (for admins) the plan
 * builder that sends a request to the platform administrator.
 */
export function SubscriptionPage() {
  const { subscription, loading, canManage, reload } = useSubscription();
  const catalog = useModulePricing();

  let body;
  if (loading && !subscription) {
    body = (
      <div className="card">
        <LoadingBlock label="Loading your subscription…" />
      </div>
    );
  } else if (!subscription) {
    body = (
      <div className="card">
        <ErrorBlock message="Could not load your subscription." onRetry={() => void reload()} />
      </div>
    );
  } else {
    body = (
      <div className="stack">
        <SubscriptionStatusCard subscription={subscription} catalog={catalog} />
        {canManage ? (
          <Card
            title={subscription.plan ? 'Renew or change your plan' : 'Choose a plan'}
            subtitle="Plans by number of users. Pay by UPI or bank transfer, then send the payment reference; the plan starts once it is confirmed."
          >
            <PlanChooser planApi={tenantPlanApi} currentUsers={subscription.usersUsed} onDone={() => void reload()} />
          </Card>
        ) : (
          <Card>
            <AskAdminNote />
          </Card>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Subscription" subtitle="Your free trial, plan and billing." />
      {body}
    </>
  );
}
