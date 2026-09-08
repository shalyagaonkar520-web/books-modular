import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api, getAccessToken, onUnauthorized, request, setAccessToken } from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('api client', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the bearer token and parses JSON', async () => {
    setAccessToken('token-123');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'i1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get<{ id: string }>('/items/i1');

    expect(result).toEqual({ id: 'i1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/items/i1');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123');
    expect(init.credentials).toBe('include');
  });

  it('serialises query parameters and drops empty values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/items', { search: 'monitor', page: 2, type_filter: undefined, blank: '' });

    expect(fetchMock.mock.calls[0][0]).toBe('/api/items?search=monitor&page=2');
  });

  it('turns a string detail into an ApiError message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Insufficient stock for Monitor' }, 400)));

    await expect(api.post('/invoices', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Insufficient stock for Monitor',
    });
  });

  it('maps FastAPI validation errors to field errors', async () => {
    const body = {
      detail: [
        { loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'value_error' },
        { loc: ['body', 'password'], msg: 'Password must be at least 8 characters long', type: 'value_error' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body, 422)));

    const error = await api.post('/auth/register', {}).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(422);
    expect(apiError.fieldErrors.email).toContain('valid email');
    expect(apiError.fieldErrors.password).toContain('8 characters');
    expect(apiError.message).toContain('Email:');
  });

  it('refreshes once on a 401 and replays the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'Invalid or expired token' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh-token' }))
      .mockResolvedValueOnce(jsonResponse({ total: 3 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get<{ total: number }>('/items');

    expect(result).toEqual({ total: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
    expect(getAccessToken()).toBe('fresh-token');
    const replayHeaders = fetchMock.mock.calls[2][1].headers as Record<string, string>;
    expect(replayHeaders.Authorization).toBe('Bearer fresh-token');
  });

  it('clears the session and notifies listeners when refresh fails', async () => {
    setAccessToken('stale');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'Invalid or expired token' }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: 'No refresh token' }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);

    await expect(api.get('/items')).rejects.toBeInstanceOf(ApiError);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    unsubscribe();
  });

  it('does not retry when retryOnUnauthorized is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: 'Invalid email or password' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/auth/login', { method: 'POST', body: {}, retryOnUnauthorized: false })).rejects.toMatchObject({
      message: 'Invalid email or password',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a friendly message when the network is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(api.get('/items')).rejects.toMatchObject({
      status: 0,
      message: 'Cannot reach the server. Check your connection and try again.',
    });
  });
});
