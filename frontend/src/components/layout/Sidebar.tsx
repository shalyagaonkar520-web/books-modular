import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  Building,
  Building2,
  ChevronDown,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileMinus,
  FileText,
  FolderOpen,
  Home,
  IndianRupee,
  Landmark,
  Package,
  PiggyBank,
  Receipt,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Undo2,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react';

import type { AppModuleKey } from '@/api/appContent';
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

const GROUPS: NavGroup[] = [
  {
    id: 'sales',
    label: 'sidebar.sales',
    icon: ShoppingCart,
    entries: [
      { to: '/customers', label: 'sidebar.customers', icon: Users, module: 'customers' },
      { to: '/quotes', label: 'sidebar.quotes', icon: FileText, module: 'invoices' },
      { to: '/sales-orders', label: 'sidebar.salesOrders', icon: ClipboardList, module: 'invoices' },
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
  { to: '/gst-filing', label: 'sidebar.gstFiling', icon: FileCheck2, module: 'reports' },
  { to: '/documents', label: 'sidebar.documents', icon: FolderOpen, module: 'documents' },
  { to: '/payroll', label: 'sidebar.payroll', icon: Users, staffBlocked: true, module: 'payroll' },
];

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
