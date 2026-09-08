import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, FileSpreadsheet, LogOut, Menu, Plus, Settings, User as UserIcon, X } from 'lucide-react';

import { dashboardApi } from '@/api/endpoints';
import type { NotificationItem } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { initials } from '@/utils/format';
import { ExcelImportModal } from './ExcelImportModal';

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
  const headerRef = useRef<HTMLElement>(null);

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
      <ExcelImportModal open={excelModalOpen} onClose={() => setExcelModalOpen(false)} />
    </header>
  );
}
