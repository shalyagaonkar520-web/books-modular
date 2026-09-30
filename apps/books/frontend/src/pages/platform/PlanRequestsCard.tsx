import { BadgeCheck, Ban } from 'lucide-react';

import { cycleLabel, cycleSuffix, formatPrice } from '@/api/modulePricing';
import { platformApi, type SubscriptionRequestItem } from '@/api/platform';
import { ModuleBadges } from '@/components/modules/ModulePicker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { useAsync } from '@/hooks/useAsync';
import { useModulePricing } from '@/hooks/useModulePricing';
import { formatDateTime } from '@/utils/format';

import { SubscriptionStatusBadge, trialLabel, usePlanDecisions } from './subscriptionActions';

/**
 * Plan requests sent by organization admins (modules + billing cycle), with
 * Accept (optionally adjusted) and Reject. Top of Subscriptions & Pricing.
 */
export function PlanRequestsCard() {
  const catalog = useModulePricing();
  const requests = useAsync((signal) => platformApi.subscriptions.requests(signal), []);
  const decisions = usePlanDecisions({ onChanged: () => requests.reload() });
  const rows = requests.data ?? [];

  const columns: Array<Column<SubscriptionRequestItem>> = [
    {
      key: 'org',
      header: 'Organization',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.organizationName}</span>
          <small>Requested {formatDateTime(row.requestedAt)}</small>
        </div>
      ),
    },
    {
      key: 'modules',
      header: 'Requested modules',
      render: (row) => (
        <div style={{ minWidth: 200 }}>
          <ModuleBadges catalog={catalog} value={row.modules} />
        </div>
      ),
    },
    { key: 'cycle', header: 'Cycle', render: (row) => cycleLabel(row.billingCycle) },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (row) => (
        <div className="cell-stack" style={{ alignItems: 'flex-end', whiteSpace: 'nowrap' }}>
          <span className="num strong">
            {formatPrice(row.planPrice, catalog.currency)}
            {cycleSuffix(row.billingCycle)}
          </span>
          {row.billingCycle === 'yearly' ? <small className="num">{formatPrice(row.monthlyPrice, catalog.currency)}/mo</small> : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trial',
      render: (row) => (
        <div className="cell-stack">
          <SubscriptionStatusBadge status={row.subscriptionStatus} />
          {row.subscriptionStatus === 'trial' ? <small>{trialLabel(row.trialEndsAt).replace('Trial · ', '')}</small> : null}
          {row.subscriptionStatus === 'expired' ? <small>Locked until approved</small> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => {
        const target = { id: row.organizationId, name: row.organizationName, trialEndsAt: row.trialEndsAt };
        return (
          <div className="row-actions">
            <Button
              variant="primary"
              size="sm"
              icon={<BadgeCheck size={14} />}
              aria-label={`Accept plan for ${row.organizationName}`}
              onClick={() => decisions.requestAccept(target, { modules: row.modules, billingCycle: row.billingCycle })}
            >
              Accept
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Ban size={14} />}
              aria-label={`Reject plan for ${row.organizationName}`}
              onClick={() => decisions.requestReject(target)}
            >
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  let body;
  if (requests.loading && !requests.data) body = <SkeletonRows rows={3} columns={6} />;
  else if (requests.error && !requests.data) body = <ErrorBlock message={requests.error} onRetry={requests.reload} />;
  else if (!rows.length)
    body = (
      <EmptyState
        title="No plan requests"
        description="When an organization’s admin chooses modules and a billing cycle, the request appears here for you to accept or reject."
      />
    );
  else
    body = (
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.organizationId} caption="Plan requests" />
    );

  return (
    <Card
      title="Plan requests"
      subtitle={
        rows.length
          ? `${rows.length} request${rows.length === 1 ? '' : 's'} waiting for your decision`
          : 'Organizations start on a free trial with every module, then their admin requests a plan.'
      }
      className={rows.length ? 'card-attention' : undefined}
    >
      <div aria-busy={requests.loading}>{body}</div>
      {decisions.dialogs}
    </Card>
  );
}
