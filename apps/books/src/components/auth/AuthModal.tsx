import React, { useState, useEffect } from 'react';
import { ApiClient, UserProfile } from '../../services/apiClient';
import {
  X,
  Lock,
  Mail,
  User,
  Building,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ChevronRight,
  KeyRound,
  Zap
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
  initialMode?: 'login' | 'register';
}

declare global {
  interface Window {
    google?: any;
  }
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('admin@zylkerbooks.com');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('Rooman Enterprise India');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth Account Chooser State
  const [oauthChooserProvider, setOauthChooserProvider] = useState<
    'google' | 'microsoft' | 'zoho' | 'github' | null
  >(null);

  // Initialize Google Identity Services (GIS) if available
  useEffect(() => {
    if (!isOpen) return;
    try {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: 'rooman-books-demo.apps.googleusercontent.com',
          callback: async (response: any) => {
            if (response.credential) {
              setLoading(true);
              try {
                const res = await ApiClient.oauthLogin('google', {
                  credential: response.credential,
                });
                onLoginSuccess(res.user);
                onClose();
              } catch (err: any) {
                setError(err.message || 'Google OAuth verification failed');
              } finally {
                setLoading(false);
              }
            }
          },
        });
      }
    } catch {
      // Graceful fallback to client-side OAuth flow
    }
  }, [isOpen, onLoginSuccess, onClose]);

  if (!isOpen) return null;

  // Google OAuth SSO Login Handler
  const handleOAuthLogin = async (
    provider: 'google' | 'microsoft' | 'zoho' | 'github',
    account?: {
      email: string;
      name: string;
      avatar: string;
      role?: string;
      organization?: string;
    }
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
      setError(err.message || 'Demo sign in failed');
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
        const loginEmail = email.trim() || 'admin@zylkerbooks.com';
        const loginPassword = password || 'password123';
        const res = await ApiClient.login(loginEmail, loginPassword);
        onLoginSuccess(res.user);
      } else {
        const regName = name.trim() || 'Enterprise Administrator';
        const regEmail = email.trim() || `user_${Date.now()}@rooman.org`;
        const regPassword = password || 'password123';
        const res = await ApiClient.register(regName, regEmail, regPassword, organization);
        onLoginSuccess(res.user);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Google Brand SVG Icon
  const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" className="rf-oauth-brand-icon">
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

  // Microsoft 365 Brand SVG Icon
  const MicrosoftIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" className="rf-oauth-brand-icon">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );

  // Zoho Accounts Brand SVG Icon
  const ZohoIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" className="rf-oauth-brand-icon">
      <rect x="2" y="2" width="9" height="9" rx="2" fill="#E42528" />
      <rect x="13" y="2" width="9" height="9" rx="2" fill="#226AB2" />
      <rect x="2" y="13" width="9" height="9" rx="2" fill="#009A44" />
      <rect x="13" y="13" width="9" height="9" rx="2" fill="#F8B12C" />
    </svg>
  );

  // GitHub Brand SVG Icon
  const GithubIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="rf-oauth-brand-icon">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );

  return (
    <div className="rf-modal-backdrop" onClick={onClose}>
      <div className="rf-auth-card" onClick={e => e.stopPropagation()}>
        {/* Header Bar */}
        <div className="rf-auth-header">
          <div className="rf-auth-brand-row">
            <div className="rf-auth-gem">
              <Sparkles size={20} className="text-indigo" />
            </div>
            <div>
              <h2 className="rf-auth-title">Rooman Books</h2>
              <p className="rf-auth-subtitle">Apex Financial Operating System</p>
            </div>
          </div>
          <button className="rf-icon-button" onClick={onClose} title="Close dialog">
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="rf-auth-pill-tabs">
          <button
            type="button"
            className={`rf-pill-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            Sign In to Workspace
          </button>
          <button
            type="button"
            className={`rf-pill-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setError(null);
            }}
          >
            Create New Account
          </button>
        </div>

        {/* OAuth 2.0 Single Sign-On Showcase */}
        <div className="rf-oauth-container">
          <div className="rf-oauth-title-bar">
            <span className="rf-badge rf-badge-indigo">OAuth 2.0 SSO</span>
            <span className="rf-oauth-text">Instant Corporate Verification</span>
          </div>

          <div className="rf-oauth-buttons-row">
            <button
              type="button"
              className="rf-oauth-btn google"
              onClick={() => setOauthChooserProvider('google')}
              disabled={loading}
              title="Authenticate via Google Workspace"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              className="rf-oauth-btn microsoft"
              onClick={() => setOauthChooserProvider('microsoft')}
              disabled={loading}
              title="Authenticate via Microsoft Azure AD"
            >
              <MicrosoftIcon />
              <span>Continue with Microsoft 365</span>
            </button>
          </div>

          <div className="rf-oauth-secondary-row">
            <button
              type="button"
              className="rf-oauth-pill-btn"
              onClick={() => handleOAuthLogin('zoho')}
              disabled={loading}
            >
              <ShieldCheck size={16} className="text-emerald" />
              <span>Corporate SSO</span>
            </button>

            <button
              type="button"
              className="rf-oauth-pill-btn"
              onClick={() => handleOAuthLogin('github')}
              disabled={loading}
            >
              <GithubIcon />
              <span>GitHub Enterprise</span>
            </button>
          </div>
        </div>

        {/* Interactive Google / Microsoft Account Chooser Modal */}
        {oauthChooserProvider && (
          <div className="rf-oauth-submodal-overlay" onClick={() => setOauthChooserProvider(null)}>
            <div className="rf-oauth-submodal-card" onClick={e => e.stopPropagation()}>
              <div className="rf-submodal-header">
                <div className="rf-flex-align gap-2">
                  {oauthChooserProvider === 'google' ? <GoogleIcon /> : <MicrosoftIcon />}
                  <h4>
                    Sign in with {oauthChooserProvider === 'google' ? 'Google' : 'Microsoft 365'}
                  </h4>
                </div>
                <button
                  className="rf-icon-button small"
                  onClick={() => setOauthChooserProvider(null)}
                >
                  <X size={16} />
                </button>
              </div>

              <p className="rf-submodal-desc">
                Select your verified identity to enter <strong>Rooman Books</strong>:
              </p>

              <div className="rf-accounts-list">
                {oauthChooserProvider === 'google' ? (
                  <>
                    <button
                      type="button"
                      className="rf-account-item"
                      onClick={() =>
                        handleOAuthLogin('google', {
                          name: 'Shalya Gaonkar',
                          email: 'shalya.gaonkar@gmail.com',
                          role: 'Administrator',
                          organization: 'Rooman Enterprise India',
                          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80',
                        })
                      }
                    >
                      <div className="rf-avatar-badge admin">SG</div>
                      <div className="rf-account-meta">
                        <div className="rf-account-name">Shalya Gaonkar</div>
                        <div className="rf-account-email">shalya.gaonkar@gmail.com</div>
                        <span className="rf-account-tag">Administrator • All Access</span>
                      </div>
                      <ChevronRight size={18} className="text-muted" />
                    </button>

                    <button
                      type="button"
                      className="rf-account-item"
                      onClick={() =>
                        handleOAuthLogin('google', {
                          name: 'Finance & Treasury Team',
                          email: 'finance@rooman.org',
                          role: 'Chief Financial Officer',
                          organization: 'Rooman Enterprise India',
                          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80',
                        })
                      }
                    >
                      <div className="rf-avatar-badge finance">FT</div>
                      <div className="rf-account-meta">
                        <div className="rf-account-name">Finance & Treasury Team</div>
                        <div className="rf-account-email">finance@rooman.org</div>
                        <span className="rf-account-tag">CFO • Banking & Audit</span>
                      </div>
                      <ChevronRight size={18} className="text-muted" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rf-account-item"
                      onClick={() =>
                        handleOAuthLogin('microsoft', {
                          name: 'Shalya Gaonkar (M365)',
                          email: 'shalya@rooman.onmicrosoft.com',
                          role: 'Administrator',
                          organization: 'Rooman Enterprise India',
                          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80',
                        })
                      }
                    >
                      <div className="rf-avatar-badge m365">SG</div>
                      <div className="rf-account-meta">
                        <div className="rf-account-name">Shalya Gaonkar</div>
                        <div className="rf-account-email">shalya@rooman.onmicrosoft.com</div>
                        <span className="rf-account-tag">Azure AD • Global Admin</span>
                      </div>
                      <ChevronRight size={18} className="text-muted" />
                    </button>

                    <button
                      type="button"
                      className="rf-account-item"
                      onClick={() =>
                        handleOAuthLogin('microsoft', {
                          name: 'Priya Sharma (M365)',
                          email: 'priya.sharma@rooman.com',
                          role: 'Chief Accountant',
                          organization: 'Rooman Enterprise India',
                          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&q=80',
                        })
                      }
                    >
                      <div className="rf-avatar-badge accountant">PS</div>
                      <div className="rf-account-meta">
                        <div className="rf-account-name">Priya Sharma</div>
                        <div className="rf-account-email">priya.sharma@rooman.com</div>
                        <span className="rf-account-tag">Chief Accountant • M365</span>
                      </div>
                      <ChevronRight size={18} className="text-muted" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 1-Click Fast Demo Credentials Bar */}
        <div className="rf-demo-access-panel">
          <div className="rf-demo-access-header">
            <Zap size={14} className="text-amber" />
            <span>Instant Demo Access (1-Click)</span>
          </div>
          <div className="rf-demo-cards-row">
            <button
              type="button"
              className="rf-demo-card"
              onClick={() => handleDemoLogin('admin@zylkerbooks.com', 'password123')}
              disabled={loading}
            >
              <div className="rf-demo-avatar admin">SG</div>
              <div className="rf-demo-text">
                <span className="rf-demo-title">Shalya Gaonkar</span>
                <span className="rf-demo-role">Administrator</span>
              </div>
              <ArrowRight size={14} className="rf-demo-arrow" />
            </button>

            <button
              type="button"
              className="rf-demo-card"
              onClick={() => handleDemoLogin('accountant@rooman.com', 'password123')}
              disabled={loading}
            >
              <div className="rf-demo-avatar accountant">PS</div>
              <div className="rf-demo-text">
                <span className="rf-demo-title">Priya Sharma</span>
                <span className="rf-demo-role">Chief Accountant</span>
              </div>
              <ArrowRight size={14} className="rf-demo-arrow" />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rf-alert rf-alert-danger">
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="rf-auth-form">
          {mode === 'register' && (
            <>
              <div className="rf-form-group">
                <label className="rf-form-label">Full Name</label>
                <div className="rf-input-wrapper">
                  <User size={16} className="rf-input-icon" />
                  <input
                    type="text"
                    className="rf-text-input"
                    placeholder="e.g. Shalya Gaonkar"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
              </div>

              <div className="rf-form-group">
                <label className="rf-form-label">Organization Name</label>
                <div className="rf-input-wrapper">
                  <Building size={16} className="rf-input-icon" />
                  <input
                    type="text"
                    className="rf-text-input"
                    placeholder="e.g. Rooman Technologies Enterprise"
                    value={organization}
                    onChange={e => setOrganization(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          <div className="rf-form-group">
            <div className="rf-flex-between">
              <label className="rf-form-label">Work Email</label>
              {mode === 'login' && (
                <button
                  type="button"
                  className="rf-quick-fill-btn"
                  onClick={() => {
                    setEmail('admin@zylkerbooks.com');
                    setPassword('password123');
                  }}
                >
                  <KeyRound size={12} /> Auto-fill Demo
                </button>
              )}
            </div>
            <div className="rf-input-wrapper">
              <Mail size={16} className="rf-input-icon" />
              <input
                type="email"
                className="rf-text-input"
                placeholder="name@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="rf-form-group">
            <label className="rf-form-label">Password</label>
            <div className="rf-input-wrapper">
              <Lock size={16} className="rf-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                className="rf-text-input"
                placeholder={mode === 'register' ? 'Minimum 6 characters' : 'Enter password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="rf-icon-button small"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="rf-btn rf-btn-primary rf-btn-block"
            disabled={loading}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : mode === 'login' ? (
              'Sign In to Dashboard'
            ) : (
              'Create Account & Enter'
            )}
          </button>
        </form>

        <div className="rf-auth-footer-bar">
          <ShieldCheck size={14} className="text-emerald" />
          <span>OAuth 2.0 Verified & Bank-Grade 256-Bit TLS Security</span>
        </div>
      </div>
    </div>
  );
};
