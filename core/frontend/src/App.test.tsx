import { render, screen } from '@testing-library/react';
import { App } from './App';

function respond(ok: boolean, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, headers: new Headers(headers), json: () => Promise.resolve(body) })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Core sign-in placeholder', () => {
  it('reports a healthy service', async () => {
    respond(true, { status: 'healthy' });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(await screen.findByText('The identity service is running.')).toBeInTheDocument();
  });

  it('shows a reference id when the database is down', async () => {
    respond(true, { status: 'degraded' }, { 'X-Request-ID': 'abc123' });
    render(<App />);
    expect(await screen.findByText(/database is not reachable/)).toBeInTheDocument();
    expect(screen.getByText(/Reference: abc123/)).toBeInTheDocument();
  });

  it('explains what to do when the service cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    render(<App />);
    expect(await screen.findByText(/cannot be reached/)).toBeInTheDocument();
  });
});
