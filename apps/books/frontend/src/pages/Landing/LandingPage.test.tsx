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
});
