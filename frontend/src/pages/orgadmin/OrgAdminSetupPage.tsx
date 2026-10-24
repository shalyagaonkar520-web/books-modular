import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';

import { useOrgPanelAuth } from '@/auth/OrgPanelAuthContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { useSubmit } from '@/hooks/useSubmit';
import { PASSWORD_HINT, validatePassword } from '@/pages/settings/passwordRules';

const LOGIN_ID = /^[a-z0-9][a-z0-9._@+-]{2,119}$/;

/**
 * First sign-in with the default admin@<code> login, or after a password reset:
 * the admin chooses their own login ID and password before using the panel.
 */
export function OrgAdminSetupPage() {
  const { admin, organization, completeSetup, logout } = useOrgPanelAuth();
  const navigate = useNavigate();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const isDefault = Boolean(admin?.email.startsWith('admin@'));
  const [loginId, setLoginId] = useState(isDefault ? '' : (admin?.email ?? ''));
  const [name, setName] = useState(admin?.name && admin.name !== 'Admin' ? admin.name : '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    const id = loginId.trim().toLowerCase();
    if (!LOGIN_ID.test(id)) next.loginId = 'Use 3 or more letters, digits or . _ @ + - (no spaces), e.g. your email.';
    if (name.trim() && name.trim().length < 2) next.name = 'Enter at least 2 characters.';
    const problem = validatePassword(password);
    if (problem) next.newPassword = problem;
    else if (password !== confirm) next.confirm = 'The passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const done = await run(async () => {
      await completeSetup({ loginId: id, name: name.trim() || undefined, newPassword: password });
      return true;
    });
    if (done) navigate('/org-admin', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: '100%', maxWidth: 460, padding: '28px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ShieldCheck size={22} aria-hidden="true" />
          <div>
            <h1 className="card-title" style={{ margin: 0 }}>
              Set up your admin login
            </h1>
            <p className="card-subtitle" style={{ margin: 0 }}>
              {organization?.name ?? 'Your organization'} · Organization admin panel
            </p>
          </div>
        </div>
        <p className="text-muted small" style={{ marginBottom: 16 }}>
          You signed in with a temporary login. Choose your own admin ID and password; the temporary ones stop working.
        </p>

        <form onSubmit={submit} noValidate className="stack">
          <FormError message={error} />
          <TextField
            label="Your admin ID"
            name="loginId"
            autoComplete="username"
            required
            value={loginId}
            hint="Your email works well. Letters, digits and . _ @ + - only."
            error={errors.loginId ?? fieldErrors.loginId}
            onChange={(event) => setLoginId(event.target.value)}
          />
          <TextField
            label="Your name"
            name="name"
            value={name}
            error={errors.name ?? fieldErrors.name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label="New password"
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            value={password}
            hint={PASSWORD_HINT}
            error={errors.newPassword ?? fieldErrors.newPassword}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            label="Confirm new password"
            type="password"
            name="confirm"
            autoComplete="new-password"
            required
            value={confirm}
            error={errors.confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <Button type="submit" variant="primary" icon={<KeyRound size={15} />} loading={submitting} style={{ width: '100%' }}>
            Save and continue
          </Button>
          <Button variant="ghost" icon={<LogOut size={15} />} onClick={() => void logout()} disabled={submitting}>
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
