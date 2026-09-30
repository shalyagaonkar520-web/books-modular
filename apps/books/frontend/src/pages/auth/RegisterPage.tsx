import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Eye, EyeOff, LogIn, Mail, UserPlus } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { useAuth, type RegisterResult } from '@/auth/AuthContext';
import { authApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { useSubmit } from '@/hooks/useSubmit';

/**
 * Server-side rules, mirrored here so the user gets feedback before submitting.
 * Returns the app-content key of the problem, or null.
 */
function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'auth.register.password.tooShort';
  if (password === password.toLowerCase() || password === password.toUpperCase()) {
    return 'auth.register.password.mixedCase';
  }
  if (!/\d/.test(password)) return 'auth.register.password.digit';
  return null;
}

export function RegisterPage() {
  const { t, branding } = useAppContent();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { submitting, error, fieldErrors, run, setError } = useSubmit();

  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => searchParams.get('email') || localStorage.getItem('rooman_verified_email') || '');
  const [organizationName, setOrganizationName] = useState('');
  const [gstin, setGstin] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState<Extract<RegisterResult, { pending: true }> | null>(null);

  // Email verification state
  const [isVerified, setIsVerified] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const cooldownTimerRef = useRef<number | null>(null);

  const checkVerificationStatus = useCallback(async (emailToCheck: string) => {
    const clean = emailToCheck.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return;
    try {
      const res = await authApi.getEmailVerificationStatus(clean);
      if (res.verified) {
        setIsVerified(true);
        setVerificationSent(false);
        setVerificationNotice(null);
        setVerificationError(null);
        setOtp('');
      }
    } catch {
      // ignore status check failure
    }
  }, []);

  // Initial check on mount only
  useEffect(() => {
    const initialEmail = searchParams.get('email') || localStorage.getItem('rooman_verified_email') || '';
    if (initialEmail) {
      void checkVerificationStatus(initialEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cooldown timer tick
  useEffect(() => {
    if (cooldown <= 0) return;
    cooldownTimerRef.current = window.setTimeout(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [cooldown]);

  const handleSendVerification = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setVerificationError(null);

    if (!cleanEmail) {
      setVerificationError(t('auth.register.verify.error.emailRequired'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setVerificationError(t('auth.register.verify.error.emailInvalid'));
      return;
    }

    setSendingVerification(true);
    try {
      const res = await authApi.sendVerificationEmail(cleanEmail);
      setVerificationSent(true);
      setVerificationNotice(res.message || t('auth.register.verify.sent', { email: cleanEmail }));
      setCooldown(res.cooldownSeconds || res.cooldown_seconds || 60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.register.verify.error.sendFailed');
      setVerificationError(msg);
    } finally {
      setSendingVerification(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();
    setVerificationError(null);

    if (!cleanOtp) {
      setVerificationError(t('auth.register.verify.error.otpRequired'));
      return;
    }

    setVerifyingOtp(true);
    try {
      await authApi.verifyOtp(cleanEmail, cleanOtp);
      setIsVerified(true);
      setVerificationSent(false);
      setVerificationNotice(null);
      setVerificationError(null);
      setOtp('');
      localStorage.setItem('rooman_verified_email', cleanEmail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.register.verify.error.invalidOtp');
      setVerificationError(msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const onEmailChange = useCallback((newVal: string) => {
    setEmail(newVal);
    // Only reset verification state when something was actually set
    // This prevents unnecessary re-renders on every keystroke
    if (isVerified || verificationSent || verificationNotice || verificationError || otp) {
      setIsVerified(false);
      setVerificationSent(false);
      setVerificationNotice(null);
      setVerificationError(null);
      setOtp('');
    }
  }, [isVerified, verificationSent, verificationNotice, verificationError, otp]);

  const handleResetEmail = () => {
    setEmail('');
    setIsVerified(false);
    setVerificationSent(false);
    setVerificationNotice(null);
    setVerificationError(null);
    setOtp('');
    try {
      localStorage.removeItem('rooman_verified_email');
    } catch {
      // ignore
    }
  };

  const passwordProblemKey = touched ? passwordProblem(password) : null;
  const passwordHint = passwordProblemKey ? t(passwordProblemKey) : null;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);

    if (!isVerified) {
      setError(t('auth.register.error.verifyFirst'));
      return;
    }

    const problem = passwordProblem(password);
    if (problem) {
      setError(t('auth.register.error.passwordPrefix', { problem: t(problem) }));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.register.error.mismatch'));
      return;
    }
    const result = await run(async () => {
      const outcome = await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        organizationName: organizationName.trim(),
        gstin: gstin.trim() || undefined,
      });
      // Clear verified cache on success
      try {
        localStorage.removeItem('rooman_verified_email');
      } catch {
        // ignore
      }
      return outcome;
    });
    if (!result) return;
    if (result.pending) setSubmitted(result);
    else navigate('/dashboard', { replace: true });
  };

  if (submitted) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <img src={branding.logoUrl} alt="" />
            <h1 className="auth-title">{t('auth.register.pending.title')}</h1>
          </div>
          <div
            role="status"
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              padding: '12px 14px',
              borderRadius: '8px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              fontSize: '13px',
              lineHeight: 1.5,
              marginBottom: '14px',
            }}
          >
            <Clock size={18} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
            <div>
              <strong style={{ display: 'block', marginBottom: '2px' }}>{submitted.organizationName}</strong>
              <span>{submitted.message || t('auth.register.pending.body')}</span>
            </div>
          </div>
          <p className="auth-subtitle">
            {t('auth.register.pending.signInAsBefore')} <strong>{submitted.email}</strong> {t('auth.register.pending.signInAsAfter')}
          </p>
          <Link to="/login" state={{ email: submitted.email }} className="btn btn-primary btn-md btn-block">
            <LogIn size={15} aria-hidden="true" />
            <span>{t('auth.register.pending.back')}</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={branding.logoUrl} alt="" />
          <h1 className="auth-title">{t('auth.register.title')}</h1>
        </div>
        <p className="auth-subtitle">{t('auth.register.subtitle')}</p>

        <form onSubmit={onSubmit} noValidate>
          <FormError message={error} />

          <TextField
            label={t('auth.register.organizationName')}
            required
            value={organizationName}
            error={fieldErrors.organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
          />
          <TextField
            label={t('auth.register.gstin')}
            hint={t('auth.register.gstinHint')}
            value={gstin}
            error={fieldErrors.gstin}
            onChange={(event) => setGstin(event.target.value.toUpperCase())}
          />
          <TextField label={t('auth.register.yourName')} required value={name} error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />

          {/* Work Email with inline OTP verification */}
          <div style={{ marginBottom: '14px' }}>
            <TextField
              label={t('auth.register.email')}
              type="email"
              autoComplete="email"
              required
              value={email}
              placeholder={t('auth.register.emailPlaceholder')}
              error={verificationError || fieldErrors.email}
              onChange={(event) => onEmailChange(event.target.value)}
            />

            {isVerified ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#059669', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={14} /> {t('auth.register.verify.verifiedBadge')}
                </span>
                <span style={{ fontSize: '12px', color: '#059669', fontWeight: 500 }}>
                  {t('auth.register.verify.verifiedEmail', { email })}
                </span>
                <button
                  type="button"
                  onClick={handleResetEmail}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  {t('auth.register.verify.changeEmail')}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-6px', marginBottom: '8px' }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={sendingVerification}
                  disabled={!email.trim() || cooldown > 0}
                  onClick={handleSendVerification}
                >
                  {cooldown > 0 ? t('auth.register.verify.resendIn', { seconds: cooldown }) : verificationSent ? t('auth.register.verify.resendOtp') : t('auth.register.verify.sendOtp')}
                </Button>
              </div>
            )}

            {!isVerified && !verificationSent && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: '#fffbeb',
                  border: '1px solid #fef3c7',
                  color: '#92400e',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>{t('auth.register.error.verifyFirst')}</span>
              </div>
            )}

            {/* OTP Input Card */}
            {verificationSent && !isVerified && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label htmlFor="otp-input" style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    {t('auth.register.verify.otpLabel')}
                  </label>
                  {cooldown > 0 ? (
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{t('auth.register.verify.resendIn', { seconds: cooldown })}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendVerification}
                      disabled={sendingVerification}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {t('auth.register.verify.resendCode')}
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    id="otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder={t('auth.register.verify.otpPlaceholder')}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (otp.trim().length >= 4) {
                          void handleVerifyOtp();
                        }
                      }
                    }}
                    className="input"
                    style={{
                      flex: 1,
                      letterSpacing: '4px',
                      fontSize: '16px',
                      fontWeight: 600,
                      textAlign: 'center',
                    }}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    loading={verifyingOtp}
                    disabled={otp.trim().length < 4}
                    onClick={handleVerifyOtp}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {t('auth.register.verify.verifyOtp')}
                  </Button>
                </div>
              </div>
            )}

            {verificationNotice && !isVerified && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: '12px',
                }}
              >
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail size={14} /> {verificationNotice}
                </div>
              </div>
            )}
          </div>

          <div className="password-row">
            <TextField
              label={t('auth.register.password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              error={passwordHint ?? fieldErrors.password}
              hint={passwordHint ? undefined : t('auth.register.passwordHint')}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => setTouched(true)}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? t('auth.register.hidePassword') : t('auth.register.showPassword')}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <TextField
            label={t('auth.register.confirmPassword')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            error={confirm && confirm !== password ? t('auth.register.mismatchInline') : undefined}
            onChange={(event) => setConfirm(event.target.value)}
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={!isVerified}
            icon={<UserPlus size={15} />}
            className="btn-block"
            title={!isVerified ? t('auth.register.submitTooltip') : undefined}
          >
            {t('auth.register.submit')}
          </Button>
        </form>

        <p className="auth-footer">
          {t('auth.register.haveAccount')} <Link to="/login">{t('auth.register.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
