import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrgDetail, OrgSummary, SubscriptionRequestItem } from '@/api/platform';
import { installMockApi, page } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { OrgDetailDrawer } from './OrgDetailDrawer';
import { OrganizationsPage } from './OrganizationsPage';
import { PlanRequestsCard } from './PlanRequestsCard';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const DAY = 24 * 60 * 60 * 1000;
/** Two days minus an hour from now: "2 days left". */
const inTwoDays = () => new Date(Date.now() + 2 * DAY - 60 * 60 * 1000).toISOString();

const ADMIN = {
  id: 'u1',
  name: 'Ravi Kumar',
  email: 'ravi@acme.example',
  role: 'admin',
  isActive: true,
  organizationId: 'org1',
  organizationName: 'Acme Traders',
  createdAt: '2026-09-20T04:00:00Z',
};

const REQUEST = {
  modules: ['customers', 'invoices'],
  billingCycle: 'yearly' as const,
  monthlyPrice: 897,
  planPrice: 8970,
  requestedAt: '2026-09-29T10:00:00Z',
};

const trialOrg = (): OrgDetail => ({
  id: 'org1',
  name: 'Acme Traders',
  country: 'India',
  currency: 'INR',
  isSuspended: false,
  approvalStatus: 'approved',
  adminEmail: 'ravi@acme.example',
  subscriptionStatus: 'trial',
  trialEndsAt: inTwoDays(),
  plan: null,
  pendingRequest: REQUEST,
  createdAt: '2026-09-20T04:00:00Z',
  userCount: 1,
  invoiceCount: 0,
  billCount: 0,
  contactCount: 0,
  invoicedAmount: 0,
  collectedAmount: 0,
  outstandingReceivables: 0,
  admins: [ADMIN],
  panelAdmins: [],
});

const summary = (overrides: Partial<OrgSummary>): OrgSummary => ({
  id: 'org1',
  name: 'Acme Traders',
  isSuspended: false,
  approvalStatus: 'approved',
  userCount: 1,
  invoiceCount: 0,
  invoicedAmount: 0,
  collectedAmount: 0,
  createdAt: '2026-09-20T04:00:00Z',
  ...overrides,
});

function renderDrawer() {
  return renderWithProviders(<OrgDetailDrawer orgId="org1" onClose={() => undefined} onChanged={() => undefined} />, {
    route: '/platform/organizations',
  });
}

const bodyOf = (calls: Array<{ method: string; path: string; body: unknown }>, path: string) =>
  calls.find((call) => call.method === 'POST' && call.path === path)?.body;

describe('Organization subscriptions (super admin)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows each organization’s trial or plan in the list', async () => {
    installMockApi({
      'GET /api/platform/organizations': page([
        summary({ id: 'a', name: 'Trial Co', subscriptionStatus: 'trial', trialEndsAt: inTwoDays() }),
        summary({
          id: 'b',
          name: 'Active Co',
          subscriptionStatus: 'active',
          plan: { modules: ['items', 'customers', 'invoices', 'paymentsReceived', 'vendors', 'bills'], billingCycle: 'monthly', monthlyPrice: 1594, planPrice: 1594 },
        }),
        summary({ id: 'c', name: 'Expired Co', subscriptionStatus: 'expired', trialEndsAt: '2026-09-01T00:00:00Z' }),
        summary({ id: 'd', name: 'Asking Co', subscriptionStatus: 'trial', trialEndsAt: inTwoDays(), pendingRequest: REQUEST }),
        summary({ id: 'e', name: 'New Co', approvalStatus: 'pending' }),
      ]),
    });
    renderWithProviders(<OrganizationsPage />, { route: '/platform/organizations' });

    const table = await screen.findByRole('table', { name: 'Organizations' });
    expect(within(table).getByRole('columnheader', { name: 'Plan' })).toBeInTheDocument();
    const planOf = (name: string) => within(within(table).getByText(name).closest('tr') as HTMLElement);
    expect(planOf('Trial Co').getByText('Trial · 2 days left')).toBeInTheDocument();
    expect(planOf('Active Co').getByText('Active · 6 modules · ₹1,594/mo')).toBeInTheDocument();
    expect(planOf('Expired Co').getByText('Expired')).toBeInTheDocument();
    expect(planOf('Asking Co').getByText('Request pending')).toBeInTheDocument();
    expect(planOf('New Co').getByText('—')).toBeInTheDocument();
  });

  it('shows the trial and the pending request in the drawer, and accepts it adjusted', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': trialOrg(),
      'POST /api/platform/organizations/org1/subscription/approve': { ...trialOrg(), subscriptionStatus: 'active' },
    });
    renderDrawer();

    const card = await screen.findByRole('region', { name: 'Subscription' });
    expect(within(card).getByText('Trial')).toBeInTheDocument();
    expect(within(card).getByTestId('org-subscription-summary')).toHaveTextContent('2 days left');
    const request = within(card).getByRole('group', { name: 'Plan request' });
    expect(within(request).getByText('Customers')).toBeInTheDocument();
    expect(within(request).getByText(/Yearly · ₹8,970\/yr/)).toBeInTheDocument();

    fireEvent.click(within(request).getByRole('button', { name: 'Accept' }));
    const dialog = screen.getByRole('dialog', { name: 'Accept plan request' });
    expect(within(dialog).getByRole('checkbox', { name: 'Customers' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Items' })).not.toBeChecked();
    expect(within(dialog).getByRole('radio', { name: /Yearly/ })).toBeChecked();
    expect(within(dialog).getByTestId('plan-price')).toHaveTextContent('₹8,970/yr');

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Razorpay payments' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Monthly' }));
    expect(within(dialog).getByTestId('plan-price')).toHaveTextContent('₹1,096/mo');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept plan' }));

    await waitFor(() =>
      expect(bodyOf(calls, '/api/platform/organizations/org1/subscription/approve')).toEqual({
        modules: ['customers', 'invoices', 'razorpay'],
        billingCycle: 'monthly',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Accept plan request' })).not.toBeInTheDocument());
  });

  it('rejects a request with a reason', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': trialOrg(),
      'POST /api/platform/organizations/org1/subscription/reject': { ...trialOrg(), pendingRequest: null },
    });
    renderDrawer();
    const request = await screen.findByRole('group', { name: 'Plan request' });
    fireEvent.click(within(request).getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject plan request' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject request' }));
    expect(await within(dialog).findByText('Enter a reason for the organization’s admin.')).toBeInTheDocument();
    expect(bodyOf(calls, '/api/platform/organizations/org1/subscription/reject')).toBeUndefined();

    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: 'Payroll is not available in your region yet.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject request' }));
    await waitFor(() =>
      expect(bodyOf(calls, '/api/platform/organizations/org1/subscription/reject')).toEqual({
        reason: 'Payroll is not available in your region yet.',
      }),
    );
  });

  it('extends a trial', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': { ...trialOrg(), pendingRequest: null },
      'POST /api/platform/organizations/org1/trial': trialOrg(),
    });
    renderDrawer();
    const card = await screen.findByRole('region', { name: 'Subscription' });
    fireEvent.click(within(card).getByRole('button', { name: 'Extend trial' }));
    const dialog = screen.getByRole('dialog', { name: 'Extend free trial' });

    fireEvent.change(within(dialog).getByLabelText(/Extend by/), { target: { value: '120' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Extend trial' }));
    expect(await within(dialog).findByText('Enter whole days between 1 and 90.')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/Extend by/), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Extend trial' }));
    await waitFor(() => expect(bodyOf(calls, '/api/platform/organizations/org1/trial')).toEqual({ days: 10 }));
  });

  it('changes the plan of an active organization through the approve endpoint', async () => {
    const active: OrgDetail = {
      ...trialOrg(),
      subscriptionStatus: 'active',
      pendingRequest: null,
      plan: { modules: ['customers', 'invoices'], billingCycle: 'monthly', monthlyPrice: 897, planPrice: 897 },
    };
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': active,
      'POST /api/platform/organizations/org1/subscription/approve': active,
    });
    renderDrawer();
    const card = await screen.findByRole('region', { name: 'Subscription' });
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByTestId('org-subscription-summary')).toHaveTextContent('2 modules · Monthly · ₹897/mo');
    // No trial to extend once a plan is active.
    expect(within(card).queryByRole('button', { name: 'Extend trial' })).not.toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Change plan' }));
    const dialog = screen.getByRole('dialog', { name: 'Change plan' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Yearly/ }));
    expect(within(dialog).getByTestId('plan-price')).toHaveTextContent('₹8,970/yr');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save plan' }));
    await waitFor(() =>
      expect(bodyOf(calls, '/api/platform/organizations/org1/subscription/approve')).toEqual({
        modules: ['customers', 'invoices'],
        billingCycle: 'yearly',
      }),
    );
  });

  it('says the trial starts on approval for an organization awaiting approval', async () => {
    installMockApi({
      'GET /api/platform/organizations/org1': { ...trialOrg(), approvalStatus: 'pending', subscriptionStatus: null, pendingRequest: null },
    });
    renderDrawer();
    const card = await screen.findByRole('region', { name: 'Subscription' });
    expect(within(card).getByText(/starts when you approve/)).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Change plan' })).not.toBeInTheDocument();
  });
});

describe('Plan requests (Subscriptions & Pricing)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const ITEM: SubscriptionRequestItem = {
    organizationId: 'org1',
    organizationName: 'Acme Traders',
    requestedAt: '2026-09-29T10:00:00Z',
    modules: ['customers', 'invoices'],
    billingCycle: 'monthly',
    monthlyPrice: 897,
    planPrice: 897,
    subscriptionStatus: 'expired',
    trialEndsAt: '2026-09-28T10:00:00Z',
  };

  it('lists requests and accepts one as sent', async () => {
    let served: SubscriptionRequestItem[] = [ITEM];
    const { calls } = installMockApi({
      'GET /api/platform/subscription-requests': () => served,
      'POST /api/platform/organizations/org1/subscription/approve': () => {
        served = [];
        return json({ ok: true });
      },
    });
    renderWithProviders(<PlanRequestsCard />, { route: '/platform/subscriptions' });

    const table = await screen.findByRole('table', { name: 'Plan requests' });
    expect(within(table).getByText('Acme Traders')).toBeInTheDocument();
    expect(within(table).getByText('Invoices')).toBeInTheDocument();
    expect(within(table).getByText('₹897/mo')).toBeInTheDocument();
    expect(within(table).getByText('Expired')).toBeInTheDocument();

    fireEvent.click(within(table).getByRole('button', { name: 'Accept plan for Acme Traders' }));
    const dialog = screen.getByRole('dialog', { name: 'Accept plan request' });
    expect(within(dialog).getByRole('radio', { name: 'Monthly' })).toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept plan' }));

    await waitFor(() =>
      expect(bodyOf(calls, '/api/platform/organizations/org1/subscription/approve')).toEqual({
        modules: ['customers', 'invoices'],
        billingCycle: 'monthly',
      }),
    );
    expect(await screen.findByText('No plan requests')).toBeInTheDocument();
  });

  it('rejects a request with a reason', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/subscription-requests': [ITEM],
      'POST /api/platform/organizations/org1/subscription/reject': { ok: true },
    });
    renderWithProviders(<PlanRequestsCard />, { route: '/platform/subscriptions' });
    fireEvent.click(await screen.findByRole('button', { name: 'Reject plan for Acme Traders' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject plan request' });
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: 'Please add Items too.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject request' }));
    await waitFor(() =>
      expect(bodyOf(calls, '/api/platform/organizations/org1/subscription/reject')).toEqual({ reason: 'Please add Items too.' }),
    );
  });

  it('shows an empty state', async () => {
    installMockApi({ 'GET /api/platform/subscription-requests': [] });
    renderWithProviders(<PlanRequestsCard />, { route: '/platform/subscriptions' });
    expect(await screen.findByText('No plan requests')).toBeInTheDocument();
  });
});
