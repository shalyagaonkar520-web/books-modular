import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';

import { platformApi } from '@/api/platform';
import { usePlatformAuth } from '@/auth/PlatformAuthContext';
import { initials } from '@/utils/format';

import { ChangePasswordModal } from '@/pages/platform/ChangePasswordModal';
import { ORG_APPROVAL_CHANGED_EVENT } from '@/pages/platform/orgActions';
import { PlatformGlobalSearch } from './PlatformGlobalSearch';

const NAV_LINKS = [
  { to: '/platform', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/platform/organizations', label: 'Organizations', icon: Building2, end: false },
  { to: '/platform/workspace', label: 'Workspace', icon: Briefcase, end: false },
  { to: '/platform/users', label: 'Users', icon: Users, end: false },
  { to: '/platform/subscriptions', label: 'Subscriptions & Pricing', icon: CreditCard, end: false },
  { to: '/platform/audit-logs', label: 'Audit log', icon: ScrollText, end: false },
  { to: '/platform/admins', label: 'Admins', icon: UserCog, end: false },
  { to: '/platform/website', label: 'Website', icon: Globe, end: false },
  { to: '/platform/settings', label: 'Settings', icon: Settings, end: false },
];

export function PlatformLayout() {
  const { admin, logout } = usePlatformAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Organizations awaiting approval, for the nav badge. A one-row page is enough
  // to read the total; refreshed on navigation and after an approval decision.
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingNonce, setPendingNonce] = useState(0);
  useEffect(() => {
    const bump = () => setPendingNonce((n) => n + 1);
    window.addEventListener(ORG_APPROVAL_CHANGED_EVENT, bump);
    return () => window.removeEventListener(ORG_APPROVAL_CHANGED_EVENT, bump);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    platformApi.organizations
      .list({ status: 'pending', page: 1, page_size: 1 }, controller.signal)
      .then((result) => setPendingCount(result.total ?? 0))
      .catch(() => {
        // The badge is a hint; a failed count simply leaves it as it was.
      });
    return () => controller.abort();
  }, [location.pathname, pendingNonce]);

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
              <strong style={{ color: '#f8fafc' }}>Platform Admin</strong>
              <small style={{ color: '#94a3b8' }}>Rooman Books · Super Admin</small>
            </span>
          </div>
        </div>

        <div className="header-right" style={{ gap: 12 }}>
          <PlatformGlobalSearch />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="avatar"
              style={{ background: '#312e81', color: '#e0e7ff' }}
              aria-hidden="true"
            >
              {initials(admin?.name ?? admin?.email ?? 'SA')}
            </span>
            <span
              style={{ fontSize: 13, color: '#cbd5e1', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={admin?.email}
            >
              {admin?.email}
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
            onClick={() => void logout()}
            style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {changingPassword ? <ChangePasswordModal onClose={() => setChangingPassword(false)} /> : null}

      <div className="app-body">
        {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" /> : null}
        <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Platform navigation">
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
                {entry.to === '/platform/organizations' && pendingCount > 0 ? (
                  <span className="nav-count-badge" title={`${pendingCount} awaiting approval`}>
                    {pendingCount > 99 ? '99+' : pendingCount}
                    <span className="sr-only"> awaiting approval</span>
                  </span>
                ) : null}
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
