import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Ban,
  BookMarked,
  BookOpen,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Landmark,
  Clock,
  LogIn,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { authApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

/** Sign-in refusals the API marks with a machine-readable prefix on `detail`. */
const ACCOUNT_STATE_PREFIXES = {
  PENDING_APPROVAL: 'pending',
  REGISTRATION_REJECTED: 'rejected',
  TRIAL_ENDED: 'trialEnded',
} as const;

type AccountState = (typeof ACCOUNT_STATE_PREFIXES)[keyof typeof ACCOUNT_STATE_PREFIXES];

function parseAccountState(message: string | null): { kind: AccountState; text: string } | null {
  if (!message) return null;
  for (const [code, kind] of Object.entries(ACCOUNT_STATE_PREFIXES)) {
    if (message.startsWith(`${code}:`)) {
      return { kind, text: message.slice(code.length + 1).trim() };
    }
  }
  return null;
}

function AccountStateNotice({ kind, text }: { kind: AccountState; text: string }) {
  const { t } = useAppContent();
  // A trial that ended is a wait (amber), like a pending approval.
  const pending = kind === 'pending' || kind === 'trialEnded';
  const title = { pending: 'auth.login.notice.pendingTitle', rejected: 'auth.login.notice.rejectedTitle', trialEnded: 'auth.login.notice.trialEndedTitle' }[kind];
  const body = { pending: 'auth.login.notice.pendingBody', rejected: 'auth.login.notice.rejectedBody', trialEnded: 'auth.login.notice.trialEndedBody' }[kind];
  return (
    <div
      role="alert"
      className={`auth-account-notice is-${kind}`}
      style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
        marginBottom: '14px',
        padding: '10px 12px',
        borderRadius: '8px',
        fontSize: '13px',
        lineHeight: 1.5,
        background: pending ? '#fffbeb' : '#fef2f2',
        border: `1px solid ${pending ? '#fde68a' : '#fecaca'}`,
        borderLeft: `4px solid ${pending ? '#d97706' : '#dc2626'}`,
        color: pending ? '#92400e' : '#991b1b',
      }}
    >
      {pending ? (
        <Clock size={16} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
      ) : (
        <Ban size={16} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
      )}
      <div>
        <strong style={{ display: 'block' }}>{t(title)}</strong>
        <span>{text || t(body)}</span>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { t, branding } = useAppContent();
  const { login, isEmployee } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();

  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const accountState = parseAccountState(error);

  // Forgot password state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'otp'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleOpenForgot = () => {
    setForgotEmail(email.trim());
    setForgotStep('email');
    setForgotOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setForgotError(null);
    setForgotNotice(null);
    setForgotOpen(true);
  };

  const handleSendResetCode = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const cleanEmail = forgotEmail.trim().toLowerCase();
    setForgotError(null);
    if (!cleanEmail) {
      setForgotError(t('auth.forgot.error.emailRequired'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setForgotError(t('auth.forgot.error.emailInvalid'));
      return;
    }

    setSendingReset(true);
    try {
      await authApi.forgotPassword(cleanEmail);
      setForgotNotice(t('auth.forgot.codeSent', { email: cleanEmail }));
      setForgotStep('otp');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.forgot.error.noAccount');
      setForgotError(msg);
    } finally {
      setSendingReset(false);
    }
  };

  const handleResetPassword = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const cleanEmail = forgotEmail.trim().toLowerCase();
    const cleanOtp = forgotOtp.trim();
    setForgotError(null);

    if (!cleanOtp) {
      setForgotError(t('auth.forgot.error.otpRequired'));
      return;
    }
    if (newPassword.length < 8) {
      setForgotError(t('auth.forgot.error.passwordLength'));
      return;
    }
    if (newPassword === newPassword.toLowerCase() || newPassword === newPassword.toUpperCase()) {
      setForgotError(t('auth.forgot.error.passwordCase'));
      return;
    }
    if (!/\d/.test(newPassword)) {
      setForgotError(t('auth.forgot.error.passwordDigit'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotError(t('auth.forgot.error.mismatch'));
      return;
    }

    setResettingPassword(true);
    try {
      await authApi.resetPasswordWithOtp({
        email: cleanEmail,
        otp: cleanOtp,
        newPassword,
      });
      toast.success(t('auth.forgot.toast.success'));
      setEmail(cleanEmail);
      setPassword('');
      setForgotOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.forgot.error.resetFailed');
      setForgotError(msg);
    } finally {
      setResettingPassword(false);
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await run(async () => {
      await login(email.trim(), password);
      return true;
    });
    if (result) {
      const from = (location.state as { from?: string } | null)?.from;
      const destination = from && from !== '/login' ? from : isEmployee ? '/portal' : '/dashboard';
      navigate(destination, { replace: true });
    }
  };

  return (
    <div className="auth-3d-portal">
      <div className="auth-3d-container">
        {/* Left Hero: simple animated stack of books */}
        <div className="auth-3d-hero">
          <div className="auth-badge-pill">
            <Sparkles size={14} color="var(--primary)" />
            <span>{branding.appName}</span>
          </div>

          <h2 className="auth-hero-title">{t('auth.login.heroTitle')}</h2>

          <p className="auth-hero-desc">{t('auth.login.heroBody')}</p>

          {/* Simple floating book animation */}
          <div className="auth-books-stack" aria-hidden="true">
            <BookOpen className="auth-book auth-book-1" />
            <BookMarked className="auth-book auth-book-2" />
            <BookOpen className="auth-book auth-book-3" />
          </div>

          {/* Value Badges */}
          <div className="auth-hero-metrics">
            <div className="hero-metric-item">
              <ShieldCheck size={18} color="var(--primary)" />
              <div>
                <strong>{t('auth.login.metric1.title')}</strong>
                <span className="small text-muted">{t('auth.login.metric1.body')}</span>
              </div>
            </div>
            <div className="hero-metric-item">
              <Landmark size={18} color="#0284c7" />
              <div>
                <strong>{t('auth.login.metric2.title')}</strong>
                <span className="small text-muted">{t('auth.login.metric2.body')}</span>
              </div>
            </div>
            <div className="hero-metric-item">
              <FileSpreadsheet size={18} color="#d97706" />
              <div>
                <strong>{t('auth.login.metric3.title')}</strong>
                <span className="small text-muted">{t('auth.login.metric3.body')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Card: Glassmorphic Login Form */}
        <div className="auth-card auth-card-3d">
          <div className="auth-brand">
            <div className="auth-brand-glow">
              <img src={branding.logoUrl} alt="" />
            </div>
            <div>
              <h1 className="auth-title">{branding.appName}</h1>
              <span className="auth-edition-badge">{t('auth.login.edition')}</span>
            </div>
          </div>

          <p className="auth-subtitle">{t('auth.login.subtitle')}</p>

          <form onSubmit={onSubmit} noValidate>
            {accountState ? <AccountStateNotice kind={accountState.kind} text={accountState.text} /> : <FormError message={error} />}

            <TextField
              label={t('auth.login.email')}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              error={fieldErrors.email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <div className="password-row">
              <TextField
                label={t('auth.login.password')}
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
                aria-label={showPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={handleOpenForgot}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary, #0284c7)',
                  fontSize: '12.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {t('auth.login.forgot')}
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={submitting}
              icon={<LogIn size={15} />}
              className="btn-block auth-submit-btn"
            >
              {t('auth.login.submit')}
            </Button>
          </form>

          <p className="auth-footer">
            {t('auth.login.newPrompt')} <Link to="/register">{t('auth.login.registerLink')}</Link>
          </p>

          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <Link
              to="/platform/login"
              style={{
                fontSize: '12px',
                color: '#64748b',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <ShieldCheck size={14} />
              <span>{t('auth.login.platformLink')}</span>
            </Link>
          </div>
        </div>
      </div>

      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title={t('auth.forgot.title')}
        subtitle={
          forgotStep === 'email'
            ? t('auth.forgot.subtitleEmail')
            : t('auth.forgot.subtitleOtp')
        }
        size="md"
      >
        {forgotStep === 'email' ? (
          <form onSubmit={handleSendResetCode} noValidate>
            <FormError message={forgotError} />
            <TextField
              label={t('auth.forgot.email')}
              type="email"
              required
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button type="button" variant="secondary" onClick={() => setForgotOpen(false)}>
                {t('auth.forgot.cancel')}
              </Button>
              <Button type="submit" variant="primary" loading={sendingReset} disabled={!forgotEmail.trim()}>
                {t('auth.forgot.sendCode')}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} noValidate>
            <FormError message={forgotError} />

            {forgotNotice && (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: '12.5px',
                }}
              >
                {forgotNotice}
              </div>
            )}

            <TextField
              label={t('auth.forgot.otp')}
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={forgotOtp}
              onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />

            <div className="password-row" style={{ marginTop: '12px' }}>
              <TextField
                label={t('auth.forgot.newPassword')}
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowNewPassword((v) => !v)}
                aria-label={showNewPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div style={{ marginTop: '12px' }}>
              <TextField
                label={t('auth.forgot.confirmPassword')}
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setForgotStep('email')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {t('auth.forgot.backToEmail')}
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button type="button" variant="secondary" onClick={() => setForgotOpen(false)}>
                  {t('auth.forgot.cancel')}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={resettingPassword}
                  disabled={forgotOtp.length < 4 || !newPassword || !confirmPassword}
                >
                  {t('auth.forgot.submit')}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

