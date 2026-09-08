import React, { useState, useEffect } from 'react';
import {
  Search,
  Bell,
  Settings,
  ChevronDown,
  Building2,
  Menu,
  PlusCircle,
  User,
  Check,
  X,
  Globe,
  CheckCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sparkles,
  LogOut,
  ShieldCheck,
  Mail,
  Briefcase
} from 'lucide-react';
import { UserProfile, ApiClient } from '../../services/apiClient';

interface HeaderProps {
  onToggleSidebar: () => void;
  onQuickAddItem: () => void;
  serverConnected?: boolean;
  currentUser?: UserProfile | null;
  onSignOut?: () => void;
  onNavigateLanding?: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  type: 'warning' | 'info' | 'success' | 'system';
  unread: boolean;
}

const initialNotifications: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Low Stock Alert',
    body: 'Cat6 UTP Gigabit Network Cable is below reorder level (4 pcs remaining).',
    time: '10 mins ago',
    type: 'warning',
    unread: true,
  },
  {
    id: 'notif-2',
    title: 'GST Compliance Validated',
    body: 'GSTR-1 return filing due in 3 days. All invoice totals match ledger balance.',
    time: '25 mins ago',
    type: 'info',
    unread: true,
  },
  {
    id: 'notif-3',
    title: 'Gmail SMTP Active',
    body: 'Outgoing billing notification server connected to shalya@rooman.com.',
    time: '1 hour ago',
    type: 'success',
    unread: false,
  },
  {
    id: 'notif-4',
    title: 'Cloud Synchronization',
    body: 'Rooman Books real-time enterprise database synced successfully.',
    time: '2 hours ago',
    type: 'system',
    unread: false,
  },
];

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onQuickAddItem,
  serverConnected = true,
  currentUser,
  onSignOut,
  onNavigateLanding,
}) => {
  const [selectedOrg, setSelectedOrg] = useState('Rooman Technologies Pvt Ltd');
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const unreadCount = notifications.filter(n => n.unread).length;

  // Profile modal editable fields
  const [profileName, setProfileName] = useState(currentUser?.name || 'Administrator');
  const [profileEmail, setProfileEmail] = useState(currentUser?.email || 'admin@rooman.com');
  const [profileOrg, setProfileOrg] = useState(currentUser?.organization || selectedOrg);
  const [profileRole, setProfileRole] = useState(currentUser?.role || 'Administrator');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [gstReminders, setGstReminders] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name || 'Administrator');
      setProfileEmail(currentUser.email || 'admin@rooman.com');
      setProfileOrg(currentUser.organization || selectedOrg);
      setProfileRole(currentUser.role || 'Administrator');
    }
  }, [currentUser, selectedOrg]);

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const removeNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: UserProfile = {
      ...(currentUser || { id: 'usr-admin' }),
      name: profileName,
      email: profileEmail,
      organization: profileOrg,
      role: profileRole,
    };
    ApiClient.storeUser(updated, 'token_profile_update');
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setShowProfileModal(false);
    }, 1000);
  };

  const organizations = [
    'Rooman Technologies Pvt Ltd',
    'Rooman Enterprise Solutions (GST Registered)',
    'Global Financial Services',
  ];

  const getInitials = (name?: string) => {
    if (!name) return 'SG';
    return name
      .split(' ')
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <header className="zb-header">
      {/* Backdrop for closing open dropdowns when clicking outside */}
      {(showNotifications || showProfileDropdown || showOrgDropdown) && (
        <div
          className="zb-header-backdrop"
          onClick={() => {
            setShowNotifications(false);
            setShowProfileDropdown(false);
            setShowOrgDropdown(false);
          }}
        />
      )}

      {/* Left side: Hamburger + Logo + Organization Switcher */}
      <div className="zb-header-left">
        <button
          className="zb-icon-btn zb-mobile-menu-btn"
          onClick={onToggleSidebar}
          title="Toggle Navigation Menu"
        >
          <Menu size={20} />
        </button>

        <div className="zb-brand">
          <div className="zb-brand-logo-container">
            <img src="/rooman-logo.png" alt="Rooman" className="zb-brand-logo-img" />
          </div>
          <div className="zb-brand-info">
            <span className="zb-brand-title">Books</span>
            <span className="zb-brand-edition">IND Edition</span>
          </div>
        </div>

        <div className="zb-org-selector-container">
          <button
            className="zb-org-selector-btn"
            onClick={() => {
              setShowOrgDropdown(!showOrgDropdown);
              setShowProfileDropdown(false);
              setShowNotifications(false);
            }}
          >
            <Building2 size={16} className="zb-org-icon" />
            <span className="zb-org-name">{selectedOrg}</span>
            <ChevronDown size={14} className="zb-chevron" />
          </button>

          {showOrgDropdown && (
            <div className="zb-dropdown-menu zb-org-dropdown">
              <div className="zb-dropdown-header">Select Organization</div>
              {organizations.map(org => (
                <button
                  key={org}
                  className={`zb-dropdown-item ${org === selectedOrg ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedOrg(org);
                    setShowOrgDropdown(false);
                  }}
                >
                  <span className="zb-dropdown-text">{org}</span>
                  {org === selectedOrg && <Check size={14} className="zb-check" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="zb-header-center">
        <div className="zb-search-wrapper">
          <Search size={16} className="zb-search-icon" />
          <input
            type="text"
            className="zb-search-input"
            placeholder="Search items, invoices, contacts... (Press '/' to focus)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="zb-search-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Right Side: Quick Action + Notifications + Settings + Profile */}
      <div className="zb-header-right">
        <button
          className="zb-btn zb-btn-primary zb-quick-add-btn"
          onClick={onQuickAddItem}
          title="Add New Item"
        >
          <PlusCircle size={16} />
          <span className="zb-btn-text">New Item</span>
        </button>

        {/* ─── NOTIFICATIONS BUTTON & DROPDOWN ─── */}
        <div className="zb-relative">
          <button
            className="zb-icon-btn zb-has-badge"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowOrgDropdown(false);
              setShowProfileDropdown(false);
            }}
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && <span className="zb-badge-dot"></span>}
          </button>

          {showNotifications && (
            <div className="zb-dropdown-menu zb-notifications-dropdown">
              <div className="zb-notif-dropdown-header">
                <div className="zb-notif-header-title">
                  <Bell size={16} className="text-primary" />
                  <span>Notifications</span>
                  {unreadCount > 0 ? (
                    <span className="zb-notif-pill">{unreadCount} New</span>
                  ) : (
                    <span className="zb-notif-pill-read">All Read</span>
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="zb-notif-header-actions">
                    {unreadCount > 0 && (
                      <button
                        className="zb-notif-text-btn"
                        onClick={markAllAsRead}
                        title="Mark all as read"
                      >
                        <CheckCheck size={14} />
                        <span>Read All</span>
                      </button>
                    )}
                    <button
                      className="zb-notif-text-btn text-muted"
                      onClick={clearAllNotifications}
                      title="Clear all notifications"
                    >
                      <span>Clear</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="zb-notification-list">
                {notifications.length === 0 ? (
                  <div className="zb-notif-empty-state">
                    <CheckCircle2 size={36} className="text-success mb-2" />
                    <strong>All Caught Up!</strong>
                    <span>You have zero unread alerts or notifications.</span>
                  </div>
                ) : (
                  notifications.map(item => (
                    <div
                      key={item.id}
                      className={`zb-notification-card ${item.unread ? 'unread' : 'read'}`}
                      onClick={() => {
                        setNotifications(prev =>
                          prev.map(n => (n.id === item.id ? { ...n, unread: false } : n))
                        );
                      }}
                    >
                      <div className={`zb-notif-icon-box ${item.type}`}>
                        {item.type === 'warning' && <AlertTriangle size={15} />}
                        {item.type === 'info' && <Info size={15} />}
                        {item.type === 'success' && <CheckCircle2 size={15} />}
                        {item.type === 'system' && <Sparkles size={15} />}
                      </div>

                      <div className="zb-notif-content-area">
                        <div className="zb-notif-card-header">
                          <span className="zb-notif-title">{item.title}</span>
                          <span className="zb-notif-time">{item.time}</span>
                        </div>
                        <p className="zb-notif-description">{item.body}</p>
                      </div>

                      <button
                        className="zb-notif-dismiss-btn"
                        onClick={e => removeNotification(item.id, e)}
                        title="Dismiss notification"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {notifications.length > 0 && (
                <div className="zb-notif-dropdown-footer">
                  <span>Showing {notifications.length} recent system events</span>
                  {unreadCount > 0 && (
                    <button className="zb-link-btn" onClick={markAllAsRead}>
                      Mark all as read
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Landing Page Button */}
        {onNavigateLanding && (
          <button
            className="zb-landing-switch-btn"
            onClick={onNavigateLanding}
            title="Return to Landing Page"
          >
            <Globe size={15} />
            <span>Landing Page</span>
          </button>
        )}

        {/* Settings Button */}
        <button
          className="zb-icon-btn"
          title="Organization Settings"
          onClick={() => setShowSettingsModal(true)}
        >
          <Settings size={18} />
        </button>

        {/* ─── PROFILE AVATAR & DROPDOWN ─── */}
        <div className="zb-relative">
          <button
            className="zb-profile-btn"
            onClick={() => {
              setShowProfileDropdown(!showProfileDropdown);
              setShowOrgDropdown(false);
              setShowNotifications(false);
            }}
            title="User Profile Menu"
          >
            <div className="zb-avatar">
              <span>{getInitials(currentUser?.name)}</span>
            </div>
            <ChevronDown size={14} className="zb-avatar-chevron" />
          </button>

          {showProfileDropdown && (
            <div className="zb-dropdown-menu zb-profile-dropdown">
              <div className="zb-profile-header-card">
                <div className="zb-avatar large">
                  {getInitials(currentUser?.name)}
                  <span className="zb-avatar-online-dot"></span>
                </div>
                <div className="zb-profile-header-meta">
                  <div className="zb-user-name">{currentUser?.name || 'Administrator'}</div>
                  <div className="zb-user-email">{currentUser?.email || 'admin@rooman.com'}</div>
                  <div className="zb-profile-badge-row">
                    <span className="zb-user-role-badge">
                      <ShieldCheck size={12} />
                      <span>{currentUser?.role || 'Administrator'}</span>
                    </span>
                    <span className="zb-org-tag" title={currentUser?.organization || selectedOrg}>
                      {currentUser?.organization || selectedOrg}
                    </span>
                  </div>
                </div>
              </div>

              <div className="zb-dropdown-divider"></div>

              <div className="zb-profile-menu-items">
                <button
                  className="zb-dropdown-item"
                  onClick={() => {
                    setShowProfileDropdown(false);
                    setShowProfileModal(true);
                  }}
                >
                  <User size={16} className="text-primary" />
                  <div className="zb-menu-text-wrap">
                    <span className="zb-menu-title">My Profile & Preferences</span>
                    <span className="zb-menu-desc">Account details, role & alerts</span>
                  </div>
                </button>

                <button
                  className="zb-dropdown-item"
                  onClick={() => {
                    setShowProfileDropdown(false);
                    setShowSettingsModal(true);
                  }}
                >
                  <Building2 size={16} className="text-primary" />
                  <div className="zb-menu-text-wrap">
                    <span className="zb-menu-title">Organization Setup & GST</span>
                    <span className="zb-menu-desc">Fiscal year, GSTIN & branches</span>
                  </div>
                </button>

                {onNavigateLanding && (
                  <button
                    className="zb-dropdown-item"
                    onClick={() => {
                      setShowProfileDropdown(false);
                      onNavigateLanding();
                    }}
                  >
                    <Globe size={16} className="text-muted" />
                    <div className="zb-menu-text-wrap">
                      <span className="zb-menu-title">Back to Landing Page</span>
                      <span className="zb-menu-desc">View public product overview</span>
                    </div>
                  </button>
                )}
              </div>

              <div className="zb-dropdown-divider"></div>

              <button
                className="zb-dropdown-item zb-signout-item"
                onClick={() => {
                  setShowProfileDropdown(false);
                  if (onSignOut) onSignOut();
                }}
              >
                <LogOut size={16} className="text-danger" />
                <span className="text-danger font-medium">Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="zb-modal-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="zb-auth-modal" style={{ maxWidth: '540px' }} onClick={e => e.stopPropagation()}>
            <div className="zb-auth-header">
              <h3 className="zb-auth-title">Organization Setup & Tax Preferences</h3>
              <button className="zb-modal-close" onClick={() => setShowSettingsModal(false)}><X size={18} /></button>
            </div>
            <div className="zb-auth-form" style={{ padding: '1.25rem' }}>
              <div className="zb-form-group">
                <label className="zb-label">Organization Name</label>
                <input type="text" className="zb-input" readOnly value={selectedOrg} />
              </div>
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">GSTIN / Tax Registration</label>
                  <input type="text" className="zb-input" readOnly value="29AABCD1234E1Z5" />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Base Currency</label>
                  <input type="text" className="zb-input" readOnly value="INR (₹) - Indian Rupee" />
                </div>
              </div>
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Fiscal Year</label>
                  <input type="text" className="zb-input" readOnly value="1 April - 31 March" />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">GST Portal Status</label>
                  <input type="text" className="zb-input" readOnly value="Verified Active (NIC Sandbox)" />
                </div>
              </div>
              <div className="zb-form-group">
                <label className="zb-label">Registered Office</label>
                <input type="text" className="zb-input" readOnly value="#42 Rooman Towers, Koramangala 4th Block, Bengaluru 560034" />
              </div>
              <div className="zb-modal-footer mt-4" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="zb-btn zb-btn-primary" onClick={() => setShowSettingsModal(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ENHANCED PROFILE & PREFERENCES MODAL ─── */}
      {showProfileModal && (
        <div className="zb-modal-backdrop" onClick={() => setShowProfileModal(false)}>
          <div
            className="zb-auth-modal zb-profile-modal-card"
            style={{ maxWidth: '520px' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="zb-auth-header">
              <div className="zb-flex-align gap-2">
                <User size={18} className="text-primary" />
                <h3 className="zb-auth-title">My Profile & Preferences</h3>
              </div>
              <button className="zb-modal-close" onClick={() => setShowProfileModal(false)}>
                <X size={18} />
              </button>
            </div>

            {savedSuccess && (
              <div className="zb-profile-saved-banner">
                <CheckCircle2 size={16} />
                <span>Profile preferences updated successfully!</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="zb-auth-form" style={{ padding: '1.25rem' }}>
              {/* Profile Identity Card */}
              <div className="zb-profile-modal-identity">
                <div className="zb-avatar large" style={{ width: '56px', height: '56px', fontSize: '20px' }}>
                  {getInitials(profileName)}
                </div>
                <div className="zb-identity-meta">
                  <div className="zb-identity-name">{profileName}</div>
                  <div className="zb-identity-email">{profileEmail}</div>
                  <div className="zb-flex-align gap-2 mt-1">
                    <span className="zb-user-role-badge">
                      <ShieldCheck size={12} />
                      <span>{profileRole}</span>
                    </span>
                    <span className="zb-org-tag">{profileOrg}</span>
                  </div>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Full Name</label>
                  <input
                    type="text"
                    className="zb-input"
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    required
                  />
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Email Address</label>
                  <input
                    type="email"
                    className="zb-input"
                    value={profileEmail}
                    onChange={e => setProfileEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="zb-grid-2">
                <div className="zb-form-group">
                  <label className="zb-label">Role Designation</label>
                  <select
                    className="zb-input"
                    value={profileRole}
                    onChange={e => setProfileRole(e.target.value)}
                  >
                    <option value="Administrator">Administrator & Owner</option>
                    <option value="Chief Accountant">Chief Accountant</option>
                    <option value="Financial Controller">Financial Controller</option>
                    <option value="Auditor">Statutory Auditor</option>
                  </select>
                </div>
                <div className="zb-form-group">
                  <label className="zb-label">Primary Organization</label>
                  <input
                    type="text"
                    className="zb-input"
                    value={profileOrg}
                    onChange={e => setProfileOrg(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Alert & Notification Preferences */}
              <div className="zb-pref-group">
                <label className="zb-label mb-2">Notification Preferences</label>
                <div className="zb-pref-card">
                  <label className="zb-checkbox-row">
                    <input
                      type="checkbox"
                      checked={emailAlerts}
                      onChange={e => setEmailAlerts(e.target.checked)}
                    />
                    <div className="zb-checkbox-meta">
                      <strong>Low stock and invoice dispatch emails</strong>
                      <span>Receive real-time alerts via configured Gmail SMTP</span>
                    </div>
                  </label>
                  <label className="zb-checkbox-row">
                    <input
                      type="checkbox"
                      checked={gstReminders}
                      onChange={e => setGstReminders(e.target.checked)}
                    />
                    <div className="zb-checkbox-meta">
                      <strong>Automated GST Return & E-Way Reminders</strong>
                      <span>Timely notifications before monthly GSTR-1 and 3B dates</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Security Badge */}
              <div className="zb-security-footer-note">
                <ShieldCheck size={14} className="text-success" />
                <span>Session authenticated via 256-bit TLS • ISO 27001 Certified Enterprise</span>
              </div>

              <div className="zb-modal-footer mt-4" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="zb-btn zb-btn-outline"
                  onClick={() => setShowProfileModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="zb-btn zb-btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── SCOPED COMPONENT STYLES ─── */}
      <style>{`
        .zb-header-backdrop {
          position: fixed;
          inset: 0;
          z-index: 998;
          background: transparent;
        }

        .zb-relative {
          position: relative;
        }

        /* Generic Dropdown Menu */
        .zb-dropdown-menu {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 16px 36px -4px rgba(15, 23, 42, 0.16), 0 6px 14px -2px rgba(15, 23, 42, 0.08);
          z-index: 999;
          overflow: hidden;
          animation: zbDropdownSlide 0.16s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes zbDropdownSlide {
          from {
            opacity: 0;
            transform: translateY(-6px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Notifications Dropdown */
        .zb-notifications-dropdown {
          width: 380px;
          max-width: 90vw;
        }

        .zb-notif-dropdown-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .zb-notif-header-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }

        .zb-notif-pill {
          background: #0066cc;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 9999px;
        }

        .zb-notif-pill-read {
          background: #e2e8f0;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 9999px;
        }

        .zb-notif-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .zb-notif-text-btn {
          background: none;
          border: none;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          color: #0066cc;
          cursor: pointer;
          padding: 3px 6px;
          border-radius: 4px;
          transition: background 0.15s;
        }

        .zb-notif-text-btn:hover {
          background: #e0f2fe;
        }

        .zb-notif-text-btn.text-muted {
          color: #64748b;
        }

        .zb-notif-text-btn.text-muted:hover {
          background: #f1f5f9;
        }

        .zb-notification-list {
          max-height: 380px;
          overflow-y: auto;
        }

        .zb-notification-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          cursor: pointer;
          transition: background 0.15s;
          position: relative;
        }

        .zb-notification-card:hover {
          background: #f8fafc;
        }

        .zb-notification-card.unread {
          background: #f0f7ff;
        }

        .zb-notification-card.unread:hover {
          background: #e6f0fa;
        }

        .zb-notif-icon-box {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .zb-notif-icon-box.warning {
          background: #fef3c7;
          color: #d97706;
        }

        .zb-notif-icon-box.info {
          background: #e0f2fe;
          color: #0284c7;
        }

        .zb-notif-icon-box.success {
          background: #dcfce7;
          color: #16a34a;
        }

        .zb-notif-icon-box.system {
          background: #f3e8ff;
          color: #9333ea;
        }

        .zb-notif-content-area {
          flex: 1;
          min-width: 0;
        }

        .zb-notif-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 3px;
        }

        .zb-notif-title {
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .zb-notif-time {
          font-size: 11px;
          color: #94a3b8;
          flex-shrink: 0;
        }

        .zb-notif-description {
          margin: 0;
          font-size: 12px;
          line-height: 1.4;
          color: #475569;
        }

        .zb-notif-dismiss-btn {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          opacity: 0;
          transition: opacity 0.15s, color 0.15s;
        }

        .zb-notification-card:hover .zb-notif-dismiss-btn {
          opacity: 1;
        }

        .zb-notif-dismiss-btn:hover {
          color: #ef4444;
          background: #fee2e2;
        }

        .zb-notif-empty-state {
          padding: 36px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          color: #64748b;
          font-size: 13px;
        }

        .zb-notif-dropdown-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          font-size: 11px;
          color: #64748b;
        }

        .zb-link-btn {
          background: none;
          border: none;
          color: #0066cc;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
        }

        .zb-link-btn:hover {
          text-decoration: underline;
        }

        /* Profile Dropdown */
        .zb-profile-dropdown {
          width: 320px;
        }

        .zb-profile-header-card {
          padding: 16px;
          background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .zb-avatar.large {
          width: 44px;
          height: 44px;
          font-size: 16px;
          position: relative;
        }

        .zb-avatar-online-dot {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 11px;
          height: 11px;
          background: #22c55e;
          border: 2px solid #ffffff;
          border-radius: 50%;
        }

        .zb-profile-header-meta {
          flex: 1;
          min-width: 0;
        }

        .zb-user-name {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .zb-user-email {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .zb-profile-badge-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
          flex-wrap: wrap;
        }

        .zb-user-role-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 6px;
        }

        .zb-org-tag {
          display: inline-block;
          font-size: 11px;
          color: #64748b;
          background: #f1f5f9;
          padding: 2px 7px;
          border-radius: 6px;
          max-width: 140px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .zb-dropdown-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 4px 0;
        }

        .zb-profile-menu-items {
          padding: 4px;
        }

        .zb-dropdown-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: none;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
          color: #1e293b;
        }

        .zb-dropdown-item:hover {
          background: #f1f5f9;
        }

        .zb-dropdown-item.active {
          background: #e0f2fe;
          color: #0369a1;
          font-weight: 600;
        }

        .zb-menu-text-wrap {
          display: flex;
          flex-direction: column;
        }

        .zb-menu-title {
          font-size: 13px;
          font-weight: 600;
          color: #1e293b;
        }

        .zb-menu-desc {
          font-size: 11px;
          color: #64748b;
          margin-top: 1px;
        }

        .zb-dropdown-item.zb-signout-item {
          padding: 10px 16px;
          border-radius: 0 0 12px 12px;
        }

        .zb-dropdown-item.zb-signout-item:hover {
          background: #fee2e2;
        }

        /* Profile Modal Elements */
        .zb-profile-modal-card {
          border-radius: 16px;
        }

        .zb-profile-modal-identity {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          margin-bottom: 16px;
        }

        .zb-identity-name {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
        }

        .zb-identity-email {
          font-size: 13px;
          color: #64748b;
        }

        .zb-pref-group {
          margin-top: 14px;
        }

        .zb-pref-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .zb-checkbox-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
        }

        .zb-checkbox-row input {
          margin-top: 3px;
        }

        .zb-checkbox-meta {
          display: flex;
          flex-direction: column;
          font-size: 13px;
          color: #1e293b;
        }

        .zb-checkbox-meta span {
          font-size: 11px;
          color: #64748b;
        }

        .zb-security-footer-note {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #475569;
          margin-top: 14px;
          padding: 8px 12px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 8px;
        }

        .zb-profile-saved-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: #dcfce7;
          color: #15803d;
          font-size: 13px;
          font-weight: 600;
          border-bottom: 1px solid #bbf7d0;
        }
      `}</style>
    </header>
  );
};
