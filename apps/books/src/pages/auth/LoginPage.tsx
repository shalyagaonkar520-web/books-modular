import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { useSubmit } from '@/hooks/useSubmit';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { submitting, error, fieldErrors, run } = useSubmit();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await run(async () => {
      await login(email.trim(), password);
      return true;
    });
    if (result) {
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/rooman-logo.png" alt="" />
          <div>
            <h1 className="auth-title">Rooman Books</h1>
          </div>
        </div>
        <p className="auth-subtitle">Sign in to your organization's books.</p>

        <form onSubmit={onSubmit} noValidate>
          <FormError message={error} />

          <TextField
            label="Work email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />

          <div className="password-row">
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

          <Button type="submit" variant="primary" size="md" loading={submitting} icon={<LogIn size={15} />} className="btn-block">
            Sign in
          </Button>
        </form>

        <p className="auth-footer">
          New to Rooman Books? <Link to="/register">Create an organization</Link>
        </p>
      </div>
    </div>
  );
}
