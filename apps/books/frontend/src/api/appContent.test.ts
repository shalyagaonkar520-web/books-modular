import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  APP_MODULES,
  DEFAULT_APP_CONTENT,
  brandPalette,
  fetchPublicAppContent,
  interpolate,
  moduleForPath,
  normalizeAppContent,
  validateAppContent,
  type AppContent,
} from './appContent';

const clone = (): AppContent => JSON.parse(JSON.stringify(DEFAULT_APP_CONTENT));

describe('app content defaults', () => {
  it('lists every module of the default document, and only those', () => {
    expect(APP_MODULES.map((module) => module.key).sort()).toEqual(Object.keys(DEFAULT_APP_CONTENT.modules).sort());
  });

  it('keeps the current hard-coded strings as defaults', () => {
    expect(DEFAULT_APP_CONTENT.texts['dashboard.welcome']).toBe('Welcome back, {name}');
    expect(DEFAULT_APP_CONTENT.texts['sidebar.accounting']).toBe('Accountant');
    expect(DEFAULT_APP_CONTENT.branding).toEqual({ appName: 'Rooman Books', logoUrl: '/rooman-logo.png', primaryColor: '#2563eb' });
  });
});

describe('normalizeAppContent', () => {
  it('returns the defaults for anything that is not an object', () => {
    expect(normalizeAppContent(null)).toEqual(DEFAULT_APP_CONTENT);
    expect(normalizeAppContent('nope')).toEqual(DEFAULT_APP_CONTENT);
  });

  it('fills missing keys, drops unknown ones and treats empty texts as the default', () => {
    const result = normalizeAppContent({
      branding: { appName: 'Ledgerly' },
      modules: { payroll: false, bogus: false },
      texts: { 'items.title': 'Products', 'items.subtitle': '', 'no.such.key': 'x' },
    });
    expect(result.branding).toEqual({ ...DEFAULT_APP_CONTENT.branding, appName: 'Ledgerly' });
    expect(result.modules.payroll).toBe(false);
    expect(result.modules.items).toBe(true);
    expect(result.modules).not.toHaveProperty('bogus');
    expect(result.texts['items.title']).toBe('Products');
    expect(result.texts['items.subtitle']).toBe(DEFAULT_APP_CONTENT.texts['items.subtitle']);
    expect(result.texts).not.toHaveProperty('no.such.key');
    expect(Object.keys(result.texts)).toHaveLength(Object.keys(DEFAULT_APP_CONTENT.texts).length);
  });

  it('never passes on an unsafe logo URL, a malformed colour or a wrong type', () => {
    const result = normalizeAppContent({
      branding: { appName: '   ', logoUrl: 'javascript:alert(1)', primaryColor: 'red' },
      modules: { items: 'no' },
      texts: { 'items.title': 42 },
    });
    expect(result.branding).toEqual(DEFAULT_APP_CONTENT.branding);
    expect(result.modules.items).toBe(true);
    expect(result.texts['items.title']).toBe('Items');
  });
});

describe('validateAppContent', () => {
  it('accepts the defaults', () => {
    expect(validateAppContent(clone())).toEqual({});
  });

  it('mirrors the backend limits', () => {
    const content = clone();
    content.branding = { appName: 'x'.repeat(61), logoUrl: '//evil.example/logo.png', primaryColor: '#12345' };
    content.texts['items.title'] = 'x'.repeat(301);
    content.texts['made.up'] = 'Hi';
    (content.modules as Record<string, boolean>).bogus = true;
    const errors = validateAppContent(content);
    expect(Object.keys(errors).sort()).toEqual(
      ['branding.appName', 'branding.logoUrl', 'branding.primaryColor', 'modules.bogus', 'texts.items.title', 'texts.made.up'].sort(),
    );
  });

  it('requires an app name and allows an empty text (meaning “use the default”)', () => {
    const content = clone();
    content.branding.appName = ' ';
    content.texts['items.title'] = '';
    expect(Object.keys(validateAppContent(content))).toEqual(['branding.appName']);
  });
});

describe('interpolate', () => {
  it('replaces known placeholders and leaves unknown ones alone', () => {
    expect(interpolate('Welcome back, {name}', { name: 'Asha' })).toBe('Welcome back, Asha');
    expect(interpolate('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(interpolate('No vars {x}')).toBe('No vars {x}');
    expect(interpolate('{x}{x}', { x: 'y' })).toBe('yy');
  });
});

describe('moduleForPath', () => {
  it('maps a route and its sub-routes to the owning module', () => {
    expect(moduleForPath('/items')).toBe('items');
    expect(moduleForPath('/items/abc/edit')).toBe('items');
    expect(moduleForPath('/invoices/new')).toBe('invoices');
    expect(moduleForPath('/expenses')).toBe('expenses');
    expect(moduleForPath('/expense-dashboard')).toBe('expenseDashboard');
    expect(moduleForPath('/razorpay-payments')).toBe('razorpay');
  });

  it('leaves always-on pages alone', () => {
    expect(moduleForPath('/dashboard')).toBeNull();
    expect(moduleForPath('/settings')).toBeNull();
    expect(moduleForPath('/itemsx')).toBeNull();
  });
});

describe('brandPalette', () => {
  it('derives a darker hover and a light tint', () => {
    expect(brandPalette('#000000')).toEqual({ primary: '#000000', hover: '#000000', soft: '#ebebeb' });
    const { hover, soft } = brandPalette('#2563eb');
    expect(hover).toMatch(/^#[0-9a-f]{6}$/);
    expect(Number.parseInt(hover.slice(1), 16)).toBeLessThan(0x2563eb);
    expect(soft > '#e0').toBe(true);
  });
});

describe('fetchPublicAppContent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes the published document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ texts: { 'items.title': 'Products' } }), { status: 200 })));
    expect((await fetchPublicAppContent()).texts['items.title']).toBe('Products');
  });

  it('falls back to the bundled defaults on any failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })));
    expect(await fetchPublicAppContent()).toBe(DEFAULT_APP_CONTENT);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    expect(await fetchPublicAppContent()).toBe(DEFAULT_APP_CONTENT);
  });
});
