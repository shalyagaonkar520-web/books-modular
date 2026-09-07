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
  const [selectedOrg, setSelectedOrg] = useState('Zylker Electronics India Pvt Ltd');
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const organizations = [
    'Zylker Electronics India Pvt Ltd',
    'Acme Enterprises (GST Registered)',
    'Global Services & Consulting',
  ];

  return (
    <header className="zb-header">
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
          <div className="zb-brand-logo">
            <span className="zb-brand-icon">📚</span>
          </div>
          <div className="zb-brand-info">
            <span className="zb-brand-title">Zoho Books</span>
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
        {/* FastAPI Status Badge */}
        <div
          className={`zb-server-badge ${serverConnected ? 'online' : 'offline'}`}
          title={serverConnected ? 'FastAPI Backend connected via SQLite' : 'FastAPI Backend disconnected - offline mode'}
        >
          <span className="zb-status-dot"></span>
          <span>{serverConnected ? 'FastAPI & SQLite' : 'Offline Mode'}</span>
        </div>

        <button
          className="zb-btn zb-btn-primary zb-quick-add-btn"
          onClick={onQuickAddItem}
          title="Add New Item"
        >
          <PlusCircle size={16} />
          <span className="zb-btn-text">New Item</span>
        </button>

        {/* Notifications Button */}
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
            <span className="zb-badge-dot"></span>
          </button>

          {showNotifications && (
            <div className="zb-dropdown-menu zb-notifications-dropdown">
              <div className="zb-dropdown-header zb-flex-between">
                <span>Notifications</span>
                <span className="zb-badge-count">2 New</span>
              </div>
              <div className="zb-notification-list">
                <div className="zb-notification-item">
                  <div className="zb-notif-title">Low Stock Alert</div>
                  <div className="zb-notif-body">
                    Logitech MX Master 3S is below reorder level (4 pcs remaining).
                  </div>
                  <div className="zb-notif-time">10 mins ago</div>
                </div>
                <div className="zb-notification-item">
                  <div className="zb-notif-title">System Update</div>
                  <div className="zb-notif-body">
                    Zoho Books Home & Items module synchronized successfully.
                  </div>
                  <div className="zb-notif-time">1 hour ago</div>
                </div>
              </div>
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
        <button className="zb-icon-btn" title="Organization Settings">
          <Settings size={18} />
        </button>

        {/* Profile Avatar */}
        <div className="zb-relative">
          <button
            className="zb-profile-btn"
            onClick={() => {
              setShowProfileDropdown(!showProfileDropdown);
              setShowOrgDropdown(false);
              setShowNotifications(false);
            }}
          >
            <div className="zb-avatar">
              <span>{currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'SG'}</span>
            </div>
            <ChevronDown size={14} className="zb-avatar-chevron" />
          </button>

          {showProfileDropdown && (
            <div className="zb-dropdown-menu zb-profile-dropdown">
              <div className="zb-profile-header">
                <div className="zb-avatar large">
                  {currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'SG'}
                </div>
                <div>
                  <div className="zb-user-name">{currentUser?.name || 'Shaly Gaonkar'}</div>
                  <div className="zb-user-email">{currentUser?.email || 'admin@zylkerbooks.com'}</div>
                  <span className="zb-user-role">{currentUser?.role || 'Administrator'}</span>
                </div>
              </div>
              <div className="zb-dropdown-divider"></div>
              {onNavigateLanding && (
                <button
                  className="zb-dropdown-item"
                  onClick={() => {
                    setShowProfileDropdown(false);
                    onNavigateLanding();
                  }}
                >
                  <Globe size={14} /> Back to Landing Page
                </button>
              )}
              <button className="zb-dropdown-item">
                <User size={14} /> My Profile & Preferences
              </button>
              <button className="zb-dropdown-item">
                <Settings size={14} /> Organization Setup
              </button>
              <div className="zb-dropdown-divider"></div>
              <button
                className="zb-dropdown-item text-danger"
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
