import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { validatePassword } from '@/pages/settings/passwordRules';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { CreateOrganizationModal } from './CreateOrganizationModal';

describe('CreateOrganizationModal', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults the first administrator to "Admin" with a random password and shows the login once', async () => {
    const { calls } = installMockApi({
      'POST /api/platform/organizations': (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ organization: { id: 'o1', name: body.name }, admin: { email: body.adminEmail } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    renderWithProviders(<CreateOrganizationModal onClose={() => undefined} onCreated={() => undefined} />);

    expect(screen.getByLabelText(/^Admin name/)).toHaveValue('Admin');
    const password = screen.getByLabelText(/^Admin password/) as HTMLInputElement;
    expect(validatePassword(password.value)).toBeNull();
    const first = password.value;
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(password.value).not.toBe(first);

    fireEvent.change(screen.getByLabelText(/^Organization name/), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/^Admin email/), { target: { value: 'Owner@Acme.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    const dialog = await screen.findByRole('dialog', { name: 'Organization created' });
    expect(within(dialog).getByText('owner@acme.example')).toBeInTheDocument();
    expect(within(dialog).getByText(password.value)).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.find((call) => call.path === '/api/platform/organizations')?.body).toMatchObject({
        adminName: 'Admin',
        adminEmail: 'owner@acme.example',
        adminPassword: password.value,
      }),
    );
  });
});
