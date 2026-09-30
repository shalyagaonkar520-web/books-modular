import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';

import { DEFAULT_APP_CONTENT, type AppContent } from '@/api/appContent';
import type { OrgAdminDashboard } from '@/api/orgAdmin';
import { setOrgPanelAccessToken } from '@/api/orgPanelClient';
import { AppContentProvider } from '@/app/AppContentContext';
import { Header } from '@/components/layout/Header';
import { AppContentPage } from '@/pages/platform/AppContentPage';
import { installMockApi, page, type MockApi } from '@/test/mockApi';
import { renderWithProviders, testOrganization, testUser } from '@/test/renderWithProviders';

import { OrgAdminApp } from './OrgAdminApp';
import { OrgAdminDashboardPage } from './OrgAdminDashboardPage';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const DASHBOARD: OrgAdminDashboard = {
  organization: { id: 'org1', name: 'Rooman Technologies', createdAt: '2026-04-01T04:00:00Z', approvalStatus: 'approved' },
  users: { total: 7, active: 6, inactive: 1, pendingInvites: 2, byRole: { admin: 1, staff: 4, viewer: 2 }, signedInLast30Days: 5 },
  recentUsers: [
    { ...testUser, id: 'u2', name: 'Priya Nair', email: 'priya@example.com', role: 'staff', lastLoginAt: null },
    { ...testUser, id: 'u3', name: 'Arun Rao', email: 'arun@example.com', role: 'viewer', pendingInvite: true, isActive: false },
  ],
  recentActivity: [
    { id: 'a1', userId: 'u1', userName: 'Khadar Basha', action: 'invoice.create', entityType: 'invoice', entityId: 'i1', summary: 'Created invoice INV-00042', createdAt: '2026-09-29T10:00:00Z' },
  ],
  activityLast7Days: 31,
  appContent: { customizedFields: 3, disabledModules: ['payroll', 'razorpay'] },
};

const SHARED: AppContent = { ...DEFAULT_APP_CONTENT, texts: { ...DEFAULT_APP_CONTENT.texts, 'items.title': 'Catalogue' } };
const orgPayload = (content: AppContent) => ({
  organizationId: 'org1',
  organizationName: 'Rooman Technologies',
  content,
  shared: SHARED,
  overridden: { branding: [], modules: [], texts: [] },
});

const PANEL_SESSION = {
  admin: {
    id: 'pa1',
    name: 'Meera Iyer',
    email: 'meera@rooman.example',
    organizationId: 'org1',
    lastLoginAt: null,
    createdAt: '2026-09-01T04:00:00Z',
  },
  organization: { id: 'org1', name: 'Rooman Technologies' },
};
const PANEL_AUTH = { accessToken: 'panel-token', ...PANEL_SESSION };

/** The panel refresh cookie restores a session. */
const signedIn = { 'POST /api/org-admin/auth/refresh': PANEL_AUTH };
/** No panel refresh cookie. */
const signedOut = { 'POST /api/org-admin/auth/refresh': () => json({ detail: 'Not signed in' }, 401) };

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function renderPanel(route: string) {
  return renderWithProviders(
    <AppContentProvider>
      <Routes>
        <Route path="/org-admin/*" element={<OrgAdminApp />} />
        <Route path="/dashboard" element={<p>Tenant dashboard</p>} />
      </Routes>
      <LocationProbe />
    </AppContentProvider>,
    { route },
  );
}

/** The Authorization header the first request to `path` carried. */
function authHeader(fetchMock: MockApi['fetchMock'], path: string): string | undefined {
  const call = fetchMock.mock.calls.find(([input]) => new URL(String(input), 'http://localhost').pathname === path);
  const headers = (call?.[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined;
  return headers?.Authorization;
}

async function signIn(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText(/^Email/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Organization admin panel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setOrgPanelAccessToken(null);
  });

  it('sends a visitor without a panel session to the panel sign-in, not the tenant app', async () => {
    const { calls } = installMockApi({ ...signedOut, 'GET /api/app-content': DEFAULT_APP_CONTENT });
    renderPanel('/org-admin/users');
    expect(await screen.findByRole('heading', { name: 'Organization admin sign in' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/org-admin/login');
    expect(screen.getByText(/platform administrator created/)).toBeInTheDocument();
    expect(screen.queryByText('Tenant dashboard')).not.toBeInTheDocument();
    expect(calls.some((call) => call.path === '/api/org-admin/users')).toBe(false);
  });

  it('signs in with a panel login and lands on the dashboard', async () => {
    const { calls, fetchMock } = installMockApi({
      ...signedOut,
      'POST /api/org-admin/auth/login': PANEL_AUTH,
      'GET /api/org-admin/dashboard': DASHBOARD,
    });
    renderPanel('/org-admin/login');
    await signIn(' Meera@Rooman.example ', 'S3cret-pass');

    expect(await screen.findByText('Organization overview')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/org-admin');
    expect(calls.find((call) => call.path === '/api/org-admin/auth/login')?.body).toEqual({
      email: 'meera@rooman.example',
      password: 'S3cret-pass',
    });
    // Panel requests carry the panel token.
    expect(authHeader(fetchMock, '/api/org-admin/dashboard')).toBe('Bearer panel-token');
  });

  it('shows the server message when sign-in is refused', async () => {
    installMockApi({
      ...signedOut,
      'POST /api/org-admin/auth/login': () => json({ detail: 'This organization is awaiting approval.' }, 403),
    });
    renderPanel('/org-admin/login');
    await signIn('meera@rooman.example', 'S3cret-pass');
    expect(await screen.findByText('This organization is awaiting approval.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/org-admin/login');
  });

  it('opens for a panel admin inside its own layout, without a tenant session', async () => {
    installMockApi({ ...signedIn, 'GET /api/org-admin/dashboard': DASHBOARD, 'GET /api/app-content': DEFAULT_APP_CONTENT });
    renderPanel('/org-admin');
    expect(await screen.findByText('Organization overview')).toBeInTheDocument();
    expect(screen.getByText('Organization Admin')).toBeInTheDocument();
    expect(screen.getByText('Meera Iyer')).toBeInTheDocument();
    const nav = screen.getByRole('complementary', { name: 'Organization admin navigation' });
    expect(Array.from(nav.querySelectorAll('a')).map((link) => link.textContent)).toEqual(['Dashboard', 'Users', 'App content', 'Settings']);
    expect(screen.queryByRole('button', { name: 'Back to app' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });

  it('changes the panel password through the panel endpoint', async () => {
    const { calls } = installMockApi({
      ...signedIn,
      'GET /api/org-admin/dashboard': DASHBOARD,
      'POST /api/org-admin/auth/change-password': { message: 'Password changed.' },
    });
    renderPanel('/org-admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    const dialog = screen.getByRole('dialog', { name: 'Change password' });
    fireEvent.change(within(dialog).getByLabelText(/^Current password/), { target: { value: 'Old-pass1' } });
    fireEvent.change(within(dialog).getByLabelText(/^New password/), { target: { value: 'New-pass12' } });
    fireEvent.change(within(dialog).getByLabelText(/^Confirm new password/), { target: { value: 'New-pass12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change password' })).not.toBeInTheDocument());
    expect(calls.find((call) => call.path === '/api/org-admin/auth/change-password')?.body).toEqual({
      currentPassword: 'Old-pass1',
      newPassword: 'New-pass12',
    });
    expect(calls.some((call) => call.path.startsWith('/api/platform'))).toBe(false);
  });

  it('signs out through the panel and returns to the panel sign-in', async () => {
    const { calls } = installMockApi({
      ...signedIn,
      'GET /api/org-admin/dashboard': DASHBOARD,
      'POST /api/org-admin/auth/logout': { message: 'Signed out' },
    });
    renderPanel('/org-admin');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Organization admin sign in' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/org-admin/login');
    expect(calls.some((call) => call.method === 'POST' && call.path === '/api/org-admin/auth/logout')).toBe(true);
    expect(calls.some((call) => call.path === '/api/auth/logout')).toBe(false);
  });

  it('manages users through the panel endpoints, without the tenant-only extras', async () => {
    const users = [
      { ...testUser, id: 'u1', name: 'Khadar Basha' },
      { ...testUser, id: 'u2', name: 'Priya Nair', email: 'priya@example.com', role: 'staff' },
    ];
    const { calls, fetchMock } = installMockApi({
      ...signedIn,
      'GET /api/org-admin/users': users,
      'PATCH /api/org-admin/users/u2': { ...users[1], isActive: false },
      'POST /api/org-admin/users': (_url: URL, init: RequestInit) =>
        json({ ...testUser, id: 'u9', ...JSON.parse(String(init.body)) }, 201),
    });
    renderPanel('/org-admin/users');

    expect(await screen.findByText('Priya Nair')).toBeInTheDocument();
    expect(calls.some((call) => call.path === '/api/users')).toBe(false);
    expect(authHeader(fetchMock, '/api/org-admin/users')).toBe('Bearer panel-token');
    // The per-user dashboard (and its PDF) is tenant-only.
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    // A panel admin is not one of these users, so each of them can be deleted.
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[1]);
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'PATCH' && call.path === '/api/org-admin/users/u2')).toBe(true),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));
    const dialog = await screen.findByRole('dialog');
    const role = within(dialog).getByLabelText(/^Role/) as HTMLSelectElement;
    // Employee invites need the payroll employee list, which the panel does not have.
    expect(Array.from(role.options).map((option) => option.value)).toEqual(['admin', 'staff', 'viewer']);
    expect(calls.some((call) => call.path.startsWith('/api/payroll'))).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/^Full name/), { target: { value: 'Arun Rao' } });
    fireEvent.change(within(dialog).getByLabelText(/^Email/), { target: { value: 'arun@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST' && call.path === '/api/org-admin/users')?.body).toMatchObject({
        name: 'Arun Rao',
        email: 'arun@example.com',
        role: 'staff',
      }),
    );
  });

  it('offers only the Organization and Activity log settings, on the panel endpoints', async () => {
    const { calls } = installMockApi({
      ...signedIn,
      'GET /api/org-admin/organization': testOrganization,
      'GET /api/org-admin/audit-logs': page([]),
    });
    renderPanel('/org-admin/settings');
    expect(await screen.findByDisplayValue('Rooman Technologies')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Organization', 'Activity log']);
    expect(calls.some((call) => call.path === '/api/organization' || call.path.startsWith('/api/settings/smtp'))).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: 'Activity log' }));
    await waitFor(() => expect(calls.some((call) => call.path === '/api/org-admin/audit-logs')).toBe(true));
    expect(calls.some((call) => call.path === '/api/audit-logs')).toBe(false);
  });

  it('is no longer linked from the tenant header profile menu', async () => {
    installMockApi({ 'GET /api/dashboard/notifications': { items: [], count: 0 } });
    const { container } = renderWithProviders(<Header onToggleSidebar={() => undefined} />);
    await waitFor(() => expect(container.querySelector('.profile-btn')).toHaveTextContent('KB'));
    fireEvent.click(container.querySelector('.profile-btn') as HTMLElement);
    expect(await screen.findByText('My Account')).toBeInTheDocument();
    expect(screen.queryByText('Admin panel')).not.toBeInTheDocument();
  });

  it('renders the dashboard stats from the API', async () => {
    installMockApi({ 'GET /api/org-admin/dashboard': DASHBOARD });
    renderWithProviders(<OrgAdminDashboardPage />);

    const tile = (label: string) => screen.getByText(label, { selector: '.stat-label' }).closest('.stat-tile') as HTMLElement;
    expect(await screen.findByText('Organization overview')).toBeInTheDocument();
    expect(tile('Users')).toHaveTextContent('7');
    expect(tile('Active')).toHaveTextContent('6');
    expect(tile('Pending invites')).toHaveTextContent('2');
    expect(tile('Signed in last 30 days')).toHaveTextContent('5');
    expect(tile('Activity last 7 days')).toHaveTextContent('31');
    expect(tile('Customized app fields')).toHaveTextContent('3');

    const roles = screen.getByRole('list', { name: 'Users by role' });
    expect(Array.from(roles.querySelectorAll('li')).map((row) => row.textContent)).toEqual(['Admin1', 'Staff4', 'Viewer2', 'Employee0']);

    expect(screen.getByText('Priya Nair')).toBeInTheDocument();
    expect(screen.getByText('Invite pending')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByText('Created invoice INV-00042')).toBeInTheDocument();
    expect(screen.getByText('Payroll')).toBeInTheDocument();
    expect(screen.getByText('Razorpay payments')).toBeInTheDocument();
  });
});

describe('AppContentPage in organization mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setOrgPanelAccessToken(null);
  });

  function renderOrgMode() {
    return renderWithProviders(
      <AppContentProvider>
        <AppContentPage mode="organization" />
      </AppContentProvider>,
      { route: '/org-admin/app-content' },
    );
  }

  it('loads and saves through the org-admin endpoints on the panel session, with no organization picker', async () => {
    setOrgPanelAccessToken('panel-token');
    const { calls, fetchMock } = installMockApi({
      'GET /api/org-admin/app-content': orgPayload(SHARED),
      'PUT /api/org-admin/app-content': (_url: URL, init: RequestInit) => json(orgPayload(JSON.parse(String(init.body)))),
      'GET /api/app-content': SHARED,
    });
    renderOrgMode();

    expect(await screen.findByLabelText('Search texts')).toBeInTheDocument();
    expect(authHeader(fetchMock, '/api/org-admin/app-content')).toBe('Bearer panel-token');
    expect(screen.getByText('Rooman Technologies', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/0 customized fields/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Apply changes to')).not.toBeInTheDocument();
    expect(screen.queryByText(/Workspace/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove customizations' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search texts'), { target: { value: 'items.title' } });
    const title = screen.getByLabelText('Title');
    expect(title).toHaveAttribute('placeholder', 'Catalogue');
    fireEvent.change(title, { target: { value: 'Our products' } });
    expect(screen.getByText('Customized')).toBeInTheDocument();
    expect(screen.getByText(/1 customized field/)).toBeInTheDocument();

    const liveReadsBefore = calls.filter((call) => call.path === '/api/app-content').length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument());

    const body = calls.find((call) => call.method === 'PUT' && call.path === '/api/org-admin/app-content')?.body as AppContent;
    expect(body.texts['items.title']).toBe('Our products');
    expect(calls.some((call) => call.path.startsWith('/api/platform'))).toBe(false);
    await waitFor(() => expect(calls.filter((call) => call.path === '/api/app-content').length).toBeGreaterThan(liveReadsBefore));
  });

  it('shows a 422 from the panel on the field it is about', async () => {
    installMockApi({
      'GET /api/org-admin/app-content': orgPayload(SHARED),
      'PUT /api/org-admin/app-content': () =>
        json({ detail: [{ loc: ['body', 'texts', 'items.title'], msg: 'Too long for a title' }] }, 422),
    });
    renderOrgMode();

    fireEvent.change(await screen.findByLabelText('Search texts'), { target: { value: 'items.title' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Our products' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Too long for a title')).toBeInTheDocument();
    expect(screen.getByText('1 issue')).toBeInTheDocument();
  });
});
