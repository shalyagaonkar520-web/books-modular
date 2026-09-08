import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, UserPlus } from 'lucide-react';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { useSubmit } from '@/hooks/useSubmit';

/** Server-side rules, mirrored here so the user gets feedback before submitting. */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password === password.toLowerCase() || password === password.toUpperCase()) {
    return 'Include both upper and lower case letters.';
  }
  if (!/\d/.test(password)) return 'Include at least one digit.';
  return null;
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { submitting, error, fieldErrors, run, setError } = useSubmit();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [gstin, setGstin] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);

  const passwordHint = touched ? passwordProblem(password) : null;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    const problem = passwordProblem(password);
    if (problem) {
      setError(`Password: ${problem}`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    const result = await run(async () => {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        organizationName: organizationName.trim(),
        gstin: gstin.trim() || undefined,
      });
      return true;
    });
    if (result) navigate('/', { replace: true });
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/rooman-logo.png" alt="" />
          <h1 className="auth-title">Create your organization</h1>
        </div>
        <p className="auth-subtitle">
          You will be the administrator. Your chart of accounts and a petty cash account are set up automatically, with no sample
          data.
        </p>

        <form onSubmit={onSubmit} noValidate>
          <FormError message={error} />

          <TextField
            label="Organization name"
            required
            value={organizationName}
            error={fieldErrors.organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            autoFocus
          />
          <TextField
            label="GSTIN"
            hint="Optional. You can add it later in settings."
            value={gstin}
            error={fieldErrors.gstin}
            onChange={(event) => setGstin(event.target.value.toUpperCase())}
          />
          <TextField label="Your name" required value={name} error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />
          <TextField
            label="Work email"
            type="email"
            autoComplete="email"
            required
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <div className="password-row">
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              error={passwordHint ?? fieldErrors.password}
              hint={passwordHint ? undefined : 'At least 8 characters, mixed case, with a digit.'}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => setTouched(true)}
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

          <TextField
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            error={confirm && confirm !== password ? 'Passwords do not match.' : undefined}
            onChange={(event) => setConfirm(event.target.value)}
          />

          <Button type="submit" variant="primary" size="md" loading={submitting} icon={<UserPlus size={15} />} className="btn-block">
            Create organization
          </Button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
