/** Where an employee lands from the invitation email: choose a password, then go straight to the workspace. */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Sparkles } from 'lucide-react';

import { ApiError } from '@/api/client';
import { workspaceApi, type WorkspaceInviteInfo } from '@/api/workspace';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError, LoadingBlock } from '@/components/ui/Feedback';
import { PASSWORD_HINT, validatePassword } from '@/pages/settings/passwordRules';

import '@/styles/workspace.css';

export function WorkspaceInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { adoptSession } = useAuth();
  const [info, setInfo] = useState<WorkspaceInviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setProblem('This invitation link is incomplete. Open the link from your email again.');
      setLoading(false);
      return;
    }
    let active = true;
    workspaceApi
      .inviteInfo(token)
      .then((i) => {
        if (active) {
          setInfo(i);
          setName(i.name);
        }
      })
      .catch((err) => active && setProblem(err instanceof ApiError ? err.message : 'This invitation link is not valid.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const bad = validatePassword(password);
    if (bad) return setError(bad);
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    try {
      const res = await workspaceApi.acceptInvite({ token, password, name: name.trim() || undefined });
      await adoptSession(res.accessToken);
      navigate('/workspace', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create your login. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="ws-invite">
      <div className="ws-invite-card">
        <span className="ws-logo" style={{ width: 42, height: 42, borderRadius: 12 }}>
          <Sparkles size={21} />
        </span>
        {loading ? (
          <LoadingBlock label="Checking your invitation…" />
        ) : problem || !info ? (
          <>
            <h1>Invitation not available</h1>
            <p className="cm-muted">{problem}</p>
            <Button variant="primary" onClick={() => navigate('/login')}>
              Go to sign in
            </Button>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <h1>Welcome to {info.organizationName}</h1>
            <p className="cm-muted" style={{ marginTop: 0 }}>
              You have been invited to the <strong>{info.workspaceName}</strong> ({info.department}). Create your own login; your sign-in email is <strong>{info.email}</strong>.
            </p>
            <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            <TextField label="Choose a password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint={PASSWORD_HINT} required />
            <TextField label="Confirm password" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            <div style={{ margin: '4px 0 12px' }}>
              <Button type="button" variant="link" size="sm" icon={show ? <EyeOff size={15} /> : <Eye size={15} />} onClick={() => setShow((s) => !s)}>
                {show ? 'Hide passwords' : 'Show passwords'}
              </Button>
            </div>
            <FormError message={error} />
            <Button type="submit" variant="primary" loading={busy} style={{ width: '100%' }}>
              Create my login and open my workspace
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
