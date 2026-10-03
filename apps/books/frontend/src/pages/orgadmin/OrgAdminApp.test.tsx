import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';

import { DEFAULT_APP_CONTENT } from '@/api/appContent';
import type { OrgAdminDashboard, OrgAdminUserOverview } from '@/api/orgAdmin';
import { setOrgPanelAccessToken } from '@/api/orgPanelClient';
import { AppContentProvider } from '@/app/AppContentContext';
import { Header } from '@/components/layout/Header';
import { installMockApi, page, type MockApi } from '@/test/mockApi';
import { renderWithProviders, testOrganization, testUser } from '@/test/renderWithProviders';

import { OrgAdminApp } from './OrgAdminApp';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const USERS = [
  { ...testUser, id: 'u1', name: 'Khadar Basha' },
  { ...testUser, id: 'u2', name: 'Priya Nair', email: 'priya@example.com', role: 'staff' as const },
];

/** The panel opens on its dashboard. */
const DASHBOARD: OrgAdminDashboard = {
  organizationName: 'Rooman Technologies',
  users: { total: 7, active: 5, suspended: 1, pendingInvites: 1, byRole: { admin: 1, staff: 4, viewer: 2 }, signedInLast30Days: 5 },
  employees: { total: 12, active: 10, inactive: 2, withLogin: 3, joinedLast30Days: 2, byDepartment: { Sales: 6, Ops: 4 } },
  recentUsers: [USERS[1]],
  recentEmployees: [
    {
      id: 'e1',
      employeeCode: 'EMP-001',
      name: 'Ravi Kumar',
      designation: 'Engineer',
      department: 'Ops',
      dateOfJoining: '2026-09-15',
      isActive: true,
      hasLogin: true,
    },
  ],
  recentActivity: [
    {
      id: 'a1',
      userId: 'u1',
      userName: 'Khadar Basha',
      action: 'create',
      entityType: 'invoice',
      entityId: 'i1',
      summary: 'Created invoice INV-00042',
      createdAt: '2026-09-29T10:00:00Z',
    },
  ],
  activityLast7Days: 31,
};

const OVERVIEW: OrgAdminUserOverview = {
  user: USERS[1],
  employee: null,
  performance: {
    invoicesRaised: 4,
    invoicedAmount: 40000,
    collectedAmount: 30000,
    invoicesLast30Days: 2,
    billsRecorded: 1,
    billsAmount: 5000,
    expensesRecorded: 2,
    expensesAmount: 1500,
    hoursLogged: 12.5,
    hoursLast30Days: 6,
    billableHours: 10,
    actionsLast30Days: 9,
    lastActive: '2026-09-30T09:00:00Z',
  },
  pending: {
    invitePending: false,
    draftInvoices: 1,
    openInvoices: 2,
    overdueInvoices: 1,
    outstandingAmount: 10000,
    draftBills: 0,
    invoices: [
      { id: 'i7', invoiceNumber: 'INV-00007', customerName: 'Acme', dueDate: '2026-09-01', status: 'overdue', total: 8000, balanceDue: 8000 },
    ],
    bills: [],
  },
  recentActivity: [],
};

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

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Organization Admin')).toBeInTheDocument();
    expect(screen.getByText('Meera Iyer')).toBeInTheDocument();
    const nav = screen.getByRole('complementary', { name: 'Organization admin navigation' });
    expect(Array.from(nav.querySelectorAll('a')).map((link) => link.textContent)).toEqual(['Dashboard', 'Users', 'Organization', 'Integrations', 'Activity log']);
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
    // Each user opens the panel's own overview, not the tenant per-user dashboard.
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2);
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

  it('edits the organization profile (GST etc.) on the panel endpoints, with no other settings', async () => {
    const { calls } = installMockApi({ ...signedIn, 'GET /api/org-admin/organization': testOrganization });
    renderPanel('/org-admin/organization');
    expect(await screen.findByDisplayValue('Rooman Technologies')).toBeInTheDocument();
    expect(screen.getByLabelText(/GSTIN/)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(calls.some((call) => call.path === '/api/organization' || call.path.startsWith('/api/settings/smtp'))).toBe(false);
    expect(calls.some((call) => call.path.includes('audit-logs'))).toBe(false);
  });

  it.each(['/org-admin/settings', '/org-admin/app-content'])('sends the removed page %s to the dashboard', async (route) => {
    installMockApi({ ...signedIn, 'GET /api/org-admin/dashboard': DASHBOARD });
    renderPanel(route);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toBe('/org-admin');
  });

  it('shows users and employees on the dashboard', async () => {
    installMockApi({ ...signedIn, 'GET /api/org-admin/dashboard': DASHBOARD });
    renderPanel('/org-admin');
    const tile = (label: string) => screen.getAllByText(label, { selector: '.stat-label' })[0].closest('.stat-tile') as HTMLElement;
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(tile('Users')).toHaveTextContent('7');
    expect(tile('Suspended')).toHaveTextContent('1');
    expect(tile('Employees')).toHaveTextContent('12');
    const roles = screen.getByRole('list', { name: 'Users by role' });
    expect(Array.from(roles.querySelectorAll('li')).map((row) => row.textContent)).toEqual(['Admin1', 'Staff4', 'Viewer2', 'Employee0']);
    const departments = screen.getByRole('list', { name: 'Employees by department' });
    expect(Array.from(departments.querySelectorAll('li')).map((row) => row.textContent)).toEqual(['Sales6', 'Ops4']);
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('Created invoice INV-00042')).toBeInTheDocument();
  });

  it('opens a user with their performance and pending work', async () => {
    installMockApi({ ...signedIn, 'GET /api/org-admin/users': USERS, 'GET /api/org-admin/users/u2/overview': OVERVIEW });
    renderPanel('/org-admin/users');
    fireEvent.click(await screen.findByRole('button', { name: 'Priya Nair' }));
    const dialog = await screen.findByRole('dialog', { name: 'Priya Nair' });
    expect(await within(dialog).findByText('Invoices raised')).toBeInTheDocument();
    expect(within(dialog).getByText('75% of invoiced')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Pending (3)' }));
    expect(within(dialog).getByText('INV-00007')).toBeInTheDocument();
    expect(within(dialog).getByText('Overdue', { selector: '.badge' })).toBeInTheDocument();
  });

  it('sets what a staff user can edit, with modules outside the plan disabled', async () => {
    const { calls } = installMockApi({
      ...signedIn,
      'GET /api/org-admin/users': USERS,
      'GET /api/org-admin/users/u2/overview': { ...OVERVIEW, planModules: ['customers', 'invoices', 'items'] },
      'PUT /api/org-admin/users/u2/module-access': (_url: URL, init: RequestInit) =>
        json({ ...USERS[1], moduleAccess: JSON.parse(String(init.body)).modules }),
    });
    renderPanel('/org-admin/users');
    fireEvent.click(await screen.findByRole('button', { name: 'Priya Nair' }));
    const dialog = await screen.findByRole('dialog', { name: 'Priya Nair' });
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Edit access' }));

    const box = (name: RegExp) => within(dialog).getByRole('checkbox', { name });
    // Every module of the plan by default; nothing can be ticked until access is limited.
    expect(box(/^Invoices/)).toBeChecked();
    expect(box(/^Invoices/)).toBeDisabled();
    // Outside the plan: never grantable.
    expect(box(/^Payroll/)).not.toBeChecked();
    expect(box(/^Payroll/)).toBeDisabled();
    expect(within(dialog).getAllByText('Not in plan').length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Only the modules ticked below' }));
    expect(box(/^Payroll/)).toBeDisabled();
    expect(box(/^Invoices/)).toBeEnabled();
    fireEvent.click(box(/^Invoices/));
    fireEvent.click(box(/^Customers/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save access' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT' && call.path === '/api/org-admin/users/u2/module-access')?.body).toEqual({
        modules: ['customers', 'invoices'],
      }),
    );
  });

  it('shows an admin every plan module as editable and offers the role change', async () => {
    const admin = { ...USERS[0], role: 'admin' as const };
    const { calls } = installMockApi({
      ...signedIn,
      'GET /api/org-admin/users': [admin],
      'GET /api/org-admin/users/u1/overview': { ...OVERVIEW, user: admin, planModules: ['customers', 'invoices'] },
      'PATCH /api/org-admin/users/u1': () => json({ detail: 'The organization needs at least one administrator' }, 400),
    });
    renderPanel('/org-admin/users');
    fireEvent.click(await screen.findByRole('button', { name: 'Khadar Basha' }));
    const dialog = await screen.findByRole('dialog', { name: 'Khadar Basha' });
    fireEvent.click(await within(dialog).findByRole('tab', { name: 'Edit access' }));

    const box = (name: RegExp) => within(dialog).getByRole('checkbox', { name });
    expect(box(/^Invoices/)).toBeChecked();
    expect(box(/^Invoices/)).toBeDisabled();
    expect(box(/^Payroll/)).not.toBeChecked();
    expect(within(dialog).getByText(/Admins edit every module in the plan/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Save access' })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'staff' } });
    expect(await within(dialog).findByText('The organization needs at least one administrator')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ role: 'staff' });
  });

  it('shows Razorpay status and syncs for the organization, without the keys form', async () => {
    const status = {
      configured: true,
      connected: true,
      reachable: false,
      mode: 'test',
      key_id_masked: 'rzp_test_AB...YZ',
      webhook_configured: true,
      auto_sync_enabled: false,
      sync_interval_minutes: 30,
      initial_import_days: 30,
      webhook_path: '/api/razorpay/webhook',
      transactions_imported: 42,
      ever_synced: true,
      last_successful_sync: null,
      last_sync: null,
    };
    const { calls } = installMockApi({
      ...signedIn,
      'GET /api/org-admin/integrations/razorpay': status,
      'POST /api/org-admin/integrations/razorpay/sync': { success: true, message: '3 transactions imported', sync: null },
    });
    renderPanel('/org-admin/integrations');
    expect(await screen.findByText('rzp_test_AB...YZ')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    // The keys are platform-wide: no connect, edit or disconnect here.
    expect(screen.queryByRole('button', { name: /Disconnect/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Key secret/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sync now/i }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'POST' && call.path === '/api/org-admin/integrations/razorpay/sync')?.body).toEqual({
        full: false,
      }),
    );
    expect(calls.some((call) => call.path.startsWith('/api/razorpay'))).toBe(false);
  });

  it('shows the full activity log from the panel endpoint', async () => {
    const { calls } = installMockApi({ ...signedIn, 'GET /api/org-admin/audit-logs': page(DASHBOARD.recentActivity) });
    renderPanel('/org-admin/activity');
    expect(await screen.findByText('Created invoice INV-00042')).toBeInTheDocument();
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
});
