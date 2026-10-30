/**
 * The Admin console (/admin): everything an organization's admins run, inside
 * the app - like Zoho's admin console. Opened from the profile menu. The person
 * who created the organization is its first admin; there are no separate
 * admin logins.
 */
import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  CreditCard,
  FileClock,
  History,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  MessageSquarePlus,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { api, downloadFile } from '@/api/client';
import { ApiScopeProvider, type ApiScopeValue } from '@/api/ApiScope';
import { tenantPlanApi } from '@/api/plans';
import { trialStateOf } from '@/pages/subscription/PlanCards';
import { normalizeSubscription } from '@/api/subscription';
import type { User } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAsync } from '@/hooks/useAsync';
import { useModulePricing } from '@/hooks/useModulePricing';
import { ActivityLogSettings } from '@/pages/settings/ActivityLogSettings';
import { ExportAllCard } from '@/pages/settings/ExportAllCard';
import { OrganizationSettings } from '@/pages/settings/OrganizationSettings';
import { UsersSettings } from '@/pages/settings/UsersSettings';
import { SubscriptionStatusCard } from '@/pages/subscription/PlanBuilder';
import { PlanChooser } from '@/pages/subscription/PlanChooser';

import { UserOverviewModal } from './UserOverviewModal';

const TABS = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users & roles', icon: Users, end: false },
  { to: '/admin/changes', label: 'Change log', icon: FileClock, end: false },
  { to: '/admin/security', label: 'Security', icon: ShieldCheck, end: false },
  { to: '/admin/plan', label: 'Plan', icon: CreditCard, end: false },
  { to: '/admin/organization', label: 'Organization', icon: Building2, end: false },
  { to: '/admin/app-content', label: 'App content', icon: LayoutTemplate, end: false },
  { to: '/admin/activity', label: 'Activity', icon: History, end: false },
];

export function AdminConsole() {
  const { organization } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The shared users / roles / organization screens, with everything an admin may use switched on.
  const scope = useMemo<ApiScopeValue>(
    () => ({
      client: api,
      prefix: '',
      capabilities: { userDashboard: false, employeeInvites: true, customInvites: true, customRoles: true },
      actor: null,
    }),
    [],
  );
  return (
    <div className="stack admin-console">
      <PageHeader
        title="Admin console"
        subtitle={`Users, roles, plan, security and every change in ${organization?.name ?? 'your organization'}. Only admins see this.`}
        actions={
          <Button variant="secondary" icon={<LifeBuoy size={15} />} onClick={() => navigate('/support')}>
            Support
          </Button>
        }
      />
      <nav className="console-tabs" aria-label="Admin console">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `console-tab ${isActive ? 'is-active' : ''}`}>
            <tab.icon size={15} aria-hidden="true" />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
      <ApiScopeProvider value={scope}>
        <Outlet key={pathname} />
      </ApiScopeProvider>
    </div>
  );
}

export function AdminUsersPage() {
  const [viewing, setViewing] = useState<User | null>(null);
  // Bumped when the user window closes so the list picks up a role changed there.
  const [listVersion, setListVersion] = useState(0);
  return (
    <>
      <UsersSettings key={listVersion} onViewUser={setViewing} />
      {viewing ? (
        <UserOverviewModal
          user={viewing}
          onClose={() => {
            setViewing(null);
            setListVersion((version) => version + 1);
          }}
        />
      ) : null}
    </>
  );
}

export function AdminOrganizationPage() {
  return (
    <>
      <OrganizationSettings />
      <ExportAllCard download={(name) => downloadFile('/organization/export', name)} />
    </>
  );
}

export function AdminActivityPage() {
  return <ActivityLogSettings />;
}

/** The plan: users against the limit, renew / change, and ask Support for more users. */
export function AdminPlanPage() {
  const navigate = useNavigate();
  const catalog = useModulePricing();
  const sub = useAsync(async () => normalizeSubscription(await api.get<unknown>('/subscription')), []);

  const askForUsers = () =>
    navigate('/support', {
      state: {
        preset: {
          category: 'users',
          subject: 'We need more users',
          message: `We have ${sub.data?.usersUsed ?? '?'} users and our plan allows ${sub.data?.userLimit ?? '?'}. We need: `,
        },
      },
    });

  return (
    <>
      {sub.loading && !sub.data ? <LoadingBlock /> : null}
      {sub.error ? <ErrorBlock message={sub.error} onRetry={sub.reload} /> : null}
      {sub.data ? (
        <>
          <SubscriptionStatusCard subscription={sub.data} catalog={catalog} />
          {sub.data.userLimit && (sub.data.usersUsed ?? 0) >= sub.data.userLimit ? (
            <div className="alert alert-warning">
              All {sub.data.userLimit} users of your plan are in use. Choose a bigger plan below, or ask Support for more users.
            </div>
          ) : null}
          <Card
            title={sub.data.plan ? 'Renew or change your plan' : 'Choose a plan'}
            subtitle="Plans by number of users. Pay online by UPI, card or net banking; the plan starts as soon as the payment goes through."
            actions={
              <Button variant="secondary" size="sm" icon={<MessageSquarePlus size={15} />} onClick={askForUsers}>
                Request more users
              </Button>
            }
          >
            <PlanChooser planApi={tenantPlanApi} currentUsers={sub.data.usersUsed} onDone={sub.reload} trial={trialStateOf(sub.data.status)} />
          </Card>
        </>
      ) : null}
    </>
  );
}
