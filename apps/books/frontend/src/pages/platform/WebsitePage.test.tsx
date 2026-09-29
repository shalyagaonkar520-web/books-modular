import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

  it('edits the brand, nav labels, section descriptions and SEO fields and saves them', async () => {
    const { calls } = installMockApi({
      'GET /api/platform/site-content': DEFAULT_SITE_CONTENT,
      'PUT /api/platform/site-content': (_url: URL, init: RequestInit) => json(JSON.parse(String(init.body))),
    });
    renderWithProviders(<WebsitePage />);
    await screen.findByLabelText('Title (highlighted line)');

    // Edit one card at a time and collapse it again (the draft lives in the page), keeping the DOM small.
    const editCard = (id: string, edits: Array<[string, string]>) => {
      const toggle = document.querySelector(`#site-editor-${id}-title button`) as HTMLButtonElement;
      fireEvent.click(toggle);
      const panel = within(document.getElementById(`site-editor-${id}`) as HTMLElement);
      for (const [label, value] of edits) fireEvent.change(panel.getByLabelText(label), { target: { value } });
      fireEvent.click(toggle);
    };
    editCard('brand', [
      ['Brand name', 'Ledgerly'],
      ['Logo URL', 'https://cdn.example.com/l.png'],
      ['Features link label', 'Tools'],
      ['Pricing link label', 'Plans'],
      ['Testimonials link label', 'Reviews'],
      ['FAQ link label', 'Help'],
    ]);
    editCard('pricing', [['Section description', 'Pricing blurb']]);
    editCard('testimonials', [['Section description', 'Testimonials blurb']]);
    editCard('faq', [['Section description', 'FAQ blurb']]);
    editCard('seo', [
      ['Page title', 'Ledgerly - Cloud Accounting'],
      ['Meta description', 'GST-ready cloud accounting.'],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument());
    const body = calls.find((call) => call.method === 'PUT' && call.path === '/api/platform/site-content')?.body as typeof DEFAULT_SITE_CONTENT;
    expect(body.brand).toMatchObject({ name: 'Ledgerly', logoUrl: 'https://cdn.example.com/l.png' });
    expect(body.nav).toMatchObject({ featuresLabel: 'Tools', pricingLabel: 'Plans', testimonialsLabel: 'Reviews', faqLabel: 'Help' });
    expect(body.pricing.description).toBe('Pricing blurb');
    expect(body.testimonials.description).toBe('Testimonials blurb');
    expect(body.faq.description).toBe('FAQ blurb');
    expect(body.seo).toEqual({ title: 'Ledgerly - Cloud Accounting', description: 'GST-ready cloud accounting.' });
  });

  it('blocks saving an unsafe logo URL', async () => {
    const { calls } = installMockApi({ 'GET /api/platform/site-content': DEFAULT_SITE_CONTENT });
    renderWithProviders(<WebsitePage />);
    await screen.findByLabelText('Title (highlighted line)');
    fireEvent.click(document.querySelector('#site-editor-brand-title button') as HTMLButtonElement);
    const logo = screen.getByLabelText('Logo URL');
    fireEvent.change(logo, { target: { value: 'javascript:alert(1)' } });
    expect(logo).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
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
