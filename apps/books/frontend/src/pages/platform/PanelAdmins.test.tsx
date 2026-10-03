import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrgDetail, OrgPanelAdminItem } from '@/api/platform';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { OrgDetailDrawer } from './OrgDetailDrawer';
import { generateStrongPassword } from './PanelAdminForms';
import { validatePassword } from '@/pages/settings/passwordRules';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ORG: OrgDetail = {
  id: 'org1',
  name: 'Acme Traders',
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

describe('generateStrongPassword', () => {
  it('always satisfies the password rules', () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generateStrongPassword();
      expect(password).toHaveLength(16);
      expect(validatePassword(password)).toBeNull();
    }
  });
});

describe('Approving an organization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates the admin panel login in the same step and shows the credentials once', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': ORG,
      'POST /api/platform/organizations/org1/approve': { ...ORG, approvalStatus: 'approved', panelAdmins: [PANEL_ADMIN] },
    });
    renderDrawer();
    const dialog = await openApproveDialog();

    // Prefilled from the registrant; the password starts empty (typing onto a
    // prefilled one used to save a password nobody knew) and Generate fills it.
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Ravi Kumar');
    expect(within(dialog).getByLabelText(/^Email/)).toHaveValue('ravi@acme.example');
    const password = within(dialog).getByLabelText(/^Password/) as HTMLInputElement;
    expect(password).toHaveValue('');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));
    expect(validatePassword(password.value)).toBeNull();
    expect(within(dialog).getByText(/At least 8 characters/)).toBeInTheDocument();

    // Approval starts the free trial with every module: nothing to choose here.
    expect(within(dialog).queryByRole('group', { name: /modules/i })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/free trial with every module/)).toBeInTheDocument();

    fireEvent.change(password, { target: { value: 'Launch-Day-2026' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and create login' }));

    const credentials = await screen.findByRole('dialog', { name: 'Admin panel login' });
    expect(calls.find((call) => call.method === 'POST' && call.path === '/api/platform/organizations/org1/approve')?.body).toEqual({
      // Approval starts the free trial: no modules are chosen here any more.
      panelAdmin: { name: 'Ravi Kumar', email: 'ravi@acme.example', password: 'Launch-Day-2026' },
    });
    expect(within(credentials).getByText(`${window.location.origin}/org-admin/login`)).toBeInTheDocument();
    expect(within(credentials).getByText('Launch-Day-2026')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Approve organization' })).not.toBeInTheDocument();

    fireEvent.click(within(credentials).getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Launch-Day-2026')).not.toBeInTheDocument();
  });

  it('shows a taken email and a weak password on their fields, leaving the organization pending', async () => {
    let attempt = 0;
    installMockApi({
      'GET /api/platform/organizations/org1': ORG,
      'POST /api/platform/organizations/org1/approve': () => {
        attempt += 1;
        return attempt === 1
          ? json({ detail: 'That email is already used by another admin panel login.' }, 409)
          : json({ detail: [{ loc: ['body', 'panelAdmin', 'password'], msg: 'Password is too common' }] }, 422);
      },
    });
    renderDrawer();
    const dialog = await openApproveDialog();

    fireEvent.change(within(dialog).getByLabelText(/^Password/), { target: { value: 'Launch-Day-2026' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and create login' }));
    expect(await within(dialog).findByText('That email is already used by another admin panel login.')).toHaveClass('field-error');

    fireEvent.change(within(dialog).getByLabelText(/^Email/), { target: { value: 'owner@acme.example' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and create login' }));
    expect(await within(dialog).findByText('Password is too common')).toHaveClass('field-error');
    expect(screen.getByRole('dialog', { name: 'Approve organization' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Admin panel login' })).not.toBeInTheDocument();
  });

  it('checks the password rules before sending', async () => {
    const { calls } = installMockApi({ 'GET /api/platform/organizations/org1': ORG });
    renderDrawer();
    const dialog = await openApproveDialog();
    fireEvent.change(within(dialog).getByLabelText(/^Password/), { target: { value: 'short' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and create login' }));
    expect(await within(dialog).findByText(/at least 8 characters long/)).toBeInTheDocument();
    expect(calls.some((call) => call.path.endsWith('/approve'))).toBe(false);
  });
});

describe('Admin panel logins tab', () => {
  afterEach(() => vi.unstubAllGlobals());

  const APPROVED = { ...ORG, approvalStatus: 'approved' as const };

  async function openTab() {
    fireEvent.click(await screen.findByRole('tab', { name: 'Admin panel logins' }));
  }

  it('lists the logins with the sign-in URL and keeps Customize app', async () => {
    installMockApi({
      'GET /api/platform/organizations/org1': APPROVED,
      'GET /api/platform/organizations/org1/panel-admins': [PANEL_ADMIN, { ...PANEL_ADMIN, id: 'pa2', email: 'old@acme.example', name: 'Old Login', isActive: false, createdBy: null }],
    });
    renderDrawer();
    expect(await screen.findByRole('button', { name: /Customize app/ })).toBeInTheDocument();
    await openTab();

    const table = await screen.findByRole('table', { name: 'Admin panel logins of Acme Traders' });
    expect(within(table).getByText('ravi@acme.example')).toBeInTheDocument();
    expect(within(table).getByText('Active')).toBeInTheDocument();
    expect(within(table).getByText('Disabled')).toBeInTheDocument();
    expect(within(table).getByText('by ops@rooman.example')).toBeInTheDocument();
    expect(within(table).getAllByText('Never')).toHaveLength(2);
    expect(screen.getByText(`${window.location.origin}/org-admin/login`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy sign-in URL' })).toBeInTheDocument();
  });

  it('adds a login, prefilled from the registrant, and shows its credentials', async () => {
    let created = false;
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': APPROVED,
      'GET /api/platform/organizations/org1/panel-admins': () => json(created ? [PANEL_ADMIN] : []),
      'POST /api/platform/organizations/org1/panel-admins': () => {
        created = true;
        return json(PANEL_ADMIN, 201);
      },
    });
    renderDrawer();
    await openTab();
    expect(await screen.findByText('No admin panel logins')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add login' }));
    const dialog = screen.getByRole('dialog', { name: 'Add admin panel login' });
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Ravi Kumar');
    expect(within(dialog).getByLabelText(/^Email/)).toHaveValue('ravi@acme.example');
    fireEvent.change(within(dialog).getByLabelText(/^Password/), { target: { value: 'Welcome-2026' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create login' }));

    const credentials = await screen.findByRole('dialog', { name: 'Admin panel login' });
    expect(within(credentials).getByText('Welcome-2026')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST' && call.path === '/api/platform/organizations/org1/panel-admins')?.body).toEqual({
      name: 'Ravi Kumar',
      email: 'ravi@acme.example',
      password: 'Welcome-2026',
    });
    await waitFor(() => expect(screen.getByRole('table', { name: 'Admin panel logins of Acme Traders' })).toBeInTheDocument());
  });

  it('disables, sets a new password for, and deletes a login', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/organizations/org1': APPROVED,
      'GET /api/platform/organizations/org1/panel-admins': [PANEL_ADMIN],
      'PATCH /api/platform/panel-admins/pa1': (_url: URL, init: RequestInit) => json({ ...PANEL_ADMIN, ...JSON.parse(String(init.body)) }),
      'DELETE /api/platform/panel-admins/pa1': { message: 'Deleted.' },
    });
    renderDrawer();
    await openTab();

    const menu = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'More actions for ravi@acme.example' }));
    };

    await menu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Disable' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PATCH' && call.path === '/api/platform/panel-admins/pa1')?.body).toEqual({ isActive: false }),
    );

    await menu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Set new password' }));
    const passwordDialog = screen.getByRole('dialog', { name: 'Set new password' });
    fireEvent.change(within(passwordDialog).getByLabelText(/^New password/), { target: { value: 'Fresh-Start-9' } });
    fireEvent.click(within(passwordDialog).getByRole('button', { name: 'Set password' }));
    expect(await screen.findByRole('dialog', { name: 'Admin panel login' })).toBeInTheDocument();
    expect(calls.filter((call) => call.method === 'PATCH').map((call) => call.body)).toContainEqual({ password: 'Fresh-Start-9' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await menu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete login' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete admin panel login' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete login' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/platform/panel-admins/pa1')).toBe(true));
  });
});
