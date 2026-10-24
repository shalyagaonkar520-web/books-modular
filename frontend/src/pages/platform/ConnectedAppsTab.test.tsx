import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConnectedApp, ConnectedAppsCatalog } from '@/api/connectedApps';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { ConnectedAppsTab } from './ConnectedAppsTab';

const CATALOG: ConnectedAppsCatalog = {
  features: [
    { key: 'contacts', label: 'Customers & vendors', description: 'Customer and vendor records.', planKeys: ['customers', 'vendors'] },
    { key: 'invoices', label: 'Invoices', description: 'GST invoices.', planKeys: ['invoices'] },
  ],
  events: [
    { type: 'contact.created', feature: 'contacts' },
    { type: 'invoice.created', feature: 'invoices' },
  ],
};

const APP: ConnectedApp = {
  id: 'c1',
  organizationId: 'org1',
  name: 'Rooman Bookings',
  keyPrefix: 'rbk_1a2b3c4d',
  scopes: ['invoices:read', 'invoices:write'],
  events: ['invoice.created'],
  webhookUrl: 'https://bookings.example.com/hooks',
  isActive: true,
  createdBy: 'ops@rooman.example',
  createdAt: '2026-10-09T04:00:00Z',
  lastUsedAt: null,
  revokedAt: null,
  pendingDeliveries: 0,
  failedDeliveries: 2,
};

function renderTab() {
  return renderWithProviders(<ConnectedAppsTab orgId="org1" orgName="Acme Traders" />, { route: '/platform/organizations' });
}

describe('Connected apps (super admin)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the apps with what they can use and their failed events', async () => {
    installMockApi({
      'GET /api/platform/connected-apps/catalog': CATALOG,
      'GET /api/platform/organizations/org1/connected-apps': [APP],
    });
    renderTab();
    expect(await screen.findByText('Rooman Bookings')).toBeInTheDocument();
    expect(screen.getByText('Invoices (read & write)')).toBeInTheDocument();
    expect(screen.getByText('2 failed')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('connects an app with chosen permissions and shows the key once', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/connected-apps/catalog': CATALOG,
      'GET /api/platform/organizations/org1/connected-apps': [],
      'POST /api/platform/organizations/org1/connected-apps': {
        connection: { ...APP, scopes: ['contacts:read'], events: [], webhookUrl: null },
        apiKey: 'rbk_1a2b3c4d_secretpart',
        webhookSecret: 'whsec_abc',
      },
    });
    renderTab();
    expect(await screen.findByText('No connected apps')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect an app' }));
    const dialog = await screen.findByRole('dialog', { name: 'Connect an app' });
    fireEvent.change(within(dialog).getByLabelText(/App name/), { target: { value: 'Rooman Bookings' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Customers & vendors: read' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Connect and show the key' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      name: 'Rooman Bookings',
      scopes: ['contacts:read'],
      events: [],
      webhookUrl: null,
    });
    expect(await screen.findByText('rbk_1a2b3c4d_secretpart')).toBeInTheDocument();
    expect(screen.getByText('whsec_abc')).toBeInTheDocument();
  });

  it('only offers events whose feature the app can read', async () => {
    installMockApi({
      'GET /api/platform/connected-apps/catalog': CATALOG,
      'GET /api/platform/organizations/org1/connected-apps': [APP],
    });
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Rooman Bookings' });
    const events = within(dialog).getByRole('group', { name: 'Events to send' });
    const boxes = within(events).getAllByRole('checkbox');
    // contact.created needs Customers & vendors read access, which the app does not have.
    expect(boxes[0]).toBeDisabled();
    expect(boxes[1]).toBeChecked();
  });
});
