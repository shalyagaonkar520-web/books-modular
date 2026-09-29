import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SITE_CONTENT, SITE_CONTENT_LIMITS, fetchPublicSiteContent, normalizeSiteContent, validateSiteContent } from './siteContent';

describe('siteContent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to the bundled default when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(fetchPublicSiteContent()).resolves.toBe(DEFAULT_SITE_CONTENT);
  });

  it('falls back to the bundled default on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    await expect(fetchPublicSiteContent()).resolves.toBe(DEFAULT_SITE_CONTENT);
  });

  it('reads the public endpoint without credentials headers', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ...DEFAULT_SITE_CONTENT, brand: { badge: 'Live badge' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const content = await fetchPublicSiteContent();
    expect(content.brand.badge).toBe('Live badge');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/public/site-content');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('fills missing or malformed sections from the defaults', () => {
    const content = normalizeSiteContent({ hero: { titleLine1: 'Hello', trustItems: 'not a list' }, pricing: null });
    expect(content.hero.titleLine1).toBe('Hello');
    expect(content.hero.trustItems).toEqual(DEFAULT_SITE_CONTENT.hero.trustItems);
    expect(content.pricing).toEqual(DEFAULT_SITE_CONTENT.pricing);
  });

  it('fills fields added later (brand name, nav labels, SEO) into an older document', () => {
    const content = normalizeSiteContent({ brand: { badge: 'Old' }, nav: { loginLabel: 'In', ctaLabel: 'Go' }, faq: { title: 'Q' } });
    expect(content.brand).toEqual({ badge: 'Old', name: 'Books', logoUrl: '/rooman-logo.png' });
    expect(content.nav.testimonialsLabel).toBe('Customers');
    expect(content.faq.description).toBe('');
    expect(content.seo).toEqual({ title: 'Rooman Books', description: '' });
  });

  it('never keeps an unsafe logo URL', () => {
    for (const logoUrl of ['javascript:alert(1)', 'http://x', 'has space', '//evil.example.com/l.png']) {
      expect(normalizeSiteContent({ brand: { logoUrl } }).brand.logoUrl).toBe('/rooman-logo.png');
      expect(validateSiteContent({ ...DEFAULT_SITE_CONTENT, brand: { ...DEFAULT_SITE_CONTENT.brand, logoUrl } })['brand.logoUrl']).toBeDefined();
    }
    expect(normalizeSiteContent({ brand: { logoUrl: 'https://cdn.example.com/l.png' } }).brand.logoUrl).toBe('https://cdn.example.com/l.png');
  });

  it('accepts the defaults and flags limits the backend enforces', () => {
    expect(validateSiteContent(DEFAULT_SITE_CONTENT)).toEqual({});

    const tooMany = {
      ...DEFAULT_SITE_CONTENT,
      hero: { ...DEFAULT_SITE_CONTENT.hero, trustItems: Array(SITE_CONTENT_LIMITS.trustItems + 1).fill('x') },
      pricing: {
        ...DEFAULT_SITE_CONTENT.pricing,
        plans: [{ ...DEFAULT_SITE_CONTENT.pricing.plans[0], monthlyPrice: SITE_CONTENT_LIMITS.priceMax + 1, annualPrice: Number.NaN }],
      },
    };
    const errors = validateSiteContent(tooMany);
    expect(errors['hero.trustItems']).toMatch(/up to 6/i);
    expect(errors['pricing.plans.0.monthlyPrice']).toBeDefined();
    expect(errors['pricing.plans.0.annualPrice']).toBeDefined();

    const noPlans = { ...DEFAULT_SITE_CONTENT, pricing: { ...DEFAULT_SITE_CONTENT.pricing, plans: [] } };
    expect(validateSiteContent(noPlans)['pricing.plans']).toMatch(/at least one/i);
  });
});
