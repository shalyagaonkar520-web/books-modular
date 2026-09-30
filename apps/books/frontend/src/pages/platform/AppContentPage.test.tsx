import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_APP_CONTENT, type AppContent } from '@/api/appContent';
import { AppContentProvider } from '@/app/AppContentContext';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { AppContentPage } from './AppContentPage';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const echo = (_url: URL, init: RequestInit) => json(JSON.parse(String(init.body)));

function renderPage(route = '/platform/app-content') {
  return renderWithProviders(
    <AppContentProvider>
      <AppContentPage />
    </AppContentProvider>,
    { route },
  );
}

const SHARED: AppContent = { ...DEFAULT_APP_CONTENT, texts: { ...DEFAULT_APP_CONTENT.texts, 'items.title': 'Catalogue' } };
const ORGS = { items: [{ id: 'org-a', name: 'Acme Traders', isSuspended: false }], total: 1, page: 1, pageSize: 200 };
const orgPayload = (content: AppContent, texts: string[] = []) => ({
  organizationId: 'org-a',
  organizationName: 'Acme Traders',
  content,
  shared: SHARED,
  overridden: { branding: [], modules: [], texts },
});

/** Sections start collapsed; open the one under test. */
async function openBranding() {
  fireEvent.click(await screen.findByRole('button', { name: /^branding/i, expanded: false }));
}

describe('AppContentPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the document, saves branding, module and text edits, and reloads the live content', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/app-content': DEFAULT_APP_CONTENT,
      'PUT /api/platform/app-content': echo,
      'GET /api/public/app-content': DEFAULT_APP_CONTENT,
    });
    renderPage();
    await openBranding();

    const appName = await screen.findByLabelText(/^App name/);
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    fireEvent.change(appName, { target: { value: 'Ledgerly' } });
    fireEvent.change(screen.getByLabelText('Primary colour'), { target: { value: '#16a34a' } });

    fireEvent.click(screen.getByRole('button', { name: /Modules/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^Payroll/ }));

    fireEvent.change(screen.getByLabelText('Search texts'), { target: { value: 'items.title' } });
    const title = screen.getByLabelText('Title');
    expect(title).toHaveAttribute('placeholder', 'Items');
    fireEvent.change(title, { target: { value: 'Products' } });
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();

    const publicReadsBefore = calls.filter((call) => call.path === '/api/public/app-content').length;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument());

    const body = calls.find((call) => call.method === 'PUT' && call.path === '/api/platform/app-content')?.body as AppContent;
    expect(body.branding).toEqual({ appName: 'Ledgerly', logoUrl: '/rooman-logo.png', primaryColor: '#16a34a' });
    expect(body.modules.payroll).toBe(false);
    expect(body.texts['items.title']).toBe('Products');
    expect(Object.keys(body.texts)).toHaveLength(Object.keys(DEFAULT_APP_CONTENT.texts).length);
    await waitFor(() => expect(calls.filter((call) => call.path === '/api/public/app-content').length).toBeGreaterThan(publicReadsBefore));
  });

  it('resets a single text to its default', async () => {
    installMockApi({ 'GET /api/platform/app-content': { ...DEFAULT_APP_CONTENT, texts: { ...DEFAULT_APP_CONTENT.texts, 'items.title': 'Products' } } });
    renderPage();
    await openBranding();
    await screen.findByLabelText(/^App name/);
    fireEvent.change(screen.getByLabelText('Search texts'), { target: { value: 'items.title' } });
    expect(screen.getByLabelText('Title')).toHaveValue('Products');
    fireEvent.click(screen.getByRole('button', { name: 'Reset items.title to default' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Items');
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
  });

  it('blocks saving an invalid colour', async () => {
    const { calls } = installMockApi({ 'GET /api/platform/app-content': DEFAULT_APP_CONTENT });
    renderPage();
    await openBranding();
    fireEvent.change(await screen.findByLabelText('Primary colour'), { target: { value: 'blue' } });
    expect(screen.getByText('Use a hex colour such as #2563eb.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Fix the highlighted fields before saving.')).toBeInTheDocument());
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('maps a 422 onto the text field and opens its group', async () => {
    installMockApi({
      'GET /api/platform/app-content': DEFAULT_APP_CONTENT,
      'PUT /api/platform/app-content': () =>
        json({ detail: [{ loc: ['body', 'texts', 'items.title'], msg: 'Value is not allowed here', type: 'value_error' }] }, 422),
    });
    renderPage();
    await openBranding();
    fireEvent.change(await screen.findByLabelText(/^App name/), { target: { value: 'Ledgerly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Value is not allowed here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Items/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1 issue')).toBeInTheDocument();
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
  });

  it('edits one organization: compares against the shared content and saves to that organization only', async () => {
    const orgContent: AppContent = { ...SHARED, texts: { ...SHARED.texts, 'sidebar.items': 'Stock' } };
    const { calls } = installMockApi({
      'GET /api/platform/organizations': ORGS,
      'GET /api/platform/organizations/org-a/app-content': orgPayload(orgContent, ['sidebar.items']),
      'PUT /api/platform/organizations/org-a/app-content': (_url: URL, init: RequestInit) => json(orgPayload(JSON.parse(String(init.body)))),
      'GET /api/public/app-content': SHARED,
    });
    renderPage('/platform/app-content?org=org-a');

    expect(await screen.findByText('Acme Traders', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/1 customized field/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Apply changes to')).toHaveValue('org-a'));

    fireEvent.change(screen.getByLabelText('Search texts'), { target: { value: 'items.title' } });
    const title = screen.getByLabelText('Title');
    expect(title).toHaveAttribute('placeholder', 'Catalogue'); // the shared text, not the built-in one
    fireEvent.change(title, { target: { value: 'Acme products' } });
    expect(screen.getByText('Customized')).toBeInTheDocument();
    expect(screen.getByLabelText('Apply changes to')).toBeDisabled(); // no switching with unsaved edits

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument());
    expect(calls.some((call) => call.method === 'PUT' && call.path === '/api/platform/app-content')).toBe(false);
    const body = calls.find((call) => call.method === 'PUT' && call.path === '/api/platform/organizations/org-a/app-content')?.body as AppContent;
    expect(body.texts['items.title']).toBe('Acme products');
    expect(body.texts['sidebar.items']).toBe('Stock');
  });

  it('removes an organization customization with the reset button', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/organizations': ORGS,
      'GET /api/platform/organizations/org-a/app-content': orgPayload({ ...SHARED, texts: { ...SHARED.texts, 'items.title': 'Mine' } }, ['items.title']),
      'POST /api/platform/organizations/org-a/app-content/reset': orgPayload(SHARED),
      'GET /api/public/app-content': SHARED,
    });
    renderPage('/platform/app-content?org=org-a');
    fireEvent.click(await screen.findByRole('button', { name: 'Remove customizations' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove customizations' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.path.endsWith('/org-a/app-content/reset'))).toBe(true));
    await waitFor(() => expect(screen.getByText(/0 customized fields/)).toBeInTheDocument());
  });
});
