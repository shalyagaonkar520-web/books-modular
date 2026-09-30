import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_APP_CONTENT, type AppContent } from '@/api/appContent';
import { AppContentProvider } from '@/app/AppContentContext';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { AppContentPage } from './AppContentPage';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const echo = (_url: URL, init: RequestInit) => json(JSON.parse(String(init.body)));

function renderPage() {
  return renderWithProviders(
    <AppContentProvider>
      <AppContentPage />
    </AppContentProvider>,
  );
}

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
});
