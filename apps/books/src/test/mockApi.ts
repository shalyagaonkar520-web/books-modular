/**
 * A small fetch stub that answers by route, so page tests exercise real
 * components against realistic API payloads.
 */
import { vi } from 'vitest';

import { authResponse } from './renderWithProviders';

export type RouteMap = Record<string, unknown | ((url: URL, init: RequestInit) => unknown)>;

export interface MockApi {
  fetchMock: ReturnType<typeof vi.fn>;
  calls: Array<{ method: string; path: string; body: unknown }>;
}

const DEFAULTS: RouteMap = {
  'GET /api/auth/me': authResponse,
};

export function installMockApi(routes: RouteMap = {}): MockApi {
  const table: RouteMap = { ...DEFAULTS, ...routes };
  const calls: MockApi['calls'] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const raw = typeof input === 'string' ? input : input.toString();
    const url = new URL(raw, 'http://localhost');
    const method = (init.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    calls.push({ method, path: url.pathname, body: init.body ? JSON.parse(String(init.body)) : undefined });

    const handler = table[key];
    if (handler === undefined) {
      return new Response(JSON.stringify({ detail: `No mock for ${key}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const value = typeof handler === 'function' ? (handler as (u: URL, i: RequestInit) => unknown)(url, init) : handler;
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value), { status: method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } });
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

export const page = <T,>(items: T[], overrides: Partial<{ total: number; page: number; pageSize: number }> = {}) => ({
  items,
  total: overrides.total ?? items.length,
  page: overrides.page ?? 1,
  pageSize: overrides.pageSize ?? 25,
});
