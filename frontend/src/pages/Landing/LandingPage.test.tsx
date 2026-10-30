import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SITE_CONTENT, type SiteContent } from '@/api/siteContent';

import { FEATURE_BOOKS } from './featureBooks';
import { LandingPage } from './LandingPage';

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

/** Answers the two public requests the landing page makes. */
function stubFetch(site: SiteContent | null, plans: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = String(url).includes('/plans') ? plans : site;
      return body === null
        ? new Response('{}', { status: 500 })
        : new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
}

describe('LandingPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the policy links, a book for every feature and the default plans before anything loads', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    renderLanding();
    const policies = screen.getAllByRole('navigation', { name: 'Policies' })[0];
    for (const name of ['Terms & Conditions', 'Privacy Policy', 'Refund & Cancellation', 'Shipping & Delivery', 'Contact Us']) {
      expect(policies).toHaveTextContent(name);
    }
    // Every feature is a book on the shelf (three copies make it endless).
    expect(document.querySelectorAll('.book')).toHaveLength(FEATURE_BOOKS.length * 3);
    expect(screen.getAllByText('Point of Sale').length).toBeGreaterThan(0);
    // The same cards as in the app: monthly first, a free plan, then the plans by users with storage.
    expect(screen.getByText('Free trial').closest('button')).toHaveTextContent('₹0for 3 days');
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getAllByText('10 GB storage')).toHaveLength(2); // the trial has Starter's storage
    expect(screen.getByText('Up to 500 users')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Monthly' })).toHaveAttribute('aria-checked', 'true');
  });

  it('prices the plans from the live plans, the same as inside the app', async () => {
    stubFetch(DEFAULT_SITE_CONTENT, {
      currency: 'INR',
      tiers: [
        { key: 'u100', label: 'Solo', users: 100, monthly: 349, storageGb: 20 },
        { key: 'u500', label: 'Business', users: 500, monthly: 599, storageGb: 50 },
        { key: 'u1000', label: 'Enterprise', users: 1000, monthly: 999, storageGb: 1024 },
      ],
      per100Over: 99,
      customMinimum: 99,
      yearlyMonths: 10,
      trialDays: 3,
    });
    renderLanding();
    expect(await screen.findByText('Solo')).toBeInTheDocument();
    expect(screen.getByText('Solo').closest('button')).toHaveTextContent('₹349/month');
    expect(screen.getAllByText('20 GB storage')).toHaveLength(2);
    expect(screen.getByText('1 TB storage')).toBeInTheDocument();
    expect(screen.getByText(/3-day free trial/)).toBeInTheDocument();
  });

  it('renders the editable brand, sections and SEO title', async () => {
    const live: SiteContent = {
      ...DEFAULT_SITE_CONTENT,
      brand: { ...DEFAULT_SITE_CONTENT.brand, name: 'Ledgerly', logoUrl: 'https://cdn.example.com/l.png' },
      testimonials: { ...DEFAULT_SITE_CONTENT.testimonials, description: 'Loved by finance teams.' },
      faq: { ...DEFAULT_SITE_CONTENT.faq, description: 'Everything you wanted to know.' },
      sections: { ...DEFAULT_SITE_CONTENT.sections, showFaq: false },
      seo: { title: 'Ledgerly - Cloud Accounting', description: 'GST-ready cloud accounting.' },
    };
    stubFetch(live, null);
    document.title = 'Before';
    const { unmount } = renderLanding();

    expect(await screen.findByText('Ledgerly', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Loved by finance teams.')).toBeInTheDocument();
    expect(screen.queryByText('Everything you wanted to know.')).not.toBeInTheDocument();
    expect(screen.getByAltText('Rooman')).toHaveAttribute('src', 'https://cdn.example.com/l.png');
    await waitFor(() => expect(document.title).toBe('Ledgerly - Cloud Accounting'));
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'GST-ready cloud accounting.');
    // The plans fell back to the defaults when their request failed.
    expect(screen.getByText('Starter')).toBeInTheDocument();

    unmount();
    expect(document.title).toBe('Before');
  });
});
