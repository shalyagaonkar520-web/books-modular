/**
 * Rooman One sign-in (/signin), Phase 0 placeholder. The real sign-in page (OIDC
 * authorize, MFA, per-org texts) arrives in Phase 1. Until then this page
 * shows whether the Core service is reachable, so the stack can be checked.
 */
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@rooman/shell';

type Status = 'checking' | 'healthy' | 'degraded' | 'unreachable';

const STATUS_TEXT: Record<Status, string> = {
  checking: 'Checking the identity service…',
  healthy: 'The identity service is running.',
  degraded: 'The identity service is running, but its database is not reachable. Try again in a minute.',
  unreachable: 'The identity service cannot be reached. Check that it is running, then reload this page.',
};

export function SignIn() {
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
    <main className="signin">
      <div className="signin-theme">
        <ThemeToggle />
      </div>
      <section className="signin-card" aria-labelledby="signin-title">
        <p className="signin-brand">
          <a href="/">Rooman One</a>
        </p>
        <h1 id="signin-title">Sign in</h1>
        <p className="signin-lead">One login for Books, Bookings and every other Rooman app.</p>
        <p className="signin-note">Single sign-on is being set up. Until it is ready, keep signing in to Rooman Books as you do today.</p>
        <p className={`signin-status signin-status-${status}`} role="status">
          {STATUS_TEXT[status]}
          {requestId && status !== 'healthy' && <span className="signin-ref"> Reference: {requestId}</span>}
        </p>
      </section>
    </main>
  );
}
