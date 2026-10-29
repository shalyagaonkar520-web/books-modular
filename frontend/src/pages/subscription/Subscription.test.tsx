import { useEffect, useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, onSubscriptionRequired } from '@/api/client';
import { SubscriptionProvider } from '@/app/SubscriptionContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { TrialBanner } from '@/components/layout/TrialBanner';
import { installMockApi, type RouteMap } from '@/test/mockApi';
import { authResponse, renderWithProviders, testOrganization, testUser } from '@/test/renderWithProviders';

import { SubscriptionPage } from './SubscriptionPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const TRIAL = {
  status: 'trial',
  trialEndsAt: '2026-10-02T10:00:00Z',
  trialDaysLeft: 2,
  locked: false,
  plan: null,
  pendingRequest: null,
  lastRejection: null,
  canManage: true,
};

const STARTER = ['items', 'customers', 'invoices', 'paymentsReceived'];

const PLANS = {
  currency: 'INR',
  tiers: [
    { key: 'u100', label: 'Starter', users: 100, monthly: 299 },
    { key: 'u500', label: 'Business', users: 500, monthly: 599 },
    { key: 'u1000', label: 'Enterprise', users: 1000, monthly: 999 },
  ],
  per100Over: 99,
  customMinimum: 99,
  yearlyMonths: 10,
  payment: { upiId: 'rooman@upi', payeeName: 'Rooman', bankDetails: '', note: 'Pay, then enter the reference.' },
  features: [
    { key: 'invoices', label: 'Invoices', core: true },
    { key: 'pos', label: 'Point of Sale', core: true },
    { key: 'payroll', label: 'Payroll', core: false },
    { key: 'banking', label: 'Banking', core: false },
  ],
};
/** Included in every plan: 199 + 99 + 299 + 149 + 299 + 199 = ₹1,244 a month. */
const CORE = ['items', 'customers', 'invoices', 'paymentsReceived', 'pos', 'accounting', 'reports'];

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderBanner(routes: RouteMap) {
  installMockApi(routes);
  return renderWithProviders(
    <SubscriptionProvider>
      <TrialBanner />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </SubscriptionProvider>,
    { route: '/dashboard' },
  );
}

function renderPage(routes: RouteMap) {
  const mock = installMockApi(routes);
  renderWithProviders(
    <SubscriptionProvider>
      <SubscriptionPage />
    </SubscriptionProvider>,
    { route: '/subscription' },
  );
  return mock;
}

describe('Trial banner', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the days left and takes admins to the plan builder', async () => {
    renderBanner({ 'GET /api/subscription': TRIAL });
    const banner = await screen.findByTestId('trial-banner');
    await waitFor(() => expect(banner).toHaveTextContent('Free trial · 2 days left'));
    fireEvent.click(within(banner).getByRole('button', { name: 'Choose a plan' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/subscription');
  });

  it('starts from the subscription on the signed-in organization', async () => {
    renderBanner({
      'GET /api/auth/me': { ...authResponse, organization: { ...testOrganization, subscription: { ...TRIAL, trialDaysLeft: 0 } } },
      'GET /api/subscription': () => json({ detail: 'down' }, 500),
    });
    expect(await screen.findByTestId('trial-banner')).toHaveTextContent('Free trial · ends today');
  });

  it('says a request is waiting, or why it was declined, and hides once active', async () => {
    const pending = {
      ...TRIAL,
      pendingRequest: { modules: STARTER, billingCycle: 'monthly', monthlyPrice: 1245, planPrice: 1245, requestedAt: '2026-09-30T08:00:00Z' },
    };
    const { unmount } = renderBanner({ 'GET /api/subscription': pending });
    expect(await screen.findByText('Plan request sent — waiting for approval.')).toBeInTheDocument();
    unmount();

    const rejected = renderBanner({
      'GET /api/subscription': { ...TRIAL, lastRejection: { reason: 'Add Items too', decidedAt: '2026-09-30T09:00:00Z' } },
    });
    const banner = await screen.findByTestId('trial-banner');
    await waitFor(() => expect(banner).toHaveTextContent('Your plan request was declined: Add Items too'));
    expect(within(banner).getByRole('button', { name: 'Choose again' })).toBeInTheDocument();
    rejected.unmount();

    renderBanner({
      'GET /api/subscription': {
        ...TRIAL,
        status: 'active',
        plan: { modules: STARTER, billingCycle: 'monthly', monthlyPrice: 1245, planPrice: 1245 },
      },
    });
    await waitFor(() => expect(screen.getByTestId('location')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId('trial-banner')).not.toBeInTheDocument());
  });
});

describe('Subscription page', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the plans by users, prices yearly, and sends the plan with the payment reference', async () => {
    const { calls } = renderPage({
      'GET /api/subscription': TRIAL,
      'GET /api/subscription/plans': PLANS,
      'GET /api/subscription/pay-qr': { svg: '<svg data-testid="pay-qr"></svg>' },
      'POST /api/subscription/plan-request': (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        return json({
          ...TRIAL,
          pendingRequest: { modules: [], billingCycle: body.billingCycle, monthlyPrice: 599, planPrice: 5990, requestedAt: '2026-09-30T08:00:00Z', planKey: body.planKey, maxUsers: 500, paymentReference: body.paymentReference },
        });
      },
    });

    expect(await screen.findByText('Free trial · 2 days left')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Starter.*Up to 100 users.*₹299/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Business.*Up to 500 users.*₹599/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enterprise.*Up to 1,000 users.*₹999/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Yearly/ }));
    fireEvent.click(screen.getByRole('button', { name: /Business/ }));
    expect(screen.getByText('To pay now').parentElement).toHaveTextContent('₹5,990');
    expect(screen.getByText('rooman@upi')).toBeInTheDocument();
    expect(await screen.findByTestId('pay-qr')).toBeInTheDocument();

    const send = screen.getByRole('button', { name: /I have paid/ });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Payment reference/), { target: { value: 'UTR778899' } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST' && call.path === '/api/subscription/plan-request')?.body).toEqual({
        planKey: 'u500',
        billingCycle: 'yearly',
        paymentReference: 'UTR778899',
      }),
    );
  });

  it('prices a custom plan from users and features', async () => {
    renderPage({ 'GET /api/subscription': TRIAL, 'GET /api/subscription/plans': PLANS, 'GET /api/subscription/pay-qr': { svg: null } });
    fireEvent.click(await screen.findByRole('button', { name: /Customize/ }));
    fireEvent.change(screen.getByLabelText(/How many users/), { target: { value: '50' } });
    // Every feature, up to 100 users: the Starter price.
    const toPay = () => screen.getByText('To pay now').parentElement as HTMLElement;
    expect(toPay()).toHaveTextContent('₹299');
    // Core features stay ticked; dropping one of two optional features halves the price (never below ₹99).
    expect(screen.getByRole('checkbox', { name: /Invoices/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Payroll/ }));
    expect(toPay()).toHaveTextContent('₹225');
  });

  it('is read-only for users who are not admins', async () => {
    renderPage({
      'GET /api/auth/me': { ...authResponse, user: { ...testUser, role: 'viewer' } },
      'GET /api/subscription': { ...TRIAL, canManage: false },
    });
    expect(await screen.findByText('Free trial · 2 days left')).toBeInTheDocument();
    expect(screen.getByText('Ask your organization to renew its plan.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I have paid/ })).not.toBeInTheDocument();
  });
});

/** A tenant page that loads data, as every module page does. */
function InvoicesProbe() {
  const [state, setState] = useState('loading');
  useEffect(() => {
    api.get('/invoices').then(
      () => setState('loaded'),
      () => setState('failed'),
    );
  }, []);
  return <p>Invoices page {state}</p>;
}

const LOCKED_402 = () =>
  json({ detail: { code: 'subscription_required', status: 'expired', message: 'Your free trial has ended.' } }, 402);

describe('Locked app', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('announces a 402 subscription_required and keeps its message', async () => {
    installMockApi({ 'GET /api/invoices': LOCKED_402 });
    const seen: string[] = [];
    const stop = onSubscriptionRequired((detail) => seen.push(detail.status ?? ''));
    const error = await api.get('/invoices').catch((err: unknown) => err);
    stop();
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(402);
    expect((error as ApiError).code).toBe('subscription_required');
    expect((error as ApiError).message).toBe('Your free trial has ended.');
    expect(seen).toEqual(['expired']);
  });

  it('shows the lock screen on a 402, lets the admin request a plan, and unlocks once approved', async () => {
    // The trial ran out a moment ago; the subscription has not caught up yet, but the data endpoints refuse.
    let subscription: Record<string, unknown> = { ...TRIAL, trialEndsAt: '2026-09-29T10:00:00Z', trialDaysLeft: 0 };
    let unlocked = false;
    const { calls } = installMockApi({
      'GET /api/subscription': () => subscription,
      'GET /api/invoices': () => (unlocked ? { items: [], total: 0, page: 1, pageSize: 25 } : LOCKED_402()),
      'GET /api/subscription/plans': PLANS,
      'GET /api/subscription/pay-qr': { svg: null },
      'POST /api/subscription/plan-request': (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        subscription = {
          ...subscription,
          status: 'expired',
          locked: true,
          pendingRequest: { modules: CORE, billingCycle: 'monthly', monthlyPrice: 299, planPrice: 299, requestedAt: '2026-09-30T08:00:00Z', planKey: body.planKey, maxUsers: 100, paymentReference: body.paymentReference },
        };
        return subscription;
      },
    });
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/invoices" element={<InvoicesProbe />} />
        </Route>
      </Routes>,
      { route: '/invoices' },
    );

    expect(await screen.findByRole('heading', { name: 'Your free trial has ended — choose a plan to continue' })).toBeInTheDocument();
    expect(screen.queryByText(/Invoices page/)).not.toBeInTheDocument();
    // The header (and sign out) stays.
    expect(screen.getByRole('banner')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /Starter/ }));
    fireEvent.change(screen.getByLabelText(/Payment reference/), { target: { value: 'UTR1234' } });
    fireEvent.click(screen.getByRole('button', { name: /I have paid/ }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST' && call.path === '/api/subscription/plan-request')?.body).toEqual({
        planKey: 'u100',
        billingCycle: 'monthly',
        paymentReference: 'UTR1234',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Waiting for the platform administrator to approve your plan' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I have paid/ })).not.toBeInTheDocument();

    // The platform administrator approves; "Check again" unlocks the app.
    subscription = {
      ...subscription,
      status: 'active',
      locked: false,
      pendingRequest: null,
      plan: { modules: CORE, billingCycle: 'monthly', monthlyPrice: 1743, planPrice: 1743 },
    };
    unlocked = true;
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText('Invoices page loaded')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Waiting for the platform administrator/ })).not.toBeInTheDocument();
  });

  it('tells users who are not admins to ask their admin', async () => {
    installMockApi({
      'GET /api/auth/me': { ...authResponse, user: { ...testUser, role: 'staff' } },
      'GET /api/subscription': { ...TRIAL, status: 'expired', trialDaysLeft: 0, locked: true, canManage: false },
    });
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/invoices" element={<InvoicesProbe />} />
        </Route>
      </Routes>,
      { route: '/invoices' },
    );
    expect(await screen.findByRole('heading', { name: 'Your organization’s free trial has ended' })).toBeInTheDocument();
    expect(screen.getByText('Request your organization to renew the plan.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /I have paid/ })).not.toBeInTheDocument();
  });
});
