import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SITE_CONTENT, type SiteContent } from '@/api/siteContent';

import { LandingPage } from './LandingPage';

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe('LandingPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders the bundled default immediately, before the request settles', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    renderLanding();
    expect(screen.getByText(DEFAULT_SITE_CONTENT.hero.titleHighlight)).toBeInTheDocument();
    expect(screen.getByText('Standard Business')).toBeInTheDocument();
    // Annual billing is on by default: 999 for the Standard plan.
    expect(screen.getByText('999')).toBeInTheDocument();
    expect(screen.getByText('RK')).toBeInTheDocument();
  });

  it('renders live content and hides disabled sections with their nav links', async () => {
    const live: SiteContent = {
      ...DEFAULT_SITE_CONTENT,
      hero: { ...DEFAULT_SITE_CONTENT.hero, titleHighlight: 'Edited Highlight' },
      pricing: {
        ...DEFAULT_SITE_CONTENT.pricing,
        plans: [{ ...DEFAULT_SITE_CONTENT.pricing.plans[0], name: 'Solo', annualPrice: 125000 }],
      },
      sections: { ...DEFAULT_SITE_CONTENT.sections, showFaq: false },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(live), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    renderLanding();

    expect(await screen.findByText('Edited Highlight')).toBeInTheDocument();
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(screen.getByText('1,25,000')).toBeInTheDocument();
    expect(screen.queryByText(DEFAULT_SITE_CONTENT.faq.title)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'FAQ' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument();
  });

  it('renders the editable brand, nav labels, section descriptions and SEO title', async () => {
    const live: SiteContent = {
      ...DEFAULT_SITE_CONTENT,
      brand: { ...DEFAULT_SITE_CONTENT.brand, name: 'Ledgerly', logoUrl: 'https://cdn.example.com/l.png' },
      nav: { ...DEFAULT_SITE_CONTENT.nav, featuresLabel: 'Tools', pricingLabel: 'Plans', testimonialsLabel: 'Reviews', faqLabel: 'Help' },
      pricing: { ...DEFAULT_SITE_CONTENT.pricing, description: 'Simple plans, no surprises.' },
      testimonials: { ...DEFAULT_SITE_CONTENT.testimonials, description: 'Loved by finance teams.' },
      faq: { ...DEFAULT_SITE_CONTENT.faq, description: 'Everything you wanted to know.' },
      seo: { title: 'Ledgerly - Cloud Accounting', description: 'GST-ready cloud accounting.' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(live), { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    document.title = 'Before';
    const { unmount } = renderLanding();

    expect(await screen.findByText('Ledgerly')).toBeInTheDocument();
    for (const name of ['Tools', 'Plans', 'Reviews', 'Help']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Customers' })).not.toBeInTheDocument();
    expect(screen.getByText('Simple plans, no surprises.')).toHaveClass('zb-section-desc');
    expect(screen.getByText('Loved by finance teams.')).toBeInTheDocument();
    expect(screen.getByText('Everything you wanted to know.')).toBeInTheDocument();
    expect(screen.getByAltText('Rooman')).toHaveAttribute('src', 'https://cdn.example.com/l.png');
    expect(screen.getByAltText('Rooman Books')).toHaveAttribute('src', 'https://cdn.example.com/l.png');
    expect(document.title).toBe('Ledgerly - Cloud Accounting');
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute('content', 'GST-ready cloud accounting.');

    unmount();
    expect(document.title).toBe('Before');
  });

  it('hides empty section descriptions and uses the default brand', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const { container } = renderLanding();
    // Only the features section has a description in the defaults.
    expect(container.querySelectorAll('.zb-section-desc')).toHaveLength(1);
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customers' })).toBeInTheDocument();
    expect(document.title).toBe('Rooman Books');
  });
});
