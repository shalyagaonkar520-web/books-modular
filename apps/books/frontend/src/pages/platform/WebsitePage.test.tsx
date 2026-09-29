import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SITE_CONTENT } from '@/api/siteContent';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { WebsitePage } from './WebsitePage';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('WebsitePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads the content, saves edits with PUT and reports a clean state afterwards', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/site-content': DEFAULT_SITE_CONTENT,
      'PUT /api/platform/site-content': (_url: URL, init: RequestInit) => json(JSON.parse(String(init.body))),
    });
    renderWithProviders(<WebsitePage />);

    const titleField = await screen.findByLabelText('Title (highlighted line)');
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(titleField, { target: { value: 'Growing Businesses' } });
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument());
    const put = calls.find((call) => call.method === 'PUT' && call.path === '/api/platform/site-content');
    expect((put?.body as typeof DEFAULT_SITE_CONTENT).hero.titleHighlight).toBe('Growing Businesses');
  });

  it('maps 422 errors onto the nested field and opens its section', async () => {
    installMockApi({
      'GET /api/platform/site-content': DEFAULT_SITE_CONTENT,
      'PUT /api/platform/site-content': json(
        { detail: [{ loc: ['body', 'pricing', 'plans', 1, 'name'], msg: 'Name is too long' }] },
        422,
      ),
    });
    renderWithProviders(<WebsitePage />);

    fireEvent.change(await screen.findByLabelText('Pill text'), { target: { value: 'Changed pill' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findAllByText('Name is too long')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: /^pricing/i, expanded: true })).toBeInTheDocument();
    const planNames = screen.getAllByLabelText(/plan name/i);
    expect(planNames[1]).toHaveAttribute('aria-invalid', 'true');
    expect(planNames[0]).toHaveAttribute('aria-invalid', 'false');
  });

  it('shows an error with a retry when loading fails', async () => {
    installMockApi({ 'GET /api/platform/site-content': json({ detail: 'Service unavailable' }, 503) });
    renderWithProviders(<WebsitePage />);
    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
  });
});
