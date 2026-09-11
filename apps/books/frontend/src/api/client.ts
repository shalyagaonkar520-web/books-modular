/**
 * HTTP client for the Rooman Books API.
 *
 * - Keeps the short-lived access token in memory (not localStorage) and relies
 *   on the httpOnly refresh cookie to restore a session.
 * - Transparently refreshes once on a 401 and replays the original request.
 */
import type { Page } from './types';

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, status: number, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type Listener = () => void;

let accessToken: string | null = null;
const unauthorizedListeners = new Set<Listener>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
  unauthorizedListeners.forEach((listener) => listener());
}

/** Turn a FastAPI error body into a message plus per-field messages. */
function parseError(status: number, body: unknown): ApiError {
  const fieldErrors: Record<string, string> = {};
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
        messages.push(field ? `${humanize(field)}: ${msg}` : msg);
      }
      message = messages.join('\n');
    }
  }
  return new ApiError(message, status, fieldErrors);
}

function humanize(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^\s*./, (c) => c.toUpperCase())
    .trim();
}

async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const body = (await res.json()) as { accessToken?: string };
    if (!body.accessToken) return false;
    accessToken = body.accessToken;
    return true;
  } catch {
    return false;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSession().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  formData?: FormData;
  signal?: AbortSignal;
  /** Set false for the auth endpoints so a failed refresh does not loop. */
  retryOnUnauthorized?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, formData, signal, retryOnUnauthorized = true } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: 'include',
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  };

  let response: Response;
  try {
    response = await send();
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  if (response.status === 401 && retryOnUnauthorized) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      response = await send();
    } else {
      accessToken = null;
      notifyUnauthorized();
      throw parseError(401, await response.json().catch(() => ({ detail: 'Your session has expired. Please sign in again.' })));
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

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions['query']) => request<T>(path, { method: 'POST', body, query }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', formData }),
};

/** Download a file through the authenticated API and hand it to the browser. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let response = await fetch(buildUrl(path), { headers, credentials: 'include' });
  if (response.status === 401 && (await refreshOnce())) {
    response = await fetch(buildUrl(path), {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      credentials: 'include',
    });
  }
  if (!response.ok) {
    throw parseError(response.status, await response.json().catch(() => ({ detail: 'Download failed' })));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously here races the browser: it can tear the blob down
  // before the download has actually started reading it, so the file silently
  // never arrives. Give the download a moment to latch on first.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const emptyPage = <T>(): Page<T> => ({ items: [], total: 0, page: 1, pageSize: 25 });
