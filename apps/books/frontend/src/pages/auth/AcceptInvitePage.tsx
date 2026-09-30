import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { authApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import type { InviteInfo } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError, LoadingBlock } from '@/components/ui/Feedback';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { PASSWORD_HINT, validatePassword } from '@/pages/settings/passwordRules';

/** Where an invitee lands from the link in their invite email, to set a password and then sign in normally. */
export function AcceptInvitePage() {
  const { t } = useAppContent();
  const { login, isEmployee } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const { submitting, error, run, setError } = useSubmit();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Fallback messages are stored as catalog keys so they follow the editable text.
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadErrorKey('auth.invite.missingToken');
      setLoading(false);
      return;
    }
    let active = true;
    authApi
      .getInvite(token)
      .then((info) => {
        if (active) setInvite(info);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError) setLoadError(err.message);
        else setLoadErrorKey('auth.invite.invalid');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validatePassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError(t('auth.invite.mismatch'));
      return;
    }
    const result = await run(async () => {
      await authApi.acceptInvite({ token, password });
      if (invite?.email) {
        try {
          await login(invite.email, password);
          return 'logged_in';
        } catch {
          // If auto-login fails, fallback to manual login screen
        }
      }
      return 'done';
    });
    if (result === 'logged_in') {
      navigate(isEmployee ? '/portal' : '/dashboard', { replace: true });
    } else if (result === 'done') {
      setDone(true);
    }
  };

  if (loading) return <LoadingBlock label={t('auth.invite.loading')} />;

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/rooman-logo.png" alt="" />
          <h1 className="auth-title">{done ? t('auth.invite.titleDone') : t('auth.invite.title')}</h1>
        </div>

        {loadError || loadErrorKey ? (
          <>
            <FormError message={loadError ?? (loadErrorKey ? t(loadErrorKey) : null)} />
            <p className="auth-footer">
              <Link to="/login">{t('auth.invite.backToSignIn')}</Link>
            </p>
          </>
        ) : done ? (
          <>
            <p className="auth-subtitle">
              <CheckCircle2 size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6, color: 'var(--color-success, #16a34a)' }} />
              {t('auth.invite.doneBody', { email: invite?.email ?? '' })}
            </p>
            <Button
              variant="primary"
              size="md"
              className="btn-block"
              onClick={() => navigate('/login', { replace: true, state: { email: invite?.email } })}
            >
              {t('auth.invite.goToSignIn')}
            </Button>
          </>
        ) : (
          <>
            <p className="auth-subtitle">
              {invite ? (
                <>
                  {t('auth.invite.introBefore', { name: invite.name })} <strong>{invite.organizationName}</strong>{' '}
                  {t('auth.invite.introAfter', { email: invite.email })}
                </>
              ) : null}
            </p>

            <form onSubmit={onSubmit} noValidate>
              <FormError message={error} />

              <div className="password-row">
                <TextField
                  label={t('auth.invite.password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  hint={PASSWORD_HINT}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? t('auth.invite.hidePassword') : t('auth.invite.showPassword')}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <TextField
                label={t('auth.invite.confirmPassword')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirm}
                error={confirm && confirm !== password ? t('auth.invite.mismatchInline') : undefined}
                onChange={(event) => setConfirm(event.target.value)}
              />

              <Button type="submit" variant="primary" size="md" loading={submitting} icon={<KeyRound size={15} />} className="btn-block">
                {t('auth.invite.submit')}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
