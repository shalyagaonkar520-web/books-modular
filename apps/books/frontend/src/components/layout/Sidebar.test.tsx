import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { APP_MODULES, DEFAULT_APP_CONTENT, normalizeAppContent, type AppContent, type AppModuleKey } from '@/api/appContent';
import { AppContentProvider } from '@/app/AppContentContext';
import { ModuleGuard } from '@/app/ModuleGuard';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { Sidebar } from './Sidebar';

const EXPENSES_MODULES: AppModuleKey[] = ['vendors', 'bills', 'expenses', 'reports'];

/** What the server sends on expenses.futureacad.ae: Rooman Expenses, its modules on, the rest off. */
function expensesProduct(): AppContent {
  const content: AppContent = JSON.parse(JSON.stringify(DEFAULT_APP_CONTENT));
  content.branding.appName = 'Rooman Expenses';
  for (const key of Object.keys(content.modules) as AppModuleKey[]) content.modules[key] = EXPENSES_MODULES.includes(key);
  content.product = { key: 'expenses', name: 'Rooman Expenses', modules: EXPENSES_MODULES };
  return content;
}

/** The module links, in order (Settings is core and admin-only, so it is left out). */
function sidebarLinks(): string[] {
  const nav = screen.getByRole('navigation');
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.getAttribute('href') ?? '')
    .filter((href) => href !== '/settings');
}

describe('Sidebar for a product', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows every module, from the registry, for Rooman Books', () => {
    renderWithProviders(
      <AppContentProvider initialContent={DEFAULT_APP_CONTENT}>
        <Sidebar open onNavigate={() => undefined} />
      </AppContentProvider>,
    );
    expect(sidebarLinks()).toEqual(['/dashboard', '/items', '/customers', '/invoices', '/payments-received',
      '/expense-dashboard', '/vendors', '/bills', '/expenses', '/payments-made', '/financial-dashboard', '/receivables-payables',
      '/banking', '/razorpay-payments', '/time-tracking', '/accounting', '/reports', '/documents', '/payroll']);
    expect(sidebarLinks()).toHaveLength(APP_MODULES.length + 1);
  });

  it('shows only the Expenses modules for an Expenses-only product', async () => {
    installMockApi({ 'GET /api/public/app-content': expensesProduct() });
    renderWithProviders(
      <AppContentProvider>
        <Sidebar open onNavigate={() => undefined} />
      </AppContentProvider>,
    );
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument());
    expect(sidebarLinks()).toEqual(['/dashboard', '/vendors', '/bills', '/expenses', '/reports']);
    expect(screen.queryByRole('button', { name: 'Sales' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchases' })).toBeInTheDocument();
  });

  it('hides modules outside the product even when the organization content has them on', () => {
    const content = expensesProduct();
    for (const key of Object.keys(content.modules) as AppModuleKey[]) content.modules[key] = true;
    renderWithProviders(
      <AppContentProvider initialContent={content}>
        <Sidebar open onNavigate={() => undefined} />
      </AppContentProvider>,
    );
    expect(sidebarLinks()).toEqual(['/dashboard', '/vendors', '/bills', '/expenses', '/reports']);
  });

  it('sends a route outside the product back to the dashboard', async () => {
    renderWithProviders(
      <AppContentProvider initialContent={expensesProduct()}>
        <Routes>
          <Route element={<ModuleGuard />}>
            <Route path="/dashboard" element={<p>Dashboard page</p>} />
            <Route path="/invoices" element={<p>Invoices page</p>} />
          </Route>
        </Routes>
      </AppContentProvider>,
      { route: '/invoices' },
    );
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('Invoices page')).not.toBeInTheDocument();
  });

  it('offers only the reports of the product modules', () => {
    renderWithProviders(
      <AppContentProvider initialContent={expensesProduct()}>
        <ReportsPage />
      </AppContentProvider>,
    );
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toContain('Payables Ageing');
    expect(tabs).toContain('Expenses by Category');
    expect(tabs).not.toContain('Receivables Ageing');
    expect(tabs).not.toContain('Sales by Customer');
    expect(tabs).not.toContain('Inventory Summary');
  });
});

describe('normalizeAppContent product', () => {
  it('keeps a valid product and drops unknown module keys', () => {
    const content = normalizeAppContent({ ...DEFAULT_APP_CONTENT, product: { key: 'expenses', name: 'Rooman Expenses', modules: ['bills', 'nope'] } });
    expect(content.product).toEqual({ key: 'expenses', name: 'Rooman Expenses', modules: ['bills'] });
    expect(normalizeAppContent({ ...DEFAULT_APP_CONTENT, product: 'books' }).product).toBeUndefined();
  });
});
