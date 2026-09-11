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

import { useAuth } from '@/auth/AuthContext';

interface NavEntry {
  to: string;
  label: string;
  icon: typeof Home;
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

const GROUPS: NavGroup[] = [
  {
    id: 'sales',
    label: 'Sales',
    icon: ShoppingCart,
    entries: [
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/invoices', label: 'Invoices', icon: FileText },
      { to: '/payments-received', label: 'Payments received', icon: Wallet },
    ],
  },
  {
    id: 'purchases',
    label: 'Purchases',
    icon: ShoppingBag,
    entries: [
      { to: '/expense-dashboard', label: 'Expense Dashboard', icon: BarChart3 },
      { to: '/vendors', label: 'Vendors', icon: Building2 },
      { to: '/bills', label: 'Bills', icon: Receipt },
      { to: '/expenses', label: 'Expenses', icon: CreditCard },
      { to: '/payments-made', label: 'Payments made', icon: Wallet },
    ],
  },
];

const SINGLE_LINKS: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: Home },
  { to: '/items', label: 'Items', icon: Package },
];

const LOWER_LINKS: NavEntry[] = [
  { to: '/financial-dashboard', label: 'Financial Hub', icon: CreditCard, staffBlocked: true },
  { to: '/receivables-payables', label: 'Receivables & Payables', icon: ArrowLeftRight },
  { to: '/banking', label: 'Banking', icon: Landmark, staffBlocked: true },
  { to: '/razorpay-payments', label: 'Razorpay payments', icon: IndianRupee, staffBlocked: true },
  { to: '/time-tracking', label: 'Time tracking', icon: FolderOpen },
  { to: '/accounting', label: 'Accountant', icon: BarChart3, staffBlocked: true },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/payroll', label: 'Payroll', icon: Users },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { isAdmin, isStaff } = useAuth();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const lowerLinks = LOWER_LINKS.filter((entry) => !(entry.staffBlocked && isStaff));

  const toggle = (id: string) => setCollapsed((current) => ({ ...current, [id]: !current[id] }));

  return (
    <>
      {open ? <div className="sidebar-backdrop" onClick={onNavigate} aria-hidden="true" /> : null}
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Main navigation">
        <nav className="sidebar-nav">
          {SINGLE_LINKS.map((entry) => (
            <NavLink key={entry.to} to={entry.to} end={entry.to === '/'} className="nav-link" onClick={onNavigate}>
              <entry.icon size={17} aria-hidden="true" />
              <span>{entry.label}</span>
            </NavLink>
          ))}

          {GROUPS.map((group) => {
            const isCollapsed = collapsed[group.id];
            return (
              <div className="nav-group" key={group.id}>
                <button type="button" className="nav-group-toggle" onClick={() => toggle(group.id)} aria-expanded={!isCollapsed}>
                  <group.icon size={17} aria-hidden="true" />
                  <span>{group.label}</span>
                  <ChevronDown size={14} className={`chevron ${isCollapsed ? 'is-collapsed' : ''}`} aria-hidden="true" />
                </button>
                {!isCollapsed ? (
                  <div className="nav-sublist">
                    {group.entries.map((entry) => (
                      <NavLink key={entry.to} to={entry.to} className="nav-link nav-sublink" onClick={onNavigate}>
                        <entry.icon size={15} aria-hidden="true" />
                        <span>{entry.label}</span>
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
              <span>{entry.label}</span>
            </NavLink>
          ))}

          {isAdmin ? (
            <NavLink to="/settings" className="nav-link" onClick={onNavigate}>
              <Building2 size={17} aria-hidden="true" />
              <span>Settings</span>
            </NavLink>
          ) : null}
        </nav>
      </aside>
    </>
  );
}
