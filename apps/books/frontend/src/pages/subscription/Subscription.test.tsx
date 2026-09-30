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

  it('prices monthly vs yearly and sends the request', async () => {
    const { calls } = renderPage({
      'GET /api/subscription': TRIAL,
      'POST /api/subscription/request': (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { modules: string[]; billingCycle: string };
        return json({
          ...TRIAL,
          pendingRequest: { ...body, monthlyPrice: 1245, planPrice: 12450, requestedAt: '2026-09-30T08:00:00Z' },
        });
      },
      'DELETE /api/subscription/request': { ...TRIAL },
    });

    expect(await screen.findByText('Free trial · 2 days left')).toBeInTheDocument();
    // Starter set: 499 base + 199 + 99 + 299 + 149 = 1,245 a month.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Invoices' })).toBeChecked());
    expect(screen.getByRole('radio', { name: 'Monthly' })).toBeChecked();
    expect(screen.getByTestId('plan-monthly')).toHaveTextContent('₹1,245/mo');
    expect(screen.getByTestId('plan-price')).toHaveTextContent('₹1,245/mo');
    expect(screen.getByTestId('plan-saving')).toHaveTextContent('Switch to yearly billing and save ₹2,490 a year.');
    expect(screen.getByText(/includes Dashboard & Settings/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Yearly/ }));
    expect(screen.getByRole('radio', { name: /Yearly/ })).toHaveTextContent('2 months free');
    expect(screen.getByTestId('plan-monthly')).toHaveTextContent('₹1,245/mo');
    expect(screen.getByTestId('plan-price')).toHaveTextContent('₹12,450/yr');
    expect(screen.getByTestId('plan-saving')).toHaveTextContent('You save ₹2,490 a year compared with monthly billing.');

    // Payroll adds ₹399 a month.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Payroll' }));
    expect(screen.getByTestId('plan-price')).toHaveTextContent('₹16,440/yr');

    fireEvent.click(screen.getByRole('button', { name: 'Send request to administrator' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST' && call.path === '/api/subscription/request')?.body).toEqual({
        modules: [...STARTER, 'payroll'],
        billingCycle: 'yearly',
      }),
    );
    expect(await screen.findByText('Plan request sent — waiting for approval')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update request' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/subscription/request')).toBe(true));
    expect(await screen.findByRole('button', { name: 'Send request to administrator' })).toBeInTheDocument();
  });

  it('asks for at least one module', async () => {
    const { calls } = renderPage({ 'GET /api/subscription': TRIAL });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send request to administrator' }));
    expect(await screen.findByText('Choose at least one module.')).toBeInTheDocument();
    expect(calls.some((call) => call.path === '/api/subscription/request')).toBe(false);
  });

  it('is read-only for users who are not admins', async () => {
    renderPage({
      'GET /api/auth/me': { ...authResponse, user: { ...testUser, role: 'viewer' } },
      'GET /api/subscription': { ...TRIAL, canManage: false },
    });
    expect(await screen.findByText('Free trial · 2 days left')).toBeInTheDocument();
    expect(screen.getByText('Ask your organization admin to choose a plan.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Invoices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send request/i })).not.toBeInTheDocument();
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
      'POST /api/subscription/request': (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { modules: string[]; billingCycle: string };
        subscription = {
          ...subscription,
          status: 'expired',
          locked: true,
          pendingRequest: { ...body, monthlyPrice: 1245, planPrice: 1245, requestedAt: '2026-09-30T08:00:00Z' },
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

    fireEvent.click(await screen.findByRole('button', { name: 'Send request to administrator' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST' && call.path === '/api/subscription/request')?.body).toEqual({
        modules: STARTER,
        billingCycle: 'monthly',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Waiting for the platform administrator to approve your plan' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request to administrator' })).not.toBeInTheDocument();

    // The platform administrator approves; "Check again" unlocks the app.
    subscription = {
      ...subscription,
      status: 'active',
      locked: false,
      pendingRequest: null,
      plan: { modules: STARTER, billingCycle: 'monthly', monthlyPrice: 1245, planPrice: 1245 },
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
    expect(screen.getByText('Ask your organization admin to choose a plan to continue.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Invoices' })).not.toBeInTheDocument();
  });
});
