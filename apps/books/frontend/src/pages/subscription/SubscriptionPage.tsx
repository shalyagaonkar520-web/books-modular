import { Users } from 'lucide-react';

import { useSubscription } from '@/app/SubscriptionContext';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useModulePricing } from '@/hooks/useModulePricing';

import { PlanBuilder, SubscriptionStatusCard } from './PlanBuilder';

/** Ask-your-admin note for users who cannot choose the plan. */
export function AskAdminNote({ children = 'Ask your organization admin to choose a plan.' }: { children?: string }) {
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
            title={subscription.pendingRequest ? 'Change your plan request' : subscription.plan ? 'Change your plan' : 'Choose a plan'}
            subtitle={`Choose modules and a billing cycle. A yearly plan costs ${catalog.yearlyMultiplier} × the monthly price.`}
          >
            <PlanBuilder catalog={catalog} />
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
