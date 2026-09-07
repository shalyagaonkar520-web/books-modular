import React, { useState } from 'react';
import {
  Home,
  Package,
  Boxes,
  ShoppingCart,
  ShoppingBag,
  Clock,
  Landmark,
  Calculator,
  BarChart3,
  FileText,
  DollarSign,
  CreditCard,
  ChevronRight,
  ChevronDown,
  Plus
} from 'lucide-react';

export type NavModule =
  | 'home'
  | 'items'
  | 'inventory'
  | 'sales'
  | 'purchases'
  | 'banking'
  | 'time_tracking'
  | 'accountant'
  | 'reports'
  | 'documents'
  | 'payroll'
  | 'payments';

export interface SubItemDef {
  id: string;
  label: string;
  hasQuickAdd?: boolean;
}

export interface NavItemDef {
  id: NavModule;
  label: string;
  icon: React.ReactNode;
  subItems?: SubItemDef[];
}

interface SidebarProps {
  activeModule: NavModule;
  activeSubItem?: string | null;
  onSelectModule: (module: NavModule, subItemId?: string) => void;
  onQuickAdd?: (module: NavModule, subItemId: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  activeSubItem,
  onSelectModule,
  onQuickAdd,
  isOpenMobile,
  onCloseMobile,
}) => {
  // Track open state of accordion modules
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    items: true,
    inventory: true,
    sales: true,
    purchases: true,
    banking: false,
    time_tracking: false,
    accountant: false,
    reports: true,
    documents: false,
    payroll: false,
    payments: false,
  });

  const navItems: NavItemDef[] = [
    {
      id: 'home',
      label: 'Home',
      icon: <Home size={18} />
    },
    {
      id: 'items',
      label: 'Items',
      icon: <Package size={18} />,
      subItems: [
        { id: 'items_list', label: 'Items', hasQuickAdd: true },
        { id: 'item_groups', label: 'Item Groups', hasQuickAdd: true },
        { id: 'price_lists', label: 'Price Lists' },
      ]
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: <Boxes size={18} />,
      subItems: [
        { id: 'inv_adjustments', label: 'Inventory Adjustments', hasQuickAdd: true },
        { id: 'packages', label: 'Packages', hasQuickAdd: true },
        { id: 'shipments', label: 'Shipments', hasQuickAdd: true },
        { id: 'move_orders', label: 'Move Orders' },
        { id: 'putaways', label: 'Putaways' },
      ]
    },
    {
      id: 'sales',
      label: 'Sales',
      icon: <ShoppingCart size={18} />,
      subItems: [
        { id: 'customers', label: 'Customers', hasQuickAdd: true },
        { id: 'sales_orders', label: 'Sales Orders', hasQuickAdd: true },
        { id: 'invoices', label: 'Invoices', hasQuickAdd: true },
        { id: 'delivery_challans', label: 'Delivery Challans', hasQuickAdd: true },
        { id: 'payments_received', label: 'Payments Received', hasQuickAdd: true },
        { id: 'sales_returns', label: 'Sales Returns' },
        { id: 'credit_notes', label: 'Credit Notes', hasQuickAdd: true },
      ]
    },
    {
      id: 'purchases',
      label: 'Purchases',
      icon: <ShoppingBag size={18} />,
      subItems: [
        { id: 'vendors', label: 'Vendors', hasQuickAdd: true },
        { id: 'expenses', label: 'Expenses', hasQuickAdd: true },
        { id: 'purchase_orders', label: 'Purchase Orders', hasQuickAdd: true },
        { id: 'purchase_receives', label: 'Purchase Receives', hasQuickAdd: true },
        { id: 'bills', label: 'Bills', hasQuickAdd: true },
        { id: 'payments_made', label: 'Payments Made', hasQuickAdd: true },
        { id: 'vendor_credits', label: 'Vendor Credits', hasQuickAdd: true },
      ]
    },
    {
      id: 'banking',
      label: 'Banking',
      icon: <Landmark size={18} />,
      subItems: [
        { id: 'bank_accounts', label: 'Bank Accounts', hasQuickAdd: true },
        { id: 'reconciliation', label: 'Reconciliation' },
        { id: 'bank_rules', label: 'Banking Rules' },
      ]
    },
    {
      id: 'time_tracking',
      label: 'Time Tracking',
      icon: <Clock size={18} />,
      subItems: [
        { id: 'timesheets', label: 'Timesheets', hasQuickAdd: true },
        { id: 'projects', label: 'Projects', hasQuickAdd: true },
      ]
    },
    {
      id: 'accountant',
      label: 'Accountant',
      icon: <Calculator size={18} />,
      subItems: [
        { id: 'manual_journals', label: 'Manual Journals', hasQuickAdd: true },
        { id: 'chart_of_accounts', label: 'Chart of Accounts' },
        { id: 'trial_balance', label: 'Trial Balance' },
        { id: 'lock_period', label: 'Lock Period' },
      ]
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: <BarChart3 size={18} />,
      subItems: [
        { id: 'rep_sales', label: 'Sales' },
        { id: 'rep_inventory', label: 'Inventory' },
        { id: 'rep_receivables', label: 'Receivables' },
        { id: 'rep_payments', label: 'Payments Received' },
        { id: 'rep_payables', label: 'Payables' },
        { id: 'rep_purchases', label: 'Purchases & Expenses' },
      ]
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: <FileText size={18} />,
      subItems: [
        { id: 'all_documents', label: 'All Documents', hasQuickAdd: true },
        { id: 'autoscan_ocr', label: 'AutoScan OCR' },
        { id: 'receipts_bills', label: 'Receipts & Bills' },
      ]
    },
    {
      id: 'payroll',
      label: 'Payroll',
      icon: <DollarSign size={18} />,
      subItems: [
        { id: 'employees', label: 'Employees', hasQuickAdd: true },
        { id: 'salary_runs', label: 'Salary Runs' },
        { id: 'payslips', label: 'Payslips' },
      ]
    },
    {
      id: 'payments',
      label: 'Payments',
      icon: <CreditCard size={18} />,
      subItems: [
        { id: 'payment_links', label: 'Payment Links', hasQuickAdd: true },
        { id: 'upi_qr', label: 'UPI QR Codes' },
        { id: 'transactions', label: 'Transactions' },
      ]
    },
  ];

  const toggleExpand = (moduleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  const handleParentClick = (item: NavItemDef) => {
    if (item.subItems && item.subItems.length > 0) {
      // Auto-expand if collapsed
      setExpandedModules(prev => ({
        ...prev,
        [item.id]: true
      }));
      onSelectModule(item.id, item.subItems[0].id);
    } else {
      onSelectModule(item.id);
    }
    if (isOpenMobile) onCloseMobile();
  };

  const handleSubItemClick = (moduleId: NavModule, subItemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectModule(moduleId, subItemId);
    if (isOpenMobile) onCloseMobile();
  };

  const handleQuickAddClick = (moduleId: NavModule, subItemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQuickAdd) {
      onQuickAdd(moduleId, subItemId);
    } else {
      onSelectModule(moduleId, subItemId);
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div className="zb-sidebar-backdrop" onClick={onCloseMobile} />
      )}

      <aside className={`zb-sidebar ${isOpenMobile ? 'open-mobile' : ''}`}>
        <div className="zb-sidebar-content">
          <div className="zb-sidebar-section">
            <nav className="zb-nav-list">
              {navItems.map(item => {
                const isParentActive = activeModule === item.id;
                const hasSubs = !!(item.subItems && item.subItems.length > 0);
                const isExpanded = !!expandedModules[item.id];

                return (
                  <div key={item.id} className="zb-nav-group">
                    <button
                      className={`zb-nav-item ${isParentActive ? 'active' : ''} ${hasSubs ? 'has-subs' : ''}`}
                      onClick={() => handleParentClick(item)}
                      title={item.label}
                    >
                      <div className="zb-nav-item-left">
                        {hasSubs ? (
                          <span
                            className="zb-nav-chevron"
                            onClick={(e) => toggleExpand(item.id, e)}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        ) : (
                          <span className="zb-nav-chevron-spacer" />
                        )}
                        <span className="zb-nav-icon">{item.icon}</span>
                        <span className="zb-nav-label">{item.label}</span>
                      </div>
                    </button>

                    {/* Expandable Sub-items */}
                    {hasSubs && isExpanded && (
                      <div className="zb-sidebar-sublist">
                        {item.subItems!.map(sub => {
                          const isSubActive = isParentActive && activeSubItem === sub.id;
                          return (
                            <button
                              key={sub.id}
                              className={`zb-sidebar-subitem ${isSubActive ? 'active' : ''}`}
                              onClick={(e) => handleSubItemClick(item.id, sub.id, e)}
                              title={sub.label}
                            >
                              <span className="zb-subitem-label">{sub.label}</span>
                              {sub.hasQuickAdd && (
                                <span
                                  className="zb-subitem-add-btn"
                                  onClick={(e) => handleQuickAddClick(item.id, sub.id, e)}
                                  title={`Quick Add ${sub.label}`}
                                >
                                  <Plus size={12} />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer status */}
        <div className="zb-sidebar-footer">
          <div className="zb-app-status-badge">
            <span className="zb-status-dot"></span>
            <span>All Modules Unlocked</span>
          </div>
        </div>
      </aside>
    </>
  );
};
