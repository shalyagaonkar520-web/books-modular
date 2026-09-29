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
  const pending = kind === 'pending';
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
        <strong style={{ display: 'block' }}>{pending ? 'Awaiting approval' : 'Registration not approved'}</strong>
        <span>
          {text ||
            (pending
              ? 'Your organization is still waiting for approval by the platform team.'
              : 'Your organization registration was rejected.')}
        </span>
      </div>
    </div>
  );
}

export function LoginPage() {
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
      setForgotError('Please enter your registered work email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setForgotError('Please enter a valid email address.');
      return;
    }

    setSendingReset(true);
    try {
      await authApi.forgotPassword(cleanEmail);
      setForgotNotice(`Password reset code sent to ${cleanEmail}. Please check your inbox.`);
      setForgotStep('otp');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No registered account found with this email.';
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
      setForgotError('Please enter the 6-digit verification code.');
      return;
    }
    if (newPassword.length < 8) {
      setForgotError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword === newPassword.toLowerCase() || newPassword === newPassword.toUpperCase()) {
      setForgotError('Password must contain both upper and lower case letters.');
      return;
    }
    if (!/\d/.test(newPassword)) {
      setForgotError('Password must contain at least one digit.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotError('Passwords do not match.');
      return;
    }

    setResettingPassword(true);
    try {
      await authApi.resetPasswordWithOtp({
        email: cleanEmail,
        otp: cleanOtp,
        newPassword,
      });
      toast.success('Password reset successfully! You can now sign in with your new password.');
      setEmail(cleanEmail);
      setPassword('');
      setForgotOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset password. Please check the code and try again.';
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
            <span>Rooman Books</span>
          </div>

          <h2 className="auth-hero-title">Your books, simplified</h2>

          <p className="auth-hero-desc">
            Invoicing, GST-compliant billing, banking reconciliation, and real-time
            financial reports — all in one place.
          </p>

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
                <strong>256-bit Encrypted</strong>
                <span className="small text-muted">Bank-grade security</span>
              </div>
            </div>
            <div className="hero-metric-item">
              <Landmark size={18} color="#0284c7" />
              <div>
                <strong>Bank Reconciliation</strong>
                <span className="small text-muted">Match every transaction</span>
              </div>
            </div>
            <div className="hero-metric-item">
              <FileSpreadsheet size={18} color="#d97706" />
              <div>
                <strong>GST & E-Way Ready</strong>
                <span className="small text-muted">Full compliance</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Card: Glassmorphic Login Form */}
        <div className="auth-card auth-card-3d">
          <div className="auth-brand">
            <div className="auth-brand-glow">
              <img src="/rooman-logo.png" alt="" />
            </div>
            <div>
              <h1 className="auth-title">Rooman Books</h1>
              <span className="auth-edition-badge">Enterprise Edition</span>
            </div>
          </div>

          <p className="auth-subtitle">Sign in to your organization&apos;s books.</p>

          <form onSubmit={onSubmit} noValidate>
            {accountState ? <AccountStateNotice kind={accountState.kind} text={accountState.text} /> : <FormError message={error} />}

            <TextField
              label="Work email"
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
                Forgot password?
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
              Sign in
            </Button>
          </form>

          <p className="auth-footer">
            New to Rooman Books? <Link to="/register">Create an organization</Link>
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
              <span>Platform Admin Console &rarr;</span>
            </Link>
          </div>
        </div>
      </div>

      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Reset Password"
        subtitle={
          forgotStep === 'email'
            ? 'Enter your registered email address to receive a verification code.'
            : 'Enter the 6-digit verification code sent to your email and your new password.'
        }
        size="md"
      >
        {forgotStep === 'email' ? (
          <form onSubmit={handleSendResetCode} noValidate>
            <FormError message={forgotError} />
            <TextField
              label="Registered work email"
              type="email"
              required
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button type="button" variant="secondary" onClick={() => setForgotOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={sendingReset} disabled={!forgotEmail.trim()}>
                Send Reset Code
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
              label="6-digit verification code (OTP)"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={forgotOtp}
              onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />

            <div className="password-row" style={{ marginTop: '12px' }}>
              <TextField
                label="New password"
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
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div style={{ marginTop: '12px' }}>
              <TextField
                label="Confirm new password"
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
                ← Back to email
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button type="button" variant="secondary" onClick={() => setForgotOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={resettingPassword}
                  disabled={forgotOtp.length < 4 || !newPassword || !confirmPassword}
                >
                  Reset Password
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

