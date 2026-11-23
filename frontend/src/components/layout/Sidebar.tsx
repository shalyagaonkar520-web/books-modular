import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  Calculator,
  Building,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileMinus,
  FileText,
  FolderOpen,
  Home,
  IndianRupee,
  Landmark,
  Lightbulb,
  Package,
  ScanBarcode,
  PiggyBank,
  Search,
  Receipt,
  Repeat,
  Sparkles,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  Zap,
} from 'lucide-react';

import type { AppModuleKey } from '@/api/appContent';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { initials } from '@/utils/format';
import { featureForPath } from '@/utils/permissions';

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

const GROUPS: NavGroup[] = [
  {
    id: 'sales',
    label: 'sidebar.sales',
    icon: ShoppingCart,
    entries: [
      { to: '/customers', label: 'sidebar.customers', icon: Users, module: 'customers' },
      { to: '/quotes', label: 'sidebar.quotes', icon: FileText, module: 'invoices' },
      { to: '/sales-orders', label: 'sidebar.salesOrders', icon: ClipboardList, module: 'invoices' },
      { to: '/delivery-challans', label: 'sidebar.deliveryChallans', icon: Truck, module: 'invoices' },
      { to: '/invoices', label: 'sidebar.invoices', icon: FileText, module: 'invoices' },
      { to: '/recurring-invoices', label: 'sidebar.recurringInvoices', icon: Repeat, module: 'invoices' },
      { to: '/credit-notes', label: 'sidebar.creditNotes', icon: FileMinus, module: 'invoices' },
      { to: '/payments-received', label: 'sidebar.paymentsReceived', icon: Wallet, module: 'paymentsReceived' },
      { to: '/refunds', label: 'sidebar.refunds', icon: Undo2, module: 'paymentsReceived' },
    ],
  },
  {
    id: 'purchases',
    label: 'sidebar.purchases',
    icon: ShoppingBag,
    entries: [
      { to: '/expense-dashboard', label: 'sidebar.expenseDashboard', icon: BarChart3, module: 'expenseDashboard' },
      { to: '/vendors', label: 'sidebar.vendors', icon: Building2, module: 'vendors' },
      { to: '/purchase-orders', label: 'sidebar.purchaseOrders', icon: ClipboardList, module: 'bills' },
      { to: '/bills', label: 'sidebar.bills', icon: Receipt, module: 'bills' },
      { to: '/recurring-bills', label: 'sidebar.recurringBills', icon: Repeat, module: 'bills' },
      { to: '/vendor-credits', label: 'sidebar.vendorCredits', icon: FileMinus, module: 'bills' },
      { to: '/expenses', label: 'sidebar.expenses', icon: CreditCard, module: 'expenses' },
      { to: '/payments-made', label: 'sidebar.paymentsMade', icon: Wallet, module: 'paymentsMade' },
    ],
  },
];

const SINGLE_LINKS: NavEntry[] = [
  { to: '/dashboard', label: 'sidebar.dashboard', icon: Home },
  { to: '/ai-assistant', label: 'sidebar.aiAssistant', icon: Sparkles },
  { to: '/insights', label: 'sidebar.insights', icon: Lightbulb, staffBlocked: true },
  { to: '/pos', label: 'sidebar.pos', icon: ScanBarcode, module: 'pos' },
  { to: '/items', label: 'sidebar.items', icon: Package, module: 'items' },
  { to: '/inventory', label: 'sidebar.inventory', icon: Warehouse, module: 'items' },
];

const LOWER_LINKS: NavEntry[] = [
  { to: '/financial-dashboard', label: 'sidebar.financialHub', icon: CreditCard, staffBlocked: true, module: 'financialHub' },
  { to: '/receivables-payables', label: 'sidebar.receivablesPayables', icon: ArrowLeftRight, module: 'receivablesPayables' },
  { to: '/banking', label: 'sidebar.banking', icon: Landmark, staffBlocked: true, module: 'banking' },
  { to: '/razorpay-payments', label: 'sidebar.razorpay', icon: IndianRupee, staffBlocked: true, module: 'razorpay' },
  { to: '/time-tracking', label: 'sidebar.timeTracking', icon: FolderOpen, module: 'timeTracking' },
  { to: '/accounting', label: 'sidebar.accounting', icon: BarChart3, staffBlocked: true, module: 'accounting' },
  { to: '/fixed-assets', label: 'sidebar.fixedAssets', icon: Building, staffBlocked: true, module: 'accounting' },
  { to: '/budgets', label: 'sidebar.budgets', icon: PiggyBank, staffBlocked: true, module: 'accounting' },
  { to: '/recurring-journals', label: 'sidebar.recurringJournals', icon: Repeat, staffBlocked: true, module: 'accounting' },
  { to: '/reports', label: 'sidebar.reports', icon: BarChart3, module: 'reports' },
  { to: '/gst-filing', label: 'sidebar.gstFiling', icon: FileCheck2, staffBlocked: true, module: 'reports' },
  { to: '/income-tax', label: 'sidebar.incomeTax', icon: Calculator, module: 'reports' },
  { to: '/documents', label: 'sidebar.documents', icon: FolderOpen, module: 'documents' },
  { to: '/payroll', label: 'sidebar.payroll', icon: Users, staffBlocked: true, module: 'payroll' },
];

/** Every page the sidebar shows this user (modules and role applied): the Ctrl+K palette searches them. */
export function useVisiblePages(): Array<{ to: string; label: string }> {
  const { isStaff, access } = useAuth();
  const { t, isModuleEnabled } = useAppContent();
  const visible = (entry: NavEntry) =>
    !(entry.staffBlocked && isStaff) && (!entry.module || isModuleEnabled(entry.module)) && access(featureForPath(entry.to)) !== 'none';
  return [...SINGLE_LINKS, ...GROUPS.flatMap((group) => group.entries), ...LOWER_LINKS]
    .filter(visible)
    .map((entry) => ({ to: entry.to, label: t(entry.label) }));
}

/** Each page gets a colour tile, the same one every time (like app icons). */
const TILE_COUNT = 8;
function tileClass(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `sg-t${h % TILE_COUNT}`;
}

const PIN_KEY = 'rooman.sidebar.pinned';

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { isAdmin, isStaff, access, user, organization } = useAuth();
  const { t, isModuleEnabled } = useAppContent();
  const { pathname } = useLocation();
  // Groups start closed; the one holding the current page opens itself. A click overrides either way.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // Pinned open (stays wide) or the slim icon rail that opens while the pointer is on it.
  const [pinned, setPinned] = useState(() => {
    try {
      return window.localStorage.getItem(PIN_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(PIN_KEY, pinned ? '1' : '0');
    } catch {
      /* private mode */
    }
  }, [pinned]);
  const holdsCurrentPage = (group: NavGroup) => group.entries.some((e) => pathname === e.to || pathname.startsWith(`${e.to}/`));
  // A custom role hides the features it gives No access to.
  const enabled = (entry: NavEntry) => (!entry.module || isModuleEnabled(entry.module)) && access(featureForPath(entry.to)) !== 'none';
  const singleLinks = SINGLE_LINKS.filter((entry) => !(entry.staffBlocked && isStaff) && enabled(entry));
  const groups = GROUPS.map((group) => ({ ...group, entries: group.entries.filter(enabled) })).filter((group) => group.entries.length > 0);
  const lowerLinks = LOWER_LINKS.filter((entry) => !(entry.staffBlocked && isStaff) && enabled(entry));

  const toggle = (group: NavGroup) => setOpenGroups((current) => ({ ...current, [group.id]: !(current[group.id] ?? holdsCurrentPage(group)) }));
  // The search box opens the same palette as Ctrl+K.
  const openSearch = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));

  const link = (entry: NavEntry) => (
    <NavLink key={entry.to} to={entry.to} end={entry.to === '/'} className="nav-link" onClick={onNavigate} title={t(entry.label)}>
      <i className={`sg-tile ${tileClass(entry.to)}`}>
        <entry.icon size={17} aria-hidden="true" />
      </i>
      <span>{t(entry.label)}</span>
    </NavLink>
  );
  const section = (label: string) => (
    <div className="sg-section" aria-hidden="true">
      <span className="sg-hide-rail">{label}</span>
    </div>
  );
  const orgName = organization?.name ?? 'Rooman Books';

  return (
    <>
      {open ? <div className="sidebar-backdrop" onClick={onNavigate} aria-hidden="true" /> : null}
      <aside className={`sidebar sg ${open ? 'is-open' : ''} ${pinned ? 'is-pinned' : ''}`} aria-label={t('sidebar.ariaLabel')}>
        <div className="sg-head">
          <i className="sg-brand" aria-hidden="true">
            {initials(orgName).slice(0, 1) || 'R'}
          </i>
          <div className="sg-hide-rail sg-head-text">
            <strong>{orgName}</strong>
            <small>Rooman Books</small>
          </div>
          <button type="button" className="sg-pin sg-hide-rail" aria-pressed={pinned} aria-label={pinned ? 'Let the sidebar collapse' : 'Keep the sidebar open'} title={pinned ? 'Collapse' : 'Keep open'} onClick={() => setPinned((p) => !p)}>
            {pinned ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
        </div>

        <button type="button" className="sg-search" onClick={openSearch} aria-label="Search pages (Ctrl+K)" title="Search (Ctrl+K)">
          <Search size={15} aria-hidden="true" />
          <span className="sg-hide-rail">Search</span>
          <kbd className="sg-hide-rail">Ctrl K</kbd>
        </button>

        <nav className="sidebar-nav">
          {singleLinks.length ? section('Main') : null}
          {singleLinks.map(link)}

          {groups.length ? section('Sales & purchases') : null}
          {groups.map((group) => {
            const isCollapsed = !(openGroups[group.id] ?? holdsCurrentPage(group));
            return (
              <div className="nav-group" key={group.id}>
                <button type="button" className="nav-group-toggle" onClick={() => toggle(group)} aria-expanded={!isCollapsed} title={t(group.label)}>
                  <i className={`sg-tile ${tileClass(group.id)}`}>
                    <group.icon size={17} aria-hidden="true" />
                  </i>
                  <span>{t(group.label)}</span>
                  <ChevronDown size={14} className={`chevron ${isCollapsed ? 'is-collapsed' : ''}`} aria-hidden="true" />
                </button>
                {!isCollapsed ? (
                  <div className="nav-sublist">
                    {group.entries.map((entry) => (
                      <NavLink key={entry.to} to={entry.to} className="nav-link nav-sublink" onClick={onNavigate} title={t(entry.label)}>
                        <entry.icon size={15} aria-hidden="true" />
                        <span>{t(entry.label)}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          {lowerLinks.length ? section('Finance & reports') : null}
          {lowerLinks.map(link)}

          {isAdmin ? section('Admin') : null}
          {isAdmin ? link({ to: '/automation', label: 'sidebar.automation', icon: Zap }) : null}
          {isAdmin ? link({ to: '/settings', label: 'sidebar.settings', icon: Building2 }) : null}
        </nav>

        {user ? (
          <NavLink to="/profile" className="sg-user" onClick={onNavigate} title={`${user.name} (${user.email})`}>
            <i className="sg-avatar">
              {initials(user.name)}
              <b className="sg-dot" />
            </i>
            <div className="sg-hide-rail sg-user-text">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
            <ChevronRight size={14} className="sg-hide-rail sg-user-chev" aria-hidden="true" />
          </NavLink>
        ) : null}
      </aside>
    </>
  );
}
