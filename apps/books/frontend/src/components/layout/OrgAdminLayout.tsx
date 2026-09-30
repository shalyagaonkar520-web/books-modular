import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, LayoutDashboard, LayoutTemplate, LogOut, Menu, Settings, ShieldCheck, Users } from 'lucide-react';

import { useOrgPanelAuth } from '@/auth/OrgPanelAuthContext';
import { ChangePasswordModal } from '@/pages/platform/ChangePasswordModal';
import { initials } from '@/utils/format';

const NAV_LINKS = [
  { to: '/org-admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/org-admin/users', label: 'Users', icon: Users, end: false },
  { to: '/org-admin/app-content', label: 'App content', icon: LayoutTemplate, end: false },
  { to: '/org-admin/settings', label: 'Settings', icon: Settings, end: false },
];

/** The organization admin panel shell: same look as the platform console, scoped to one organization. */
export function OrgAdminLayout() {
  const { admin, organization, logout, changePassword } = useOrgPanelAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <header
        className="app-header"
        style={{ background: '#0f172a', borderBottom: '1px solid #1e293b', color: '#e2e8f0' }}
      >
        <div className="header-left">
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle navigation"
            style={{ color: '#e2e8f0' }}
          >
            <Menu size={19} />
          </button>
          <div className="brand" style={{ color: '#e2e8f0' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #2563eb)',
                color: '#ffffff',
              }}
            >
              <ShieldCheck size={17} />
            </span>
            <span className="brand-text">
              <strong style={{ color: '#f8fafc' }}>Organization Admin</strong>
              <small style={{ color: '#94a3b8' }}>{organization?.name ?? 'Your organization'}</small>
            </span>
          </div>
        </div>

        <div className="header-right" style={{ gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="avatar"
              style={{ background: '#312e81', color: '#e0e7ff' }}
              aria-hidden="true"
            >
              {initials(admin?.name ?? admin?.email ?? 'OA')}
            </span>
            <span
              style={{ fontSize: 13, color: '#cbd5e1', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={admin?.email}
            >
              {admin?.name}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setChangingPassword(true)}
            title="Change password"
            style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}
          >
            <KeyRound size={14} />
            <span>Change password</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void logout().then(() => navigate('/org-admin/login', { replace: true }))}
            style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}
          >
            <LogOut size={14} />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {changingPassword ? (
        <ChangePasswordModal
          onClose={() => setChangingPassword(false)}
          onSubmit={changePassword}
          subtitle="Update the password for your admin panel login."
        />
      ) : null}

      <div className="app-body">
        {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" /> : null}
        <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Organization admin navigation">
          <nav className="sidebar-nav">
            {NAV_LINKS.map((entry) => (
              <NavLink
                key={entry.to}
                to={entry.to}
                end={entry.end}
                className="nav-link"
                onClick={() => setSidebarOpen(false)}
              >
                <entry.icon size={17} aria-hidden="true" />
                <span>{entry.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="app-main" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
