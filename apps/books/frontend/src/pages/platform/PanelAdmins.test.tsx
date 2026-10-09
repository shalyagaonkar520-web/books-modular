import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrgDetail, OrgPanelAdminItem } from '@/api/platform';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { OrgDetailDrawer } from './OrgDetailDrawer';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ORG: OrgDetail = {
  id: 'org1',
  name: 'Acme Traders',
  code: 'acme-traders',
  country: 'India',
  currency: 'INR',
  isSuspended: false,
  approvalStatus: 'pending',
  adminEmail: 'ravi@acme.example',
  createdAt: '2026-09-20T04:00:00Z',
  userCount: 1,
  invoiceCount: 0,
  billCount: 0,
  contactCount: 0,
  invoicedAmount: 0,
  collectedAmount: 0,
  outstandingReceivables: 0,
  admins: [
    {
      id: 'u1',
      name: 'Ravi Kumar',
      email: 'ravi@acme.example',
      role: 'admin',
      isActive: true,
      organizationId: 'org1',
      organizationName: 'Acme Traders',
      createdAt: '2026-09-20T04:00:00Z',
    },
  ],
  panelAdmins: [],
};

const PANEL_ADMIN: OrgPanelAdminItem = {
  id: 'pa1',
  name: 'Ravi Kumar',
  email: 'ravi@acme.example',
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-09-21T04:00:00Z',
  createdBy: 'ops@rooman.example',
};

function renderDrawer() {
  return renderWithProviders(<OrgDetailDrawer orgId="org1" onClose={() => undefined} onChanged={() => undefined} />, {
    route: '/platform/organizations',
  });
}

async function openApproveDialog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Approve Acme Traders' }));
  return screen.getByRole('dialog', { name: 'Approve organization' });
}

const TEMP = { admin: { ...PANEL_ADMIN, email: 'admin@acme-traders', name: 'Admin', mustChangeCredentials: true }, loginId: 'admin@acme-traders', password: 'Tmp-Pass-12345678' };

describe('Approving an organization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('only confirms: no login details are asked for or sent', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': ORG,
      'POST /api/platform/organizations/org1/approve': { ...ORG, approvalStatus: 'approved' },
    });
    renderDrawer();
    const dialog = await openApproveDialog();
    expect(within(dialog).queryByLabelText(/^Password/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Create admin login/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.path === '/api/platform/organizations/org1/approve')).toBe(true));
    expect(calls.find((call) => call.path === '/api/platform/organizations/org1/approve')?.body).toBeUndefined();
  });
});

describe('Admin panel logins tab', () => {
  afterEach(() => vi.unstubAllGlobals());

  const APPROVED = { ...ORG, approvalStatus: 'approved' as const };

  async function openTab() {
    fireEvent.click(await screen.findByRole('tab', { name: 'Admin panel logins' }));
  }

  it('lists the logins with the sign-in URL and their state', async () => {
    installMockApi({
      'GET /api/platform/organizations/org1': APPROVED,
      'GET /api/platform/organizations/org1/panel-admins': [
        PANEL_ADMIN,
        { ...PANEL_ADMIN, id: 'pa2', email: 'admin@acme-traders', name: 'Admin', isActive: false, createdBy: null, mustChangeCredentials: true },
      ],
    });
    renderDrawer();
    expect(await screen.findByRole('button', { name: /Customize app/ })).toBeInTheDocument();
    await openTab();

    const table = await screen.findByRole('table', { name: 'Admin panel logins of Acme Traders' });
    expect(within(table).getByText('ravi@acme.example')).toBeInTheDocument();
    expect(within(table).getByText('Disabled')).toBeInTheDocument();
    expect(within(table).getByText('Awaiting first sign-in')).toBeInTheDocument();
    expect(within(table).getByText('by ops@rooman.example')).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/org-admin/login`)).toBeInTheDocument();
    // An organization with a login gets no second "Create admin login".
    expect(screen.queryByRole('button', { name: 'Create admin login' })).not.toBeInTheDocument();
  });

  it('creates the default admin login and shows its temporary credentials once', async () => {
    let created = false;
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': APPROVED,
      'GET /api/platform/organizations/org1/panel-admins': () => json(created ? [TEMP.admin] : []),
      'POST /api/platform/organizations/org1/panel-admins/default': () => {
        created = true;
        return json(TEMP, 201);
      },
    });
    renderDrawer();
    await openTab();
    expect(await screen.findByText('No admin panel login yet')).toBeInTheDocument();
    expect(screen.getByText(/admin@acme-traders/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create admin login' }));
    const dialog = await screen.findByRole('dialog', { name: 'Admin panel login' });
    expect(within(dialog).getByText('admin@acme-traders')).toBeInTheDocument();
    expect(within(dialog).getByText('Tmp-Pass-12345678')).toBeInTheDocument();
    expect(calls.find((call) => call.path.endsWith('/panel-admins/default'))?.body).toBeUndefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Awaiting first sign-in')).toBeInTheDocument();
  });

  it('resets a password, approves or declines a reset request, disables and deletes a login', async () => {
    const requested = { ...PANEL_ADMIN, resetRequestedAt: '2026-10-06T08:00:00Z' };
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': APPROVED,
      'GET /api/platform/organizations/org1/panel-admins': [requested],
      'PATCH /api/platform/panel-admins/pa1': (_url: URL, init: RequestInit) => json({ ...PANEL_ADMIN, ...JSON.parse(String(init.body)) }),
      'POST /api/platform/panel-admins/pa1/reset-password': { ...TEMP, loginId: 'ravi@acme.example', admin: { ...PANEL_ADMIN, mustChangeCredentials: true } },
      'POST /api/platform/panel-admins/pa1/dismiss-reset': PANEL_ADMIN,
      'DELETE /api/platform/panel-admins/pa1': { message: 'Deleted.' },
    });
    renderDrawer();
    await openTab();
    expect(await screen.findByText('Reset requested')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve reset' }));
    const dialog = await screen.findByRole('dialog', { name: 'Admin panel login' });
    expect(within(dialog).getByText('Tmp-Pass-12345678')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(calls.some((call) => call.method === 'POST' && call.path === '/api/platform/panel-admins/pa1/reset-password')).toBe(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(calls.some((call) => call.path === '/api/platform/panel-admins/pa1/dismiss-reset')).toBe(true));

    const menu = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'More actions for ravi@acme.example' }));
    };
    await menu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Disable' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH' && call.path === '/api/platform/panel-admins/pa1')?.body).toEqual({ isActive: false }),
    );

    await menu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete login' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete admin panel login' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete login' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/platform/panel-admins/pa1')).toBe(true));
  });
});

describe('Panel permissions tab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts from the plan and saves the modules and extras the admin panel may edit', async () => {
    const access = { modules: ['customers', 'invoices'], branding: false, general: false, isDefault: true, planModules: ['customers', 'invoices'] };
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': { ...ORG, approvalStatus: 'approved' as const },
      'GET /api/platform/organizations/org1/panel-content-access': access,
      'PUT /api/platform/organizations/org1/panel-content-access': (_url: URL, init: RequestInit) => {
        const keys = JSON.parse(String(init.body)).keys as string[];
        return json({ ...access, modules: keys.filter((k) => k !== 'branding' && k !== 'general'), branding: keys.includes('branding'), isDefault: false });
      },
    });
    renderDrawer();
    fireEvent.click(await screen.findByRole('tab', { name: 'Panel permissions' }));

    const box = (name: RegExp) => screen.getByRole('checkbox', { name });
    await waitFor(() => expect(box(/^Invoices/)).toBeChecked());
    expect(box(/^Payroll/)).not.toBeChecked();
    expect(screen.getAllByText('Not in plan').length).toBeGreaterThan(0);

    fireEvent.click(box(/^Payroll/));
    fireEvent.click(box(/^Branding/));
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ keys: ['customers', 'invoices', 'payroll', 'branding'] }),
    );
  });
});
