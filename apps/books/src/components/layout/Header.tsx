import React, { useState } from 'react';
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
  X
} from 'lucide-react';

import { UserProfile } from '../../services/apiClient';
import {
  Globe
} from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
  onQuickAddItem: () => void;
  serverConnected?: boolean;
  currentUser?: UserProfile | null;
  onSignOut?: () => void;
  onNavigateLanding?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onQuickAddItem,
  serverConnected = true,
  currentUser,
  onSignOut,
  onNavigateLanding,
}) => {
  const [selectedOrg, setSelectedOrg] = useState('Rooman Enterprise India');
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const organizations = [
    'Rooman Enterprise India (HQ)',
    'Rooman Cloud Technologies Ltd',
    'Rooman Financial Services (SEBI / GST)',
  ];

  const userInitials = currentUser?.name
    ? currentUser.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'SG';

  return (
    <header className="rf-header zb-header">
      {/* Left side: Hamburger + Logo + Organization Switcher */}
      <div className="rf-header-left zb-header-left">
        <button
          className="rf-icon-button rf-mobile-menu-btn zb-icon-btn zb-mobile-menu-btn"
          onClick={onToggleSidebar}
          title="Toggle Navigation Menu"
        >
          <Menu size={20} />
        </button>

        <div className="rf-brand zb-brand">
          <div className="rf-brand-logo zb-brand-logo">
            <span className="rf-brand-icon">⚡</span>
          </div>
          <div className="rf-brand-info zb-brand-info">
            <span className="rf-brand-title zb-brand-title">Rooman<strong>Books</strong></span>
            <span className="rf-brand-edition zb-brand-edition">Apex Financial OS</span>
          </div>
        </div>

        <div className="rf-org-selector zb-org-selector-container">
          <button
            className="rf-org-button zb-org-selector-btn"
            onClick={() => {
              setShowOrgDropdown(!showOrgDropdown);
              setShowProfileDropdown(false);
              setShowNotifications(false);
            }}
          >
            <Building2 size={15} className="text-indigo" />
            <span className="rf-org-name zb-org-name">{selectedOrg}</span>
            <ChevronDown size={13} className="text-muted" />
          </button>

          {showOrgDropdown && (
            <div className="rf-dropdown-menu zb-dropdown-menu zb-org-dropdown">
              <div className="rf-dropdown-header zb-dropdown-header">Select Enterprise Workspace</div>
              {organizations.map(org => (
                <button
                  key={org}
                  className={`rf-dropdown-item zb-dropdown-item ${org === selectedOrg ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedOrg(org);
                    setShowOrgDropdown(false);
                  }}
                >
                  <span>{org}</span>
                  {org === selectedOrg && <Check size={14} className="text-emerald" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Global Command Search Bar */}
      <div className="rf-header-center zb-header-center">
        <div className="rf-search-bar zb-search-wrapper">
          <Search size={16} className="rf-search-icon zb-search-icon" />
          <input
            type="text"
            className="rf-search-input zb-search-input"
            placeholder="Command / Quick Search: invoices, items, banking... (Press '/' to focus)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="rf-icon-button small zb-search-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Right Side: Quick Action + Notifications + Settings + Profile */}
      <div className="rf-header-right zb-header-right">
        {/* Connection Status Badge */}
        <div
          className={`rf-status-pill zb-server-badge ${serverConnected ? 'online' : 'offline'}`}
          title={serverConnected ? 'Cloud ledger synchronized and active' : 'Offline Mode'}
        >
          <span className="rf-status-dot zb-status-dot"></span>
          <span>{serverConnected ? 'Cloud Active' : 'Offline Mode'}</span>
        </div>

        <button
          className="rf-btn rf-btn-primary rf-btn-sm zb-btn zb-btn-primary zb-quick-add-btn"
          onClick={onQuickAddItem}
          title="Add New Inventory Item"
        >
          <PlusCircle size={15} />
          <span>New Item</span>
        </button>

        {/* Notifications Button */}
        <div className="rf-relative zb-relative">
          <button
            className="rf-icon-button zb-icon-btn zb-has-badge"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowOrgDropdown(false);
              setShowProfileDropdown(false);
            }}
            title="Notifications"
          >
            <Bell size={18} />
            <span className="rf-notif-dot zb-badge-dot"></span>
          </button>

          {showNotifications && (
            <div className="rf-dropdown-menu notifications zb-dropdown-menu zb-notifications-dropdown">
              <div className="rf-dropdown-header zb-dropdown-header zb-flex-between">
                <span>System Notifications</span>
                <span className="rf-badge rf-badge-emerald zb-badge-count">2 New</span>
              </div>
              <div className="rf-notif-list zb-notification-list">
                <div className="rf-notif-card zb-notification-item">
                  <div className="rf-notif-title zb-notif-title">Inventory Health Alert</div>
                  <div className="rf-notif-desc zb-notif-body">
                    Logitech MX Master 3S reached low-stock threshold (4 pcs remaining).
                  </div>
                  <div className="rf-notif-time zb-notif-time">10 mins ago</div>
                </div>
                <div className="rf-notif-card zb-notification-item">
                  <div className="rf-notif-title zb-notif-title">Cloud Ledger Synchronized</div>
                  <div className="rf-notif-desc zb-notif-body">
                    All financial journals and item balances updated across instances.
                  </div>
                  <div className="rf-notif-time zb-notif-time">1 hour ago</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Landing Page Button */}
        {onNavigateLanding && (
          <button
            className="rf-btn rf-btn-ghost rf-btn-sm zb-landing-switch-btn"
            onClick={onNavigateLanding}
            title="Return to Public Landing Page"
          >
            <Globe size={15} />
            <span className="hide-mobile">Landing Page</span>
          </button>
        )}

        {/* Profile Avatar & Menu */}
        <div className="rf-relative zb-relative">
          <button
            className="rf-profile-trigger zb-profile-btn"
            onClick={() => {
              setShowProfileDropdown(!showProfileDropdown);
              setShowOrgDropdown(false);
              setShowNotifications(false);
            }}
          >
            <div className="rf-avatar-circle zb-avatar">
              <span>{userInitials}</span>
            </div>
            <ChevronDown size={13} className="text-muted" />
          </button>

          {showProfileDropdown && (
            <div className="rf-dropdown-menu profile zb-dropdown-menu zb-profile-dropdown">
              <div className="rf-profile-card zb-profile-header">
                <div className="rf-avatar-circle large zb-avatar large">
                  {userInitials}
                </div>
                <div className="rf-profile-details">
                  <div className="rf-user-name zb-user-name">{currentUser?.name || 'Shalya Gaonkar'}</div>
                  <div className="rf-user-email zb-user-email">{currentUser?.email || 'admin@zylkerbooks.com'}</div>
                  <div className="rf-flex-align gap-2 mt-1">
                    <span className="rf-badge rf-badge-indigo zb-user-role">{currentUser?.role || 'Administrator'}</span>
                    {currentUser?.authProvider && currentUser.authProvider !== 'local' && (
                      <span className="rf-badge rf-badge-emerald zb-oauth-tag">
                        {currentUser.authProvider === 'google' && 'Google SSO'}
                        {currentUser.authProvider === 'microsoft' && 'Microsoft 365'}
                        {currentUser.authProvider === 'zoho' && 'Corporate SSO'}
                        {currentUser.authProvider === 'github' && 'GitHub SSO'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="rf-dropdown-divider zb-dropdown-divider"></div>
              {onNavigateLanding && (
                <button
                  className="rf-dropdown-item zb-dropdown-item"
                  onClick={() => {
                    setShowProfileDropdown(false);
                    onNavigateLanding();
                  }}
                >
                  <Globe size={15} /> Back to Landing Page
                </button>
              )}
              <button className="rf-dropdown-item zb-dropdown-item">
                <User size={15} /> Account Settings
              </button>
              <button className="rf-dropdown-item zb-dropdown-item">
                <Settings size={15} /> Enterprise Config
              </button>
              <div className="rf-dropdown-divider zb-dropdown-divider"></div>
              <button
                className="rf-dropdown-item text-danger zb-dropdown-item text-danger"
                onClick={() => {
                  setShowProfileDropdown(false);
                  if (onSignOut) onSignOut();
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
