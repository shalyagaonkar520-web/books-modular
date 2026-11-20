/** Manual mode home: the traditional screens, only the ones this employee's workspace includes. */
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

import { workspaceApi } from '@/api/workspace';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';

import { useRememberServerMode } from './ModeSwitch';

import '@/styles/workspace.css';

/** Feature key -> the page that opens it (mirrors utils/permissions ROUTE_FEATURES). */
const ROUTES: Record<string, string> = {
  customers: '/customers',
  quotes: '/quotes',
  salesOrders: '/sales-orders',
  deliveryChallans: '/delivery-challans',
  invoices: '/invoices',
  recurring: '/recurring-invoices',
  creditNotes: '/credit-notes',
  paymentsReceived: '/payments-received',
  refunds: '/refunds',
  pos: '/pos',
  purchaseOrders: '/purchase-orders',
  bills: '/bills',
  vendorCredits: '/vendor-credits',
  paymentsMade: '/payments-made',
  expenses: '/expenses',
  items: '/items',
  inventory: '/inventory',
  banking: '/banking',
  razorpay: '/razorpay-payments',
  financialHub: '/financial-dashboard',
  receivablesPayables: '/receivables-payables',
  accounting: '/accounting',
  fixedAssets: '/fixed-assets',
  budgets: '/budgets',
  gst: '/gst-filing',
  incomeTax: '/income-tax',
  reports: '/reports',
  insights: '/insights',
  timeTracking: '/time-tracking',
  documents: '/documents',
  payroll: '/payroll',
};

export function ManualHome() {
  const me = useAsync(() => workspaceApi.me(), []);
  const quick = useAsync(() => workspaceApi.quick(), []);
  useRememberServerMode(me.data?.modes.current);

  if (me.loading) return <LoadingBlock label="Loading your workspace…" />;
  if (me.error || !me.data) return <ErrorBlock message={me.error ?? 'Could not open your workspace'} onRetry={me.reload} />;
  const data = me.data;

  return (
    <div className="stack-lg">
      <PageHeader
        title={`Welcome, ${data.name.split(' ')[0]}`}
        subtitle={`${data.workspace.name} · ${data.workspace.department}. You are in Manual mode: the regular screens below are the ones assigned to you.`}
        actions={
          data.modes.allowAuto ? (
            <Link to="/workspace" className="btn btn-primary btn-md">
              <Sparkles size={16} />
              <span>Ask the assistant</span>
            </Link>
          ) : null
        }
      />
      {quick.data?.length ? (
        <Card title="At a glance">
          <div className="cm-grid">
            {quick.data.map((fact) => (
              <div key={fact.tool}>{fact.text}</div>
            ))}
          </div>
        </Card>
      ) : null}
      <Card title="Your screens" subtitle="Only what your administrator assigned to you is listed.">
        {data.features.length === 0 ? (
          <p className="cm-muted">No features have been assigned yet.</p>
        ) : (
          <div className="ws-home-grid">
            {data.features
              .filter((f) => ROUTES[f.key])
              .map((f) => (
                <Link key={f.key} to={ROUTES[f.key]} className="ws-home-tile">
                  <strong>{f.label}</strong>
                  <small>{f.actions.join(' · ')}</small>
                </Link>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}
