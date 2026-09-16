import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Mail, UserPlus } from 'lucide-react';

import { useAuth } from '@/auth/AuthContext';
import { authApi } from '@/api/endpoints';
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

  // Email verification state
  const [isVerified, setIsVerified] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const cooldownTimerRef = useRef<number | null>(null);

  const checkVerificationStatus = useCallback(async (emailToCheck: string) => {
    const clean = emailToCheck.trim().toLowerCase();
    if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return;
    try {
      const res = await authApi.getEmailVerificationStatus(clean);
      if (res.isVerified) {
        setIsVerified(true);
        setVerificationSent(false);
        setVerificationNotice(null);
        setVerificationError(null);
        setOtp('');
        setDevOtp(null);
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
      setVerificationError('Please enter your email address first.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setVerificationError('Please enter a valid email address.');
      return;
    }

    setSendingVerification(true);
    try {
      const res = await authApi.sendVerificationEmail(cleanEmail);
      setVerificationSent(true);
      setVerificationNotice(res.message || `Verification code sent to ${cleanEmail}`);
      if (res.dev_otp) {
        setDevOtp(res.dev_otp);
      }
      setCooldown(res.cooldownSeconds || res.cooldown_seconds || 60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send verification code. Please try again.';
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
      setVerificationError('Please enter the 6-digit verification code.');
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
      setDevOtp(null);
      localStorage.setItem('rooman_verified_email', cleanEmail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid verification code. Please try again.';
      setVerificationError(msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  const onEmailChange = useCallback((newVal: string) => {
    setEmail(newVal);
    // Only reset verification state when something was actually set
    // This prevents unnecessary re-renders on every keystroke
    if (isVerified || verificationSent || verificationNotice || verificationError || otp || devOtp) {
      setIsVerified(false);
      setVerificationSent(false);
      setVerificationNotice(null);
      setVerificationError(null);
      setOtp('');
      setDevOtp(null);
    }
  }, [isVerified, verificationSent, verificationNotice, verificationError, otp, devOtp]);

  const handleResetEmail = () => {
    setEmail('');
    setIsVerified(false);
    setVerificationSent(false);
    setVerificationNotice(null);
    setVerificationError(null);
    setOtp('');
    setDevOtp(null);
    try {
      localStorage.removeItem('rooman_verified_email');
    } catch {
      // ignore
    }
  };

  const passwordHint = touched ? passwordProblem(password) : null;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);

    if (!isVerified) {
      setError('Please verify your email address before creating your organization.');
      return;
    }

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
      return true;
    });
    if (result) navigate('/dashboard', { replace: true });
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
          />
          <TextField
            label="GSTIN"
            hint="Optional. You can add it later in settings."
            value={gstin}
            error={fieldErrors.gstin}
            onChange={(event) => setGstin(event.target.value.toUpperCase())}
          />
          <TextField label="Your name" required value={name} error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />

          {/* Work Email with inline OTP verification */}
          <div style={{ marginBottom: '14px' }}>
            <TextField
              label="Work email"
              type="email"
              autoComplete="email"
              required
              value={email}
              placeholder="user@gmail.com"
              error={verificationError || fieldErrors.email}
              onChange={(event) => onEmailChange(event.target.value)}
            />

            {isVerified ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '12.5px', color: '#059669', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={14} /> ✓ Verified
                </span>
                <span style={{ fontSize: '12px', color: '#059669', fontWeight: 500 }}>
                  ✓ {email} is verified
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
                  Change email
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
                  {cooldown > 0 ? `Resend in ${cooldown}s` : verificationSent ? 'Resend OTP' : 'Send OTP'}
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
                <span>Please verify your email address before creating your organization.</span>
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
                    Enter 6-digit OTP code
                  </label>
                  {cooldown > 0 ? (
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Resend in {cooldown}s</span>
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
                      Resend code
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
                    placeholder="123456"
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
                    Verify OTP
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

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={!isVerified}
            icon={<UserPlus size={15} />}
            className="btn-block"
            title={!isVerified ? 'Please verify your email address before creating your organization' : undefined}
          >
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
