import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  ChevronDown,
  CreditCard,
  FileText,
  FolderOpen,
  Home,
  IndianRupee,
  Landmark,
  Package,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';

import { APP_MODULES, type AppModuleKey, type AppModuleMenu } from '@/api/appContent';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';

interface NavEntry {
  to: string;
  /** Text key of the label (see content/appContentDefault.json). */
  label: string;
  icon: typeof Home;
  /** The switchable module this entry opens; entries without one are always shown. */
  module?: AppModuleKey;
  adminOnly?: boolean;
  /** Holds sensitive financial data (accounts, ledger, banking, payment gateway) that Staff cannot access. */
  staffBlocked?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  icon: typeof Home;
  entries: NavEntry[];
}

/** The icons the module registry (content/modules.json) may name. */
const ICONS: Record<string, typeof Home> = {
  ArrowLeftRight,
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  FolderOpen,
  IndianRupee,
  Landmark,
  Package,
  Receipt,
  Users,
  Wallet,
};

/** The sidebar entries of one registry group, in registry order. */
function moduleLinks(group: AppModuleMenu['group']): NavEntry[] {
  return APP_MODULES.filter((module) => module.menu.group === group).map((module) => ({
    to: module.routes[0],
    label: module.menu.label,
    icon: ICONS[module.menu.icon] ?? FolderOpen,
    module: module.key,
    staffBlocked: module.roles.length > 0 && !module.roles.includes('staff'),
  }));
}

const GROUPS: NavGroup[] = [
  { id: 'sales', label: 'sidebar.sales', icon: ShoppingCart, entries: moduleLinks('sales') },
  { id: 'purchases', label: 'sidebar.purchases', icon: ShoppingBag, entries: moduleLinks('purchases') },
];

const SINGLE_LINKS: NavEntry[] = [{ to: '/dashboard', label: 'sidebar.dashboard', icon: Home }, ...moduleLinks('main')];

const LOWER_LINKS: NavEntry[] = moduleLinks('lower');

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { isAdmin, isStaff } = useAuth();
  const { t, isModuleEnabled } = useAppContent();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const enabled = (entry: NavEntry) => !entry.module || isModuleEnabled(entry.module);
  const singleLinks = SINGLE_LINKS.filter(enabled);
  const groups = GROUPS.map((group) => ({ ...group, entries: group.entries.filter(enabled) })).filter((group) => group.entries.length > 0);
  const lowerLinks = LOWER_LINKS.filter((entry) => !(entry.staffBlocked && isStaff) && enabled(entry));

  const toggle = (id: string) => setCollapsed((current) => ({ ...current, [id]: !current[id] }));

  return (
    <>
      {open ? <div className="sidebar-backdrop" onClick={onNavigate} aria-hidden="true" /> : null}
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label={t('sidebar.ariaLabel')}>
        <nav className="sidebar-nav">
          {singleLinks.map((entry) => (
            <NavLink key={entry.to} to={entry.to} end={entry.to === '/'} className="nav-link" onClick={onNavigate}>
              <entry.icon size={17} aria-hidden="true" />
              <span>{t(entry.label)}</span>
            </NavLink>
          ))}

          {groups.map((group) => {
            const isCollapsed = collapsed[group.id];
            return (
              <div className="nav-group" key={group.id}>
                <button type="button" className="nav-group-toggle" onClick={() => toggle(group.id)} aria-expanded={!isCollapsed}>
                  <group.icon size={17} aria-hidden="true" />
                  <span>{t(group.label)}</span>
                  <ChevronDown size={14} className={`chevron ${isCollapsed ? 'is-collapsed' : ''}`} aria-hidden="true" />
                </button>
                {!isCollapsed ? (
                  <div className="nav-sublist">
                    {group.entries.map((entry) => (
                      <NavLink key={entry.to} to={entry.to} className="nav-link nav-sublink" onClick={onNavigate}>
                        <entry.icon size={15} aria-hidden="true" />
                        <span>{t(entry.label)}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          {lowerLinks.map((entry) => (
            <NavLink key={entry.to} to={entry.to} className="nav-link" onClick={onNavigate}>
              <entry.icon size={17} aria-hidden="true" />
              <span>{t(entry.label)}</span>
            </NavLink>
          ))}

          {isAdmin ? (
            <NavLink to="/settings" className="nav-link" onClick={onNavigate}>
              <Building2 size={17} aria-hidden="true" />
              <span>{t('sidebar.settings')}</span>
            </NavLink>
          ) : null}
        </nav>
      </aside>
    </>
  );
}
