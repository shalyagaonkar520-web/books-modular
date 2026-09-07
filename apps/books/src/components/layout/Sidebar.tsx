import React from 'react';
import {
  Home,
  Package,
  ShoppingCart,
  ShoppingBag,
  Clock,
  Landmark,
  Calculator,
  BarChart3,
  FileText,
  DollarSign,
  CreditCard
} from 'lucide-react';

export type NavModule =
  | 'home'
  | 'items'
  | 'sales'
  | 'purchases'
  | 'time_tracking'
  | 'banking'
  | 'accountant'
  | 'reports'
  | 'documents'
  | 'payroll'
  | 'payments';

interface SidebarProps {
  activeModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

interface NavItemDef {
  id: NavModule;
  label: string;
  icon: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navItems: NavItemDef[] = [
    { id: 'home', label: 'Executive Dashboard', icon: <Home size={18} /> },
    { id: 'items', label: 'Inventory & Catalog', icon: <Package size={18} /> },
    { id: 'sales', label: 'Billing & Receivables', icon: <ShoppingCart size={18} /> },
    { id: 'purchases', label: 'Procurement & Payables', icon: <ShoppingBag size={18} /> },
    { id: 'banking', label: 'Treasury & Cash Flow', icon: <Landmark size={18} /> },
    { id: 'time_tracking', label: 'Timesheets & Projects', icon: <Clock size={18} /> },
    { id: 'accountant', label: 'General Ledger & Audit', icon: <Calculator size={18} /> },
    { id: 'reports', label: 'Financial Intelligence', icon: <BarChart3 size={18} /> },
    { id: 'documents', label: 'Compliance Vault', icon: <FileText size={18} /> },
    { id: 'payroll', label: 'Workforce & Payroll', icon: <DollarSign size={18} /> },
    { id: 'payments', label: 'Settlements & UPI', icon: <CreditCard size={18} /> },
  ];

  const handleItemClick = (module: NavModule) => {
    onSelectModule(module);
    if (isOpenMobile) onCloseMobile();
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
            <div className="zb-sidebar-section-title">CORE MODULES</div>
            <nav className="zb-nav-list">
              {navItems.map(item => {
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    className={`zb-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleItemClick(item.id)}
                    title={item.label}
                  >
                    <span className="zb-nav-icon">{item.icon}</span>
                    <span className="zb-nav-label">{item.label}</span>
                  </button>
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

