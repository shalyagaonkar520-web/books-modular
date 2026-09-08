import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Menu, Plus, Settings, User as UserIcon } from 'lucide-react';

import { dashboardApi } from '@/api/endpoints';
import type { NotificationItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { initials } from '@/utils/format';

const NOTIFICATION_ROUTES: Record<string, string> = {
  invoice: '/invoices',
  bill: '/bills',
  item: '/items',
  banking: '/banking',
};

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user, organization, logout, canWrite } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [openMenu, setOpenMenu] = useState<'none' | 'profile' | 'bell' | 'create'>('none');
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      dashboardApi
        .notifications()
        .then((data) => {
          if (active) setNotifications(data.items);
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 120_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) setOpenMenu('none');
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  return (
    <header className="app-header" ref={headerRef}>
      <div className="header-left">
        <button type="button" className="icon-btn menu-btn" onClick={onToggleSidebar} aria-label="Toggle navigation">
          <Menu size={19} />
        </button>
        <Link to="/" className="brand">
          <img src="/rooman-logo.png" alt="" className="brand-logo" width={28} height={28} />
          <span className="brand-text">
            <strong>Rooman Books</strong>
            <small>{organization?.name ?? 'Accounting'}</small>
          </span>
        </Link>
      </div>

      <div className="header-right">
        {canWrite ? (
          <div className="menu-anchor">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setOpenMenu(openMenu === 'create' ? 'none' : 'create')}
              aria-expanded={openMenu === 'create'}
            >
              <Plus size={15} />
              <span>Create</span>
            </button>
            {openMenu === 'create' ? (
              <div className="dropdown" role="menu">
                <button type="button" role="menuitem" onClick={() => { setOpenMenu('none'); navigate('/invoices/new'); }}>
                  Invoice
                </button>
                <button type="button" role="menuitem" onClick={() => { setOpenMenu('none'); navigate('/bills/new'); }}>
                  Bill
                </button>
                <button type="button" role="menuitem" onClick={() => { setOpenMenu('none'); navigate('/expenses?new=1'); }}>
                  Expense
                </button>
                <button type="button" role="menuitem" onClick={() => { setOpenMenu('none'); navigate('/items?new=1'); }}>
                  Item
                </button>
                <button type="button" role="menuitem" onClick={() => { setOpenMenu('none'); navigate('/customers?new=1'); }}>
                  Customer
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="menu-anchor">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setOpenMenu(openMenu === 'bell' ? 'none' : 'bell')}
            aria-label={`Notifications (${notifications.length})`}
            aria-expanded={openMenu === 'bell'}
          >
            <Bell size={18} />
            {notifications.length ? <span className="badge-dot">{notifications.length > 9 ? '9+' : notifications.length}</span> : null}
          </button>
          {openMenu === 'bell' ? (
            <div className="dropdown dropdown-wide" role="menu">
              <div className="dropdown-header">Needs attention</div>
              {notifications.length === 0 ? (
                <p className="dropdown-empty">Nothing needs your attention right now.</p>
              ) : (
                notifications.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={`notification notification-${item.severity}`}
                    onClick={() => {
                      setOpenMenu('none');
                      navigate(NOTIFICATION_ROUTES[item.entityType] ?? '/');
                    }}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="menu-anchor">
          <button
            type="button"
            className="profile-btn"
            onClick={() => setOpenMenu(openMenu === 'profile' ? 'none' : 'profile')}
            aria-expanded={openMenu === 'profile'}
          >
            <span className="avatar">{initials(user?.name ?? '')}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {openMenu === 'profile' ? (
            <div className="dropdown" role="menu">
              <div className="dropdown-profile">
                <strong>{user?.name}</strong>
                <span>{user?.email}</span>
                <span className="role-pill">{user?.role}</span>
              </div>
              <button type="button" role="menuitem" onClick={() => { setOpenMenu('none'); navigate('/profile'); }}>
                <UserIcon size={14} /> My profile
              </button>
              {user?.role === 'admin' ? (
                <button type="button" role="menuitem" onClick={() => { setOpenMenu('none'); navigate('/settings'); }}>
                  <Settings size={14} /> Organization settings
                </button>
              ) : null}
              <button type="button" role="menuitem" className="danger" onClick={() => void logout()}>
                <LogOut size={14} /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
