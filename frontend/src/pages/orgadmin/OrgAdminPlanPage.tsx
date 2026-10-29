/** The organization's plan in the admin panel: users against the limit, renew / change, and ask for more users. */
import { useNavigate } from 'react-router-dom';
import { MessageSquarePlus } from 'lucide-react';

import { orgPanelClient } from '@/api/orgPanelClient';
import { panelPlanApi } from '@/api/plans';
import { normalizeSubscription } from '@/api/subscription';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { useModulePricing } from '@/hooks/useModulePricing';
import { SubscriptionStatusCard } from '@/pages/subscription/PlanBuilder';
import { PlanChooser } from '@/pages/subscription/PlanChooser';

export function OrgAdminPlanPage() {
  const navigate = useNavigate();
  const catalog = useModulePricing();
  const sub = useAsync(async () => normalizeSubscription(await orgPanelClient.get<unknown>('/org-admin/subscription')), []);

  const askForUsers = () =>
    navigate('/org-admin/requests', {
      state: {
        preset: {
          category: 'users',
          subject: 'We need more users',
          message: `We have ${sub.data?.usersUsed ?? '?'} users and our plan allows ${sub.data?.userLimit ?? '?'}. We need: `,
        },
      },
    });

  return (
    <div className="stack">
      <PageHeader
        title="Plan"
        subtitle="Your plan, how many users it allows, and renewing it."
        actions={
          <Button variant="secondary" icon={<MessageSquarePlus size={15} />} onClick={askForUsers}>
            Request more users
          </Button>
        }
      />
      {sub.loading && !sub.data ? <LoadingBlock /> : null}
      {sub.error ? <ErrorBlock message={sub.error} onRetry={sub.reload} /> : null}
      {sub.data ? (
        <>
          <SubscriptionStatusCard subscription={sub.data} catalog={catalog} />
          {sub.data.userLimit && (sub.data.usersUsed ?? 0) >= sub.data.userLimit ? (
            <div className="alert alert-warning">
              All {sub.data.userLimit} users of your plan are in use. Choose a bigger plan below, or use “Request more users”.
            </div>
          ) : null}
          <Card
            title={sub.data.plan ? 'Renew or change your plan' : 'Choose a plan'}
            subtitle="Plans by number of users. Pay by UPI or bank transfer, then send the payment reference; the plan starts once the platform confirms it."
          >
            <PlanChooser planApi={panelPlanApi} currentUsers={sub.data.usersUsed} onDone={sub.reload} />
          </Card>
        </>
      ) : null}
    </div>
  );
}
