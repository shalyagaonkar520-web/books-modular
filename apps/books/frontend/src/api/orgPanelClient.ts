/**
 * HTTP client for the *organization admin panel* API (/org-admin).
 *
 * Modelled on `platformClient.ts` and just as independent: the panel has its
 * own logins (created by the platform administrator), so it keeps its own
 * short-lived access token in memory (never localStorage) and refreshes
 * against the panel's refresh endpoint (httpOnly `rb_org_panel_refresh`
 * cookie). The tenant app, the platform console and the panel can therefore
 * never share or clobber each other's session.
 */
import { ApiError } from './client';
import { parseApiErrorBody } from './platformClient';

const BASE = '/api';

/**
 * Extends the tenant `ApiError` so the shared `useAsync`/`useSubmit` hooks
 * (which test `instanceof ApiError`) surface panel error messages and
 * per-field validation the same way — without sharing any auth state.
 */
export class OrgPanelApiError extends ApiError {
  /** Validation messages keyed by the full dotted location, e.g. `texts.items.title`. */
  readonly pathErrors: Record<string, string>;

  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string> = {},
    pathErrors: Record<string, string> = {},
  ) {
    super(message, status, fieldErrors);
    this.name = 'OrgPanelApiError';
    this.pathErrors = pathErrors;
  }
}

type Listener = () => void;

let accessToken: string | null = null;
const unauthorizedListeners = new Set<Listener>();

export function setOrgPanelAccessToken(token: string | null): void {
  accessToken = token;
}

export function getOrgPanelAccessToken(): string | null {
  return accessToken;
}

export function onOrgPanelUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
  unauthorizedListeners.forEach((listener) => listener());
}

function parseError(status: number, body: unknown): OrgPanelApiError {
  const { message, fieldErrors, pathErrors } = parseApiErrorBody(status, body);
  return new OrgPanelApiError(message, status, fieldErrors, pathErrors);
}

interface RefreshResult {
  accessToken: string;
}

let refreshInFlight: Promise<RefreshResult | null> | null = null;

/**
 * Exchange the refresh cookie for a new access token. Returns the payload
 * (token + admin + organization) on success, or null when there is no valid
 * refresh cookie.
 *
 * The refresh token rotates on every use, so concurrent calls (StrictMode's
 * double mount, or several requests hitting a 401 at once) share one in-flight
 * request instead of spending the same cookie twice and logging the admin out.
 */
export function orgPanelRefresh<T = RefreshResult>(): Promise<T | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/org-admin/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) return null;
        const body = (await res.json()) as RefreshResult;
        if (!body.accessToken) return null;
        accessToken = body.accessToken;
        return body;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight as Promise<T | null>;
}

export interface OrgPanelRequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Set false for the auth endpoints so a failed refresh does not loop. */
  retryOnUnauthorized?: boolean;
}

function buildUrl(path: string, query?: OrgPanelRequestOptions['query']): string {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function orgPanelRequest<T>(path: string, options: OrgPanelRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, retryOnUnauthorized = true } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  };

  let response: Response;
  try {
    response = await send();
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new OrgPanelApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  if (response.status === 401 && retryOnUnauthorized) {
    if ((await orgPanelRefresh()) !== null) {
      response = await send();
    } else {
      accessToken = null;
      notifyUnauthorized();
      throw parseError(
        401,
        await response.json().catch(() => ({ detail: 'Your session has expired. Please sign in again.' })),
      );
    }
  }

  if (response.status === 204) return undefined as T;

  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (response.status === 401 && retryOnUnauthorized) {
      accessToken = null;
      notifyUnauthorized();
    }
    throw parseError(response.status, payload ?? { detail: response.statusText });
  }
  return payload as T;
}

type Query = OrgPanelRequestOptions['query'];

export const orgPanelClient = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => orgPanelRequest<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => orgPanelRequest<T>(path, { method: 'POST', body, query }),
  put: <T>(path: string, body?: unknown) => orgPanelRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => orgPanelRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => orgPanelRequest<T>(path, { method: 'DELETE' }),
};
