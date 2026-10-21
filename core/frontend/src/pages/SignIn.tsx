/**
 * Rooman One sign-in (/signin): one login for Books, Bookings and every other
 * Rooman app.
 *
 * An app sends the browser to Core's /api/oauth/authorize, which comes here
 * with ?request=<id>. The person signs in (and picks an organization if they
 * belong to several); Core then answers with the app's return address, which
 * carries a one-time code. Passwords are only ever sent to Core.
 *
 * Without a request (someone opened /signin directly) the page is Rooman One's
 * own front door: sign in here once, then open any of your apps from the list -
 * each app's "Sign in with Rooman One" then goes straight through, no password.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ThemeToggle } from '@rooman/shell';

type Status = 'checking' | 'healthy' | 'degraded' | 'unreachable';

const STATUS_TEXT: Record<Status, string> = {
  checking: 'Checking the identity service…',
  healthy: 'The identity service is running.',
  degraded: 'The identity service is running, but its database is not reachable. Try again in a minute.',
  unreachable: 'The identity service cannot be reached. Check that it is running, then reload this page.',
};

interface Org {
  id: string;
  name: string;
  code: string;
  role: string;
}

interface RequestInfo {
  app: { key: string; name: string } | null;
  signedIn: boolean;
  user?: { email: string; name: string };
  organizations?: Org[];
}

interface AppLink {
  key: string;
  name: string;
  url: string;
  organizations: string[];
}

interface Home {
  signedIn: boolean;
  user?: { email: string; name: string };
  apps?: AppLink[];
}

// Every sign-in call carries this header; Core refuses the calls without it.
const PAGE_HEADERS = { 'Content-Type': 'application/json', 'X-Rooman-Signin': '1' };

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const response = await fetch(path, { method: 'POST', headers: PAGE_HEADERS, credentials: 'same-origin', body: JSON.stringify(body) });
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // a proxy error page or an empty body: handled below by the status
  }
  return { ok: response.ok, status: response.status, data };
}

function messageFor(status: number, data: Record<string, unknown>): string {
  if (typeof data.detail === 'string' && data.detail) return data.detail;
  if (status === 429) return 'Too many attempts. Wait a few minutes and try again.';
  if (status >= 500) return 'Sign-in is not available right now. Please try again in a moment.';
  return 'Sign-in failed. Please try again.';
}

function HealthStatus() {
  const [status, setStatus] = useState<Status>('checking');
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(async (response) => {
        const body = (await response.json()) as { status?: string };
        if (cancelled) return;
        setRequestId(response.headers.get('X-Request-ID'));
        setStatus(response.ok && body.status === 'healthy' ? 'healthy' : 'degraded');
      })
      .catch(() => {
        if (!cancelled) setStatus('unreachable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p className={`signin-status signin-status-${status}`} role="status">
      {STATUS_TEXT[status]}
      {requestId && status !== 'healthy' && <span className="signin-ref"> Reference: {requestId}</span>}
    </p>
  );
}

function OrgPicker({ orgs, busy, onPick }: { orgs: Org[]; busy: boolean; onPick: (id: string) => void }) {
  return (
    <div className="signin-orgs" role="group" aria-labelledby="signin-orgs-title">
      <h2 id="signin-orgs-title">Choose an organization</h2>
      <ul>
        {orgs.map((org) => (
          <li key={org.id}>
            <button type="button" className="signin-org" disabled={busy} onClick={() => onPick(org.id)}>
              <span className="signin-org-name">{org.name}</span>
              <span className="signin-org-meta">
                {org.code} · {org.role}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Apps({ home }: { home: Home }) {
  const apps = home.apps ?? [];
  return (
    <>
      <p className="signin-lead">
        Signed in as <strong>{home.user?.name || home.user?.email}</strong>
        {home.user?.name && <span className="signin-org-meta"> ({home.user.email})</span>}
      </p>
      {apps.length ? (
        <ul className="signin-apps" aria-label="Your apps">
          {apps.map((app) => (
            <li key={app.key}>
              <a className="signin-org" href={app.url}>
                <span className="signin-org-name">Open {app.name}</span>
                <span className="signin-org-meta">{app.organizations.join(', ')}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="signin-note">No apps are switched on for your organization yet.</p>
      )}
      <p className="signin-signout">
        <a href="/api/oauth/logout">Sign out</a>
      </p>
    </>
  );
}

/** Core's own page: sign in once, then pick an app. */
function HomeSignIn({ signedOut }: { signedOut: boolean }) {
  const [home, setHome] = useState<Home | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/oauth/me', { credentials: 'same-origin' })
      .then(async (response) => {
        const data = (await response.json()) as Home;
        if (!cancelled) setHome(response.ok ? data : { signedIn: false });
      })
      .catch(() => {
        if (!cancelled) setHome({ signedIn: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, status, data } = await post('/api/oauth/login', { email: email.trim(), password });
      if (ok && data.signedIn === true) setHome(data as unknown as Home);
      else setError(messageFor(status, data));
    } catch {
      setError('Sign-in is not available right now. Check your connection and try again.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  if (home?.signedIn) return <Apps home={home} />;
  return (
    <>
      {signedOut && <p className="signin-note">You have signed out of every Rooman app.</p>}
      <p className="signin-lead">One login for Books, Billing and every other Rooman app.</p>
      <form className="signin-form" onSubmit={submit} noValidate>
        <label htmlFor="signin-email">Email</label>
        <input id="signin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
        <label htmlFor="signin-password">Password</label>
        <input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="signin-submit" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {error && (
        <p className="signin-error" role="alert">
          {error}
        </p>
      )}
      <HealthStatus />
    </>
  );
}

export function SignIn({ search = window.location.search }: { search?: string }) {
  const params = new URLSearchParams(search);
  const requestId = params.get('request');
  const signedOut = params.get('signed_out') === '1';

  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    fetch(`/api/oauth/requests/${encodeURIComponent(requestId)}`, { credentials: 'same-origin' })
      .then(async (response) => {
        const data = (await response.json()) as RequestInfo & { detail?: string };
        if (cancelled) return;
        if (!response.ok) {
          setLoadError(data.detail || 'This sign-in link is no longer valid. Go back to the app and sign in again.');
          return;
        }
        setInfo(data);
        if (data.signedIn && data.organizations && data.organizations.length > 1) setOrgs(data.organizations);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Sign-in is not available right now. Please try again in a moment.');
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const finish = (data: Record<string, unknown>) => {
    if (typeof data.redirect === 'string') {
      window.location.assign(data.redirect);
      return true;
    }
    if (Array.isArray(data.chooseOrganization)) {
      setOrgs(data.chooseOrganization as Org[]);
      return true;
    }
    return false;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!requestId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, status, data } = await post('/api/oauth/login', { request_id: requestId, email: email.trim(), password });
      if (!(ok && finish(data))) setError(messageFor(status, data));
    } catch {
      setError('Sign-in is not available right now. Check your connection and try again.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  const pick = async (orgId: string) => {
    if (!requestId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, status, data } = await post('/api/oauth/choose-org', { request_id: requestId, org_id: orgId });
      if (!(ok && finish(data))) setError(messageFor(status, data));
    } catch {
      setError('Sign-in is not available right now. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const appName = info?.app?.name ?? 'your Rooman app';

  return (
    <main className="signin">
      <div className="signin-theme">
        <ThemeToggle />
      </div>
      <section className="signin-card" aria-labelledby="signin-title">
        <p className="signin-brand">
          <a href="/">Rooman One</a>
        </p>
        <h1 id="signin-title">Sign in</h1>

        {!requestId ? (
          <HomeSignIn signedOut={signedOut} />
        ) : loadError ? (
          <p className="signin-error" role="alert">
            {loadError}
          </p>
        ) : orgs ? (
          <>
            <p className="signin-lead">Which organization do you want to open in {appName}?</p>
            <OrgPicker orgs={orgs} busy={busy} onPick={pick} />
          </>
        ) : (
          <>
            <p className="signin-lead">to continue to {appName}</p>
            <form className="signin-form" onSubmit={submit} noValidate>
              <label htmlFor="signin-email">Email</label>
              <input
                id="signin-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy || !info}
              />
              <label htmlFor="signin-password">Password</label>
              <input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy || !info}
              />
              <button type="submit" className="signin-submit" disabled={busy || !info || !email || !password}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </>
        )}
        {error && (
          <p className="signin-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
