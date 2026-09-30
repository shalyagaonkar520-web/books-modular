import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_APP_CONTENT, type AppContent } from '@/api/appContent';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { AppContentProvider, useAppContent } from './AppContentContext';
import { ModuleGuard } from './ModuleGuard';

function published(change: (content: AppContent) => void): AppContent {
  const content: AppContent = JSON.parse(JSON.stringify(DEFAULT_APP_CONTENT));
  change(content);
  return content;
}

function Probe() {
  const { t } = useAppContent();
  return <p data-testid="probe">{t('dashboard.welcome', { name: 'Asha' })}</p>;
}

describe('AppContentProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.cssText = '';
  });

  it('renders the defaults at once, then swaps in the published texts', async () => {
    installMockApi({
      'GET /api/public/app-content': published((c) => {
        c.texts['dashboard.welcome'] = 'Hello {name}, from {appName}';
        c.branding.appName = 'Ledgerly';
      }),
      'GET /api/dashboard/notifications': { items: [], count: 0 },
    });
    renderWithProviders(
      <AppContentProvider>
        <Probe />
        <Header onToggleSidebar={() => undefined} />
      </AppContentProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('Welcome back, Asha');
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('Hello Asha, from Ledgerly'));
    expect(screen.getByText('Ledgerly', { selector: 'strong' })).toBeInTheDocument();
  });

  it('sets the brand colour variables, and clears them again for the default colour', async () => {
    installMockApi({ 'GET /api/public/app-content': published((c) => (c.branding.primaryColor = '#16a34a')) });
    renderWithProviders(
      <AppContentProvider>
        <Probe />
      </AppContentProvider>,
    );
    const style = document.documentElement.style;
    await waitFor(() => expect(style.getPropertyValue('--primary')).toBe('#16a34a'));
    expect(style.getPropertyValue('--primary-hover')).toMatch(/^#[0-9a-f]{6}$/);
    expect(style.getPropertyValue('--primary-soft')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('hides a switched-off module from the sidebar, and a group left empty', async () => {
    installMockApi({
      'GET /api/public/app-content': published((c) => {
        c.modules.payroll = false;
        c.modules.customers = false;
        c.modules.invoices = false;
        c.modules.paymentsReceived = false;
        c.texts['sidebar.items'] = 'Products';
      }),
    });
    renderWithProviders(
      <AppContentProvider>
        <Sidebar open onNavigate={() => undefined} />
      </AppContentProvider>,
    );
    expect(screen.getByRole('link', { name: 'Payroll' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Payroll' })).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Products' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sales' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchases' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('redirects a switched-off module’s route to the dashboard with a toast', async () => {
    installMockApi({ 'GET /api/public/app-content': published((c) => (c.modules.payroll = false)) });
    renderWithProviders(
      <AppContentProvider>
        <Routes>
          <Route element={<ModuleGuard />}>
            <Route path="/dashboard" element={<p>Dashboard page</p>} />
            <Route path="/payroll" element={<p>Payroll page</p>} />
            <Route path="/settings" element={<p>Settings page</p>} />
          </Route>
        </Routes>
      </AppContentProvider>,
      { route: '/payroll' },
    );
    expect(screen.getByText('Payroll page')).toBeInTheDocument();
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(screen.getByText('This module is turned off by the administrator')).toBeInTheDocument();
  });
});
