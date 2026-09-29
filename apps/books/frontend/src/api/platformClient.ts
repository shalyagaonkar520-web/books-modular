/**
 * HTTP client for the Rooman Books *platform admin* API.
 *
 * Modelled on the tenant `client.ts`, but deliberately independent: it keeps its
 * own short-lived platform access token in memory (never localStorage) and
 * refreshes against the platform refresh endpoint, so the operator console and
 * the tenant app can never share or clobber each other's session.
 */
import { ApiError } from './client';

const BASE = '/api';

/**
 * Extends the tenant `ApiError` so the shared `useAsync`/`useSubmit` hooks
 * (which test `instanceof ApiError`) surface platform error messages and
 * per-field validation the same way — without sharing any auth state.
 */
export class PlatformApiError extends ApiError {
  /** Validation messages keyed by the full dotted location, e.g. `pricing.plans.0.name`
   *  (`fieldErrors` only keeps the last segment, which is ambiguous for nested bodies). */
  readonly pathErrors: Record<string, string>;

  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string> = {},
    pathErrors: Record<string, string> = {},
  ) {
    super(message, status, fieldErrors);
    this.name = 'PlatformApiError';
    this.pathErrors = pathErrors;
  }
}

type Listener = () => void;

let accessToken: string | null = null;
const unauthorizedListeners = new Set<Listener>();

export function setPlatformAccessToken(token: string | null): void {
  accessToken = token;
}

export function getPlatformAccessToken(): string | null {
  return accessToken;
}

export function onPlatformUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
  unauthorizedListeners.forEach((listener) => listener());
}

/** Turn a FastAPI error body into a message plus per-field messages. */
function parseError(status: number, body: unknown): PlatformApiError {
  const fieldErrors: Record<string, string> = {};
  const pathErrors: Record<string, string> = {};
  let message = `Request failed (${status})`;

  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      const messages: string[] = [];
      for (const raw of detail) {
        const entry = raw as { loc?: unknown[]; msg?: string };
        const msg = entry.msg ?? 'Invalid value';
        const loc = Array.isArray(entry.loc) ? entry.loc.filter((part) => part !== 'body') : [];
        const field = loc.length ? String(loc[loc.length - 1]) : '';
        if (field) fieldErrors[field] = msg;
        if (loc.length) pathErrors[loc.map(String).join('.')] = msg;
        messages.push(field ? `${humanize(field)}: ${msg}` : msg);
      }
      message = messages.join('\n');
    }
  }
  return new PlatformApiError(message, status, fieldErrors, pathErrors);
}

function humanize(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^\s*./, (c) => c.toUpperCase())
    .trim();
}

interface RefreshResult {
  accessToken: string;
  admin?: unknown;
}

/** 401-retry refresh. Shares the single in-flight request with the load-time
 *  restore (platformRefresh), since the rotating token can only be spent once. */
async function refreshOnce(): Promise<boolean> {
  return (await platformRefresh()) !== null;
}

/**
 * Explicit refresh used by the auth provider to restore a session on load.
 * Returns the payload (token + admin) on success, or null when there is no
 * valid refresh cookie.
 */
let restoreInFlight: Promise<RefreshResult | null> | null = null;

export function platformRefresh<T = RefreshResult>(): Promise<T | null> {
  // The refresh token rotates on every use, so two concurrent calls with the
  // same cookie make the second one fail (its token was just revoked) and log
  // the admin out. React StrictMode mounts the provider twice in development,
  // which triggers exactly that; share one in-flight request instead.
  if (!restoreInFlight) {
    restoreInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/platform/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) return null;
        const body = (await res.json()) as RefreshResult;
        if (!body.accessToken) return null;
        accessToken = body.accessToken;
        return body;
      } catch {
        return null;
      }
    })().finally(() => {
      restoreInFlight = null;
    });
  }
  return restoreInFlight as Promise<T | null>;
}

export interface PlatformRequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Set false for the auth endpoints so a failed refresh does not loop. */
  retryOnUnauthorized?: boolean;
}

function buildUrl(path: string, query?: PlatformRequestOptions['query']): string {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function platformRequest<T>(path: string, options: PlatformRequestOptions = {}): Promise<T> {
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
    throw new PlatformApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  if (response.status === 401 && retryOnUnauthorized) {
    const refreshed = await refreshOnce();
    if (refreshed) {
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
    if (response.status === 401) {
      accessToken = null;
      notifyUnauthorized();
    }
    throw parseError(response.status, payload ?? { detail: response.statusText });
  }
  return payload as T;
}

export const platformClient = {
  get: <T>(path: string, query?: PlatformRequestOptions['query'], signal?: AbortSignal) =>
    platformRequest<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: PlatformRequestOptions['query']) =>
    platformRequest<T>(path, { method: 'POST', body, query }),
  put: <T>(path: string, body?: unknown) => platformRequest<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => platformRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => platformRequest<T>(path, { method: 'DELETE' }),
};

/**
 * Download a file through the authenticated platform API and hand it to the
 * browser. Mirrors `downloadFile` in the tenant client but carries the platform
 * access token and refreshes against the platform refresh endpoint on a 401.
 */
export async function platformDownload(
  path: string,
  filename: string,
  query?: PlatformRequestOptions['query'],
): Promise<void> {
  const url = buildUrl(path, query);
  const fetchOnce = () =>
    fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      credentials: 'include',
    });

  let response = await fetchOnce();
  if (response.status === 401 && (await refreshOnce())) {
    response = await fetchOnce();
  }
  if (!response.ok) {
    if (response.status === 401) {
      accessToken = null;
      notifyUnauthorized();
    }
    throw parseError(response.status, await response.json().catch(() => ({ detail: 'Download failed' })));
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the download a moment to latch on before revoking, otherwise the
  // browser can tear the blob down before it has started reading it.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
