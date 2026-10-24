import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';

import { orgAdminApi } from '@/api/orgAdmin';
import { useOrgPanelAuth } from '@/auth/OrgPanelAuthContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { useSubmit } from '@/hooks/useSubmit';

export function OrgAdminLoginPage() {
  const { login } = useOrgPanelAuth();
  const navigate = useNavigate();
  const { submitting, error, fieldErrors, run } = useSubmit();

  const [email, setEmail] = useState('');
  // Forgot password: a request to the platform administrator, who issues a temporary password.
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotSent, setForgotSent] = useState<string | null>(null);
  const forgot = useSubmit();

  const requestReset = async () => {
    const sent = await forgot.run(() => orgAdminApi.auth.forgotPassword({ loginId: email.trim().toLowerCase() }));
    if (sent) setForgotSent(sent.message);
  };
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await run(async () => {
      await login(email.trim().toLowerCase(), password);
      return true;
    });
    if (result) navigate('/org-admin', { replace: true });
  };

  // The panel password is set by the platform admin and is not the app password,
  // even when the email is the same - say so instead of a bare "invalid".
  const message =
    error === 'Invalid email or password'
      ? 'Invalid admin ID or password. Use the admin panel login, not your app login.'
      : error;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(1200px 600px at 50% -10%, #1e293b 0%, #0f172a 60%, #020617 100%)',
      }}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 420, padding: '28px 26px', boxShadow: 'var(--shadow-lg)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1, #2563eb)',
              color: '#ffffff',
            }}
          >
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 className="card-title" style={{ margin: 0 }}>
              Organization admin sign in
            </h1>
            <p className="card-subtitle" style={{ margin: 0 }}>
              Rooman Books · Organization admin panel
            </p>
          </div>
        </div>

        <p className="text-muted small" style={{ marginBottom: 18 }}>
          Sign in with the admin panel login the platform administrator created for your organization. It is separate from
          your login to the app itself.
        </p>

        <form onSubmit={onSubmit} noValidate>
          <FormError message={message} />

          <TextField
            label="Admin ID"
            type="text"
            name="loginId"
            autoComplete="username"
            hint="The ID you chose, or admin@<organization code> the first time"
            required
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <div className="password-row" style={{ position: 'relative' }}>
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              error={fieldErrors.password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            icon={<LogIn size={15} />}
            className="btn-block"
            style={{ width: '100%', marginTop: 16 }}
          >
            Sign in
          </Button>
        </form>

        <div style={{ marginTop: 14, textAlign: 'center' }}>
          {forgotSent ? (
            <p className="small" role="status" style={{ margin: 0 }}>
              {forgotSent}
            </p>
          ) : forgotOpen ? (
            <div className="stack" style={{ textAlign: 'left' }}>
              <FormError message={forgot.error} />
              <p className="small text-muted" style={{ margin: 0 }}>
                Enter your admin ID above and send the request. The platform administrator will give you a temporary password;
                you then choose your own when you sign in.
              </p>
              <Button variant="secondary" disabled={!email.trim()} loading={forgot.submitting} onClick={() => void requestReset()}>
                Send reset request
              </Button>
            </div>
          ) : (
            <button type="button" className="btn btn-link btn-sm" onClick={() => setForgotOpen(true)}>
              Forgot password? Request a reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
