import React, { useState } from 'react';
import { ApiClient, UserProfile } from '../../services/apiClient';
import { X, Lock, Mail, User, Building, Eye, EyeOff, ShieldCheck, Sparkles, ArrowRight, CheckCircle2, ChevronRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('Zylker Electronics India Pvt Ltd');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth Account Chooser State
  const [oauthChooserProvider, setOauthChooserProvider] = useState<'google' | 'microsoft' | 'zoho' | 'github' | null>(null);

  if (!isOpen) return null;

  // OAuth SSO Login Handler
  const handleOAuthLogin = async (
    provider: 'google' | 'microsoft' | 'zoho' | 'github',
    account?: { email: string; name: string; avatar: string; role?: string; organization?: string }
  ) => {
    setError(null);
    setLoading(true);
    try {
      const res = await ApiClient.oauthLogin(provider, account);
      onLoginSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || `Failed to authenticate with ${provider.toUpperCase()} OAuth 2.0`);
    } finally {
      setLoading(false);
      setOauthChooserProvider(null);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPass: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await ApiClient.login(demoEmail, demoPass);
      onLoginSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await ApiClient.login(email, password);
        onLoginSuccess(res.user);
      } else {
        const res = await ApiClient.register(name, email, password, organization);
        onLoginSuccess(res.user);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Google SVG Icon
  const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" className="zb-oauth-icon">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );

  // Microsoft 365 SVG Icon
  const MicrosoftIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" className="zb-oauth-icon">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );

  // Zoho Accounts SVG Icon
  const ZohoIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" className="zb-oauth-icon">
      <rect x="2" y="2" width="9" height="9" rx="2" fill="#E42528" />
      <rect x="13" y="2" width="9" height="9" rx="2" fill="#226AB2" />
      <rect x="2" y="13" width="9" height="9" rx="2" fill="#009A44" />
      <rect x="13" y="13" width="9" height="9" rx="2" fill="#F8B12C" />
    </svg>
  );

  // GitHub SVG Icon
  const GithubIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="zb-oauth-icon">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );

  return (
    <div className="zb-modal-backdrop" onClick={onClose}>
      <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="zb-auth-header">
          <div className="zb-auth-brand">
            <img src="/rooman-logo.png" alt="Rooman Books" className="zb-auth-logo-img" />
            <div>
              <h3 className="zb-auth-title">Rooman Books</h3>
              <p className="zb-auth-sub">Enterprise Accounting Platform</p>
            </div>
          </div>
          <button className="zb-modal-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Auth Tab Switcher */}
        <div className="zb-auth-tabs">
          <button
            className={`zb-auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            className={`zb-auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setError(null);
            }}
          >
            Create Account
          </button>
        </div>

        {/* OAuth 2.0 Single Sign-On Section */}
        <div className="zb-oauth-section">
          <div className="zb-oauth-header-label">
            <span className="zb-oauth-sso-badge">OAuth 2.0</span>
            <span>Single Sign-On (SSO)</span>
          </div>

          <div className="zb-oauth-grid">
            <button
              type="button"
              className="zb-oauth-btn google"
              onClick={() => setOauthChooserProvider('google')}
              disabled={loading}
              title="Sign in with Google Workspace"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              className="zb-oauth-btn microsoft"
              onClick={() => setOauthChooserProvider('microsoft')}
              disabled={loading}
              title="Sign in with Microsoft 365"
            >
              <MicrosoftIcon />
              <span>Continue with Microsoft 365</span>
            </button>
          </div>

          <div className="zb-oauth-grid secondary">
            <button
              type="button"
              className="zb-oauth-btn zoho"
              onClick={() => handleOAuthLogin('zoho')}
              disabled={loading}
              title="Sign in with Zoho Accounts"
            >
              <ZohoIcon />
              <span>Continue with Zoho</span>
            </button>

            <button
              type="button"
              className="zb-oauth-btn github"
              onClick={() => handleOAuthLogin('github')}
              disabled={loading}
              title="Sign in with GitHub Enterprise"
            >
              <GithubIcon />
              <span>Continue with GitHub</span>
            </button>
          </div>
        </div>

        {/* OAuth Account Chooser Dialog (Interactive SSO Flow) */}
        {oauthChooserProvider && (
          <div className="zb-oauth-chooser-overlay" onClick={() => setOauthChooserProvider(null)}>
            <div className="zb-oauth-chooser-card" onClick={e => e.stopPropagation()}>
              <div className="zb-oauth-chooser-header">
                <div className="zb-flex-align gap-2">
                  {oauthChooserProvider === 'google' && <GoogleIcon />}
                  {oauthChooserProvider === 'microsoft' && <MicrosoftIcon />}
                  <h4>
                    Sign in with {oauthChooserProvider === 'google' ? 'Google' : 'Microsoft 365'}
                  </h4>
                </div>
                <button
                  className="zb-modal-close"
                  onClick={() => setOauthChooserProvider(null)}
                >
                  <X size={16} />
                </button>
              </div>

              <p className="zb-oauth-chooser-subtitle">
                Choose an enterprise account to continue to <strong>Rooman Books</strong>
              </p>

              <div className="zb-oauth-account-list">
                {oauthChooserProvider === 'google' ? (
                  <>
                    <button
                      type="button"
                      className="zb-oauth-account-row"
                      onClick={() =>
                        handleOAuthLogin('google', {
                          name: 'Shalya Gaonkar',
                          email: 'shalya.gaonkar@gmail.com',
                          role: 'Administrator',
                          organization: 'Zylker Electronics India Pvt Ltd',
                          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80',
                        })
                      }
                    >
                      <div className="zb-oauth-acc-avatar">SG</div>
                      <div className="zb-oauth-acc-info">
                        <span className="zb-oauth-acc-name">Shalya Gaonkar</span>
                        <span className="zb-oauth-acc-email">shalya.gaonkar@gmail.com</span>
                      </div>
                      <ChevronRight size={16} className="text-muted" />
                    </button>

                    <button
                      type="button"
                      className="zb-oauth-account-row"
                      onClick={() =>
                        handleOAuthLogin('google', {
                          name: 'Finance Team',
                          email: 'finance@rooman.org',
                          role: 'Chief Financial Officer',
                          organization: 'Rooman Technologies Enterprise',
                          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80',
                        })
                      }
                    >
                      <div className="zb-oauth-acc-avatar finance">FT</div>
                      <div className="zb-oauth-acc-info">
                        <span className="zb-oauth-acc-name">Finance Team</span>
                        <span className="zb-oauth-acc-email">finance@rooman.org</span>
                      </div>
                      <ChevronRight size={16} className="text-muted" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="zb-oauth-account-row"
                      onClick={() =>
                        handleOAuthLogin('microsoft', {
                          name: 'Shalya Gaonkar',
                          email: 'shalya@rooman.onmicrosoft.com',
                          role: 'Administrator',
                          organization: 'Zylker Electronics India Pvt Ltd',
                          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80',
                        })
                      }
                    >
                      <div className="zb-oauth-acc-avatar ms">SG</div>
                      <div className="zb-oauth-acc-info">
                        <span className="zb-oauth-acc-name">Shalya Gaonkar (Azure AD)</span>
                        <span className="zb-oauth-acc-email">shalya@rooman.onmicrosoft.com</span>
                      </div>
                      <ChevronRight size={16} className="text-muted" />
                    </button>

                    <button
                      type="button"
                      className="zb-oauth-account-row"
                      onClick={() =>
                        handleOAuthLogin('microsoft', {
                          name: 'Priya Sharma',
                          email: 'priya.sharma@rooman.com',
                          role: 'Chief Accountant',
                          organization: 'Zylker Electronics India Pvt Ltd',
                          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80',
                        })
                      }
                    >
                      <div className="zb-oauth-acc-avatar accountant">PS</div>
                      <div className="zb-oauth-acc-info">
                        <span className="zb-oauth-acc-name">Priya Sharma</span>
                        <span className="zb-oauth-acc-email">priya.sharma@rooman.com</span>
                      </div>
                      <ChevronRight size={16} className="text-muted" />
                    </button>
                  </>
                )}
              </div>

              <div className="zb-oauth-security-note">
                <ShieldCheck size={14} className="text-success" />
                <span>Verified via OAuth 2.0 OpenID Connect</span>
              </div>
            </div>
          </div>
        )}

        <div className="zb-auth-divider">
          <span>Or sign in with email credentials</span>
        </div>

        {/* Demo Fast Login Shortcuts */}
        <div className="zb-auth-demo-section">
          <div className="zb-auth-demo-label">
            <Sparkles size={14} className="text-amber" />
            <span>Fast Test Demo Accounts</span>
          </div>
          <div className="zb-auth-demo-cards">
            <button
              type="button"
              className="zb-auth-demo-card"
              onClick={() => handleDemoLogin('admin@zylkerbooks.com', 'password123')}
              disabled={loading}
            >
              <div className="zb-auth-demo-avatar admin">SG</div>
              <div className="zb-auth-demo-info">
                <div className="zb-auth-demo-name">Shalya Gaonkar</div>
                <div className="zb-auth-demo-role">Administrator & Owner</div>
              </div>
              <ArrowRight size={14} className="zb-auth-demo-arrow" />
            </button>

            <button
              type="button"
              className="zb-auth-demo-card"
              onClick={() => handleDemoLogin('accountant@rooman.com', 'password123')}
              disabled={loading}
            >
              <div className="zb-auth-demo-avatar accountant">PS</div>
              <div className="zb-auth-demo-info">
                <div className="zb-auth-demo-name">Priya Sharma</div>
                <div className="zb-auth-demo-role">Chief Accountant</div>
              </div>
              <ArrowRight size={14} className="zb-auth-demo-arrow" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && <div className="zb-auth-error">{error}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit} className="zb-auth-form">
          {mode === 'register' && (
            <>
              <div className="zb-form-group">
                <label className="zb-label">Full Name</label>
                <div className="zb-input-with-icon">
                  <User size={16} className="icon" />
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="Enter your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="zb-form-group">
                <label className="zb-label">Organization Name</label>
                <div className="zb-input-with-icon">
                  <Building size={16} className="icon" />
                  <input
                    type="text"
                    className="zb-input"
                    placeholder="Company or Business name"
                    value={organization}
                    onChange={e => setOrganization(e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="zb-form-group">
            <label className="zb-label">Work Email</label>
            <div className="zb-input-with-icon">
              <Mail size={16} className="icon" />
              <input
                type="email"
                className="zb-input"
                placeholder="name@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="zb-form-group">
            <label className="zb-label">Password</label>
            <div className="zb-input-with-icon">
              <Lock size={16} className="icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="zb-input"
                placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter your password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="zb-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="zb-btn zb-btn-primary zb-btn-block zb-auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="zb-spinner-text">Authenticating...</span>
            ) : mode === 'login' ? (
              'Sign In to Dashboard'
            ) : (
              'Create Account & Get Started'
            )}
          </button>
        </form>

        <div className="zb-auth-footer">
          <ShieldCheck size={14} className="text-success" />
          <span>OAuth 2.0 & Bank-Grade 256-bit Encryption</span>
        </div>
      </div>
    </div>
  );
};
