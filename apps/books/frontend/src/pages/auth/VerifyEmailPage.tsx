import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

import { authApi } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setErrorMessage('No verification token provided. Please check the link from your email.');
      return;
    }

    let active = true;
    authApi
      .verifyEmail(token)
      .then((res) => {
        if (!active) return;
        setVerified(true);
        setVerifiedEmail(res.email);
        // Persist verified email so returning to register page latches on it
        try {
          localStorage.setItem('rooman_verified_email', res.email);
        } catch {
          // ignore localStorage failure
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Verification link is invalid or has expired.';
        setErrorMessage(msg);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-brand" style={{ justifyContent: 'center' }}>
          <img src="/rooman-logo.png" alt="" />
          <span className="auth-title">Rooman Books</span>
        </div>

        {loading && (
          <div style={{ padding: '32px 0' }}>
            <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 16px', color: '#0ea5e9' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Verifying your email...</h2>
            <p className="auth-subtitle" style={{ marginTop: 8 }}>Please wait while we validate your verification token.</p>
          </div>
        )}

        {!loading && verified && (
          <div style={{ padding: '16px 0' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#ecfdf5',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '1px solid #a7f3d0',
              }}
            >
              <CheckCircle2 size={32} />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#065f46', marginBottom: 8 }}>
              Email Verified ✓
            </h2>

            {verifiedEmail && (
              <p
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#1e293b',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  display: 'inline-block',
                  margin: '8px 0 16px',
                  wordBreak: 'break-all',
                }}
              >
                {verifiedEmail}
              </p>
            )}

            <p className="auth-subtitle" style={{ marginBottom: 24 }}>
              Your email has been successfully verified. You can now return to organization setup and complete your registration.
            </p>

            <Link to={verifiedEmail ? `/register?email=${encodeURIComponent(verifiedEmail)}` : '/register'}>
              <Button variant="primary" size="md" className="btn-block" icon={<ArrowRight size={16} />}>
                Continue to Organization Setup
              </Button>
            </Link>
          </div>
        )}

        {!loading && !verified && (
          <div style={{ padding: '16px 0' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#fef2f2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '1px solid #fecaca',
              }}
            >
              <AlertCircle size={32} />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>
              Verification Failed
            </h2>

            <p className="auth-subtitle" style={{ color: '#b91c1c', marginBottom: 24 }}>
              {errorMessage || 'Verification link is invalid or has expired.'}
            </p>

            <Link to="/register">
              <Button variant="secondary" size="md" className="btn-block">
                Back to Organization Setup
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
