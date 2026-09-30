import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMockApi, type RouteMap } from '@/test/mockApi';
import { authResponse, renderWithProviders } from '@/test/renderWithProviders';

import { RegisterPage } from './RegisterPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const BASE: RouteMap = {
  'GET /api/auth/me': () => json({ detail: 'Not authenticated' }, 401),
  'GET /api/auth/email-verification-status': { email: 'khadar@example.com', status: 'VERIFIED', verified: true },
};

async function fillAccount() {
  fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: 'Rooman Technologies' } });
  fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Khadar Basha' } });
  fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ngPass!' } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Str0ngPass!' } });
  await waitFor(() => expect(screen.getByRole('button', { name: /create organization/i })).not.toBeDisabled());
}

// Modules are chosen by the organization's admin during the free trial, not at registration.
describe('RegisterPage without modules', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has no module picker and sends no modules', async () => {
    localStorage.setItem('rooman_verified_email', 'khadar@example.com');
    const { calls } = installMockApi({ ...BASE, 'POST /api/auth/register': authResponse });
    renderWithProviders(<RegisterPage />);
    await fillAccount();

    expect(screen.queryByRole('group', { name: /modules/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Invoices' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('module-total')).not.toBeInTheDocument();
    expect(calls.some((call) => call.path === '/api/public/module-pricing')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /create organization/i }));
    await waitFor(() => expect(calls.some((call) => call.path === '/api/auth/register')).toBe(true));
    const body = calls.find((call) => call.path === '/api/auth/register')?.body as Record<string, unknown>;
    expect(body).not.toHaveProperty('modules');
  });

  it('shows no requested modules on the approval-pending screen', async () => {
    localStorage.setItem('rooman_verified_email', 'khadar@example.com');
    installMockApi({
      ...BASE,
      'POST /api/auth/register': json(
        {
          status: 'pending_approval',
          message: 'A platform administrator will review your organization shortly.',
          organizationName: 'Rooman Technologies',
          email: 'khadar@example.com',
        },
        202,
      ),
    });
    renderWithProviders(<RegisterPage />);
    await fillAccount();
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }));

    expect(await screen.findByRole('heading', { name: /organization submitted for approval/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Requested modules' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-total')).not.toBeInTheDocument();
  });
});
