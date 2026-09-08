const BASE = '/api';
export class ApiError extends Error {
    constructor(message, status, fieldErrors = {}) {
        super(message);
        Object.defineProperty(this, "status", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "fieldErrors", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.name = 'ApiError';
        this.status = status;
        this.fieldErrors = fieldErrors;
    }
}
let accessToken = null;
const unauthorizedListeners = new Set();
export function setAccessToken(token) {
    accessToken = token;
}
export function getAccessToken() {
    return accessToken;
}
export function onUnauthorized(listener) {
    unauthorizedListeners.add(listener);
    return () => unauthorizedListeners.delete(listener);
}
function notifyUnauthorized() {
    unauthorizedListeners.forEach((listener) => listener());
}
/** Turn a FastAPI error body into a message plus per-field messages. */
function parseError(status, body) {
    const fieldErrors = {};
    let message = `Request failed (${status})`;
    if (body && typeof body === 'object' && 'detail' in body) {
        const detail = body.detail;
        if (typeof detail === 'string') {
            message = detail;
        }
        else if (Array.isArray(detail)) {
            const messages = [];
            for (const raw of detail) {
                const entry = raw;
                const msg = entry.msg ?? 'Invalid value';
                const loc = Array.isArray(entry.loc) ? entry.loc.filter((part) => part !== 'body') : [];
                const field = loc.length ? String(loc[loc.length - 1]) : '';
                if (field)
                    fieldErrors[field] = msg;
                messages.push(field ? `${humanize(field)}: ${msg}` : msg);
            }
            message = messages.join('\n');
        }
    }
    return new ApiError(message, status, fieldErrors);
}
function humanize(field) {
    return field
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]+/g, ' ')
        .replace(/^\s*./, (c) => c.toUpperCase())
        .trim();
}
async function refreshSession() {
    try {
        const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok)
            return false;
        const body = (await res.json());
        if (!body.accessToken)
            return false;
        accessToken = body.accessToken;
        return true;
    }
    catch {
        return false;
    }
}
let refreshInFlight = null;
function refreshOnce() {
    if (!refreshInFlight) {
        refreshInFlight = refreshSession().finally(() => {
            refreshInFlight = null;
        });
    }
    return refreshInFlight;
}
function buildUrl(path, query) {
    const url = `${BASE}${path}`;
    if (!query)
        return url;
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '')
            params.set(key, String(value));
    });
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
}
export async function request(path, options = {}) {
    const { method = 'GET', body, query, formData, signal, retryOnUnauthorized = true } = options;
    const send = async () => {
        const headers = {};
        if (accessToken)
            headers.Authorization = `Bearer ${accessToken}`;
        if (body !== undefined)
            headers['Content-Type'] = 'application/json';
        return fetch(buildUrl(path, query), {
            method,
            headers,
            credentials: 'include',
            body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
            signal,
        });
    };
    let response;
    try {
        response = await send();
    }
    catch (error) {
        if (error.name === 'AbortError')
            throw error;
        throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }
    if (response.status === 401 && retryOnUnauthorized) {
        const refreshed = await refreshOnce();
        if (refreshed) {
            response = await send();
        }
        else {
            accessToken = null;
            notifyUnauthorized();
            throw parseError(401, await response.json().catch(() => ({ detail: 'Your session has expired. Please sign in again.' })));
        }
    }
    if (response.status === 204)
        return undefined;
    const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
    const payload = isJson ? await response.json().catch(() => null) : null;
    if (!response.ok) {
        if (response.status === 401) {
            accessToken = null;
            notifyUnauthorized();
        }
        throw parseError(response.status, payload ?? { detail: response.statusText });
    }
    return payload;
}
export const api = {
    get: (path, query, signal) => request(path, { query, signal }),
    post: (path, body, query) => request(path, { method: 'POST', body, query }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    delete: (path) => request(path, { method: 'DELETE' }),
    upload: (path, formData) => request(path, { method: 'POST', formData }),
};
/** Download a file through the authenticated API and hand it to the browser. */
export async function downloadFile(path, filename) {
    const headers = {};
    if (accessToken)
        headers.Authorization = `Bearer ${accessToken}`;
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
    URL.revokeObjectURL(url);
}
export const emptyPage = () => ({ items: [], total: 0, page: 1, pageSize: 25 });
