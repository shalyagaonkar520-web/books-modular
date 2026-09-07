import React, { useState } from 'react';
import { ApiClient, UserProfile, DemoUser } from '../../services/apiClient';
import { X, Lock, Mail, User, Building, Eye, EyeOff, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';

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

  if (!isOpen) return null;

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

  return (
    <div className="zb-modal-backdrop" onClick={onClose}>
      <div className="zb-auth-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="zb-auth-header">
          <div className="zb-auth-brand">
            <div className="zb-auth-logo">📚</div>
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

        {/* Demo Fast Login Shortcuts */}
        <div className="zb-auth-demo-section">
          <div className="zb-auth-demo-label">
            <Sparkles size={14} className="text-amber" />
            <span>1-Click Fast Demo Login</span>
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

        <div className="zb-auth-divider">
          <span>Or continue with email</span>
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
          <span>256-bit encrypted bank-grade security</span>
        </div>
      </div>
    </div>
  );
};
