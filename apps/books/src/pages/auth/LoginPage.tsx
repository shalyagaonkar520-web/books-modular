import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookMarked,
  BookOpen,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Landmark,
  LogIn,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

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
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true });
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
        </div>
      </div>
    </div>
  );
}

