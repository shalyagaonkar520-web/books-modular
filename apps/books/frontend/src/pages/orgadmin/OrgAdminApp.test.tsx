import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { DEFAULT_APP_CONTENT, type AppContent } from '@/api/appContent';
import type { OrgAdminDashboard } from '@/api/orgAdmin';
import { AppContentProvider } from '@/app/AppContentContext';
import { RequireAuth } from '@/auth/RouteGuards';
import { AppContentPage } from '@/pages/platform/AppContentPage';
import { installMockApi } from '@/test/mockApi';
import { authResponse, renderWithProviders, testUser } from '@/test/renderWithProviders';

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

function renderPanel(route: string) {
  return renderWithProviders(
    <AppContentProvider>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/org-admin/*" element={<OrgAdminApp />} />
          <Route path="/dashboard" element={<p>Tenant dashboard</p>} />
        </Route>
      </Routes>
    </AppContentProvider>,
    { route },
  );
}

describe('Organization admin panel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('redirects a non-admin to the tenant dashboard', async () => {
    const { calls } = installMockApi({
      'GET /api/auth/me': { ...authResponse, user: { ...testUser, role: 'staff' } },
      'GET /api/app-content': DEFAULT_APP_CONTENT,
    });
    renderPanel('/org-admin/users');
    expect(await screen.findByText('Tenant dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Organization Admin')).not.toBeInTheDocument();
    expect(calls.some((call) => call.path.startsWith('/api/org-admin'))).toBe(false);
  });

  it('opens for an admin, inside its own layout', async () => {
    installMockApi({ 'GET /api/org-admin/dashboard': DASHBOARD, 'GET /api/app-content': DEFAULT_APP_CONTENT });
    renderPanel('/org-admin');
    expect(await screen.findByText('Organization overview')).toBeInTheDocument();
    expect(screen.getByText('Organization Admin')).toBeInTheDocument();
    const nav = screen.getByRole('complementary', { name: 'Organization admin navigation' });
    expect(Array.from(nav.querySelectorAll('a')).map((link) => link.textContent)).toEqual(['Dashboard', 'Users', 'App content', 'Settings']);
    expect(screen.getByRole('button', { name: 'Back to app' })).toBeInTheDocument();
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
  afterEach(() => vi.unstubAllGlobals());

  function renderOrgMode() {
    return renderWithProviders(
      <AppContentProvider>
        <AppContentPage mode="organization" />
      </AppContentProvider>,
      { route: '/org-admin/app-content' },
    );
  }

  it('loads and saves through the org-admin endpoints, with no organization picker', async () => {
    const { calls } = installMockApi({
      'GET /api/org-admin/app-content': orgPayload(SHARED),
      'PUT /api/org-admin/app-content': (_url: URL, init: RequestInit) => json(orgPayload(JSON.parse(String(init.body)))),
      'GET /api/app-content': SHARED,
    });
    renderOrgMode();

    expect(await screen.findByLabelText('Search texts')).toBeInTheDocument();
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
});
