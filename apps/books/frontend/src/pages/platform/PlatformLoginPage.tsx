import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';

import { usePlatformAuth } from '@/auth/PlatformAuthContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { useSubmit } from '@/hooks/useSubmit';

export function PlatformLoginPage() {
  const { login } = usePlatformAuth();
  const navigate = useNavigate();
  const { submitting, error, fieldErrors, run } = useSubmit();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await run(async () => {
      await login(email.trim().toLowerCase(), password);
      return true;
    });
    if (result) navigate('/platform', { replace: true });
  };

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
              Platform Admin
            </h1>
            <p className="card-subtitle" style={{ margin: 0 }}>
              Rooman Books · Super Admin console
            </p>
          </div>
        </div>

        <p className="text-muted small" style={{ marginBottom: 18 }}>
          Sign in with your platform operator credentials. This console is separate from any organization login.
        </p>

        <form onSubmit={onSubmit} noValidate>
          <FormError message={error} />

          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="username"
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
      </div>
    </div>
  );
}
