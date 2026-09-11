import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronDown,
  FileSpreadsheet,
  LogOut,
  Menu,
  Plus,
  X,
} from 'lucide-react';

import { dashboardApi } from '@/api/endpoints';
import type { NotificationItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { initials } from '@/utils/format';
import { ExcelImportModal } from './ExcelImportModal';
import '@/pages/settings/ProfilePage.css';

const NOTIFICATION_ROUTES: Record<string, string> = {
  invoice: '/invoices',
  bill: '/bills',
  item: '/items',
  banking: '/banking',
};

const DISMISSED_NOTIFICATIONS_KEY = 'rooman_dismissed_notifications';

function getStoredDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user, organization, logout, canWrite } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [, setDismissedIds] = useState<Set<string>>(getStoredDismissedIds);
  const [openMenu, setOpenMenu] = useState<'none' | 'profile' | 'bell' | 'create'>('none');
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (!user?.id) return null;
    return localStorage.getItem(`rooman_avatar_${user.id}`) || null;
  });
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const syncAvatar = () => {
      if (user?.id) {
        setAvatarUrl(localStorage.getItem(`rooman_avatar_${user.id}`) || null);
      }
    };
    window.addEventListener('rooman_avatar_updated', syncAvatar);
    window.addEventListener('storage', syncAvatar);
    return () => {
      window.removeEventListener('rooman_avatar_updated', syncAvatar);
      window.removeEventListener('storage', syncAvatar);
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const load = () =>
      dashboardApi
        .notifications()
        .then((data) => {
          if (active) {
            const dismissed = getStoredDismissedIds();
            setNotifications(data.items.filter((item) => !dismissed.has(item.id)));
          }
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 120_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const dismissNotification = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };

  const handleNotificationClick = (item: NotificationItem) => {
    dismissNotification(item.id);
    setOpenMenu('none');
    navigate(NOTIFICATION_ROUTES[item.entityType] ?? '/');
  };

  const clearAllNotifications = () => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => next.add(n.id));
      try {
        localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
    setNotifications([]);
  };

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
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setExcelModalOpen(true)}
              title="Upload and auto-categorize Excel or CSV files"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileSpreadsheet size={15} style={{ color: '#16a34a' }} />
              <span>Excel / Data Input</span>
            </button>
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
          </>
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
              <div className="dropdown-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Needs attention</span>
                {notifications.length > 0 ? (
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary, #2563eb)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    onClick={clearAllNotifications}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              {notifications.length === 0 ? (
                <p className="dropdown-empty">Nothing needs your attention right now.</p>
              ) : (
                notifications.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    role="menuitem"
                    className={`notification notification-${item.severity}`}
                    style={{ position: 'relative', paddingRight: '28px', cursor: 'pointer' }}
                    onClick={() => handleNotificationClick(item)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <button
                      type="button"
                      aria-label="Dismiss notification"
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'none',
                        border: 'none',
                        opacity: 0.6,
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissNotification(item.id);
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
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
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={user?.name ?? ''}
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <span className="avatar">{initials(user?.name ?? '')}</span>
            )}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {openMenu === 'profile' ? (
            <div className="dropdown zoho-header-dropdown" role="menu">
              <div className="zoho-dropdown-header">
                <div className="zoho-dropdown-avatar">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={user?.name ?? ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    initials(user?.name ?? '')
                  )}
                </div>
                <div className="zoho-dropdown-user">
                  <strong>{user?.name}</strong>
                  <span>{user?.email}</span>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpenMenu('none')}
                  style={{
                    position: 'absolute',
                    top: '14px',
                    right: '14px',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <X size={15} />
                </button>
              </div>

              <div className="zoho-dropdown-meta">
                User ID: {user?.id ? user.id.slice(0, 11) : '—'} • Org ID: {organization?.id ? organization.id.slice(0, 11) : 'Main'}
              </div>

              <div className="zoho-dropdown-nav">
                <button
                  type="button"
                  className="zoho-my-account-link"
                  onClick={() => {
                    setOpenMenu('none');
                    navigate('/profile');
                  }}
                >
                  My Account
                </button>
                <button
                  type="button"
                  className="zoho-sign-out-btn"
                  onClick={() => void logout()}
                >
                  <LogOut size={13} />
                  <span>Sign Out</span>
                </button>
              </div>

              <div
                style={{
                  padding: '9px 16px',
                  background: '#f8fafc',
                  fontSize: '12px',
                  color: '#475569',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: '#059669',
                  }}
                />
                <span>Active Books • {organization?.name ?? 'Rooman Books'}</span>
              </div>

              <div style={{ padding: '10px 16px', background: '#f8fafc' }}>
                <button
                  type="button"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    fontSize: '12px',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setOpenMenu('none');
                    navigate('/profile');
                  }}
                >
                  <span>Accessibility & Theme</span>
                  <ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <ExcelImportModal open={excelModalOpen} onClose={() => setExcelModalOpen(false)} />
    </header>
  );
}
