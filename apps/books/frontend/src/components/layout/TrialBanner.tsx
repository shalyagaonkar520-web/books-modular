import { Ban, Clock, Hourglass, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { trialRemaining } from '@/api/subscription';
import { useSubscription } from '@/app/SubscriptionContext';
import { Button } from '@/components/ui/Button';

/**
 * A strip across the tenant app during the free trial: days left and, for
 * admins, a way to choose a plan; after a request, that it is waiting for
 * approval (or why it was declined). Hidden once a plan is active, and while
 * the app is locked (the lock screen says it all).
 */
export function TrialBanner() {
  const { subscription, locked, canManage } = useSubscription();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!subscription || locked || subscription.status === 'active') return null;

  const onPlanPage = pathname === '/subscription';
  const goToPlan = (label: string) =>
    canManage && !onPlanPage ? (
      <Button size="sm" variant="primary" icon={<Sparkles size={14} />} onClick={() => navigate('/subscription')}>
        {label}
      </Button>
    ) : null;

  const trialText = `Free trial · ${trialRemaining(subscription.trialDaysLeft)}`;
  let tone: 'trial' | 'pending' | 'rejected' = 'trial';
  let icon = <Clock size={16} aria-hidden="true" />;
  let text;
  let action = goToPlan('Choose a plan');

  if (subscription.pendingRequest) {
    tone = 'pending';
    icon = <Hourglass size={16} aria-hidden="true" />;
    text = (
      <>
        <strong>Plan request sent — waiting for approval.</strong> {trialText}.
      </>
    );
    action = goToPlan('View request');
  } else if (subscription.lastRejection) {
    tone = 'rejected';
    icon = <Ban size={16} aria-hidden="true" />;
    text = (
      <>
        <strong>Your plan request was declined</strong>
        {subscription.lastRejection.reason ? `: ${subscription.lastRejection.reason}` : '.'} {trialText}.
      </>
    );
    action = goToPlan('Choose again');
  } else {
    text = (
      <>
        <strong>{trialText}</strong>
        {canManage ? ' — every module is included. Choose a plan to keep going after the trial.' : ' — ask your organization admin to choose a plan.'}
      </>
    );
  }

  return (
    <div role="status" className={`trial-banner is-${tone} no-print`} data-testid="trial-banner">
      {icon}
      <span className="trial-banner-text">{text}</span>
      {action}
    </div>
  );
}
