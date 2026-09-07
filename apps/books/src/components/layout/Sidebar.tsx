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

interface NavSectionDef {
  title: string;
  items: NavItemDef[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  isOpenMobile,
  onCloseMobile,
}) => {
  const navSections: NavSectionDef[] = [
    {
      title: 'CORE PLATFORM',
      items: [
        { id: 'home', label: 'Dashboard Overview', icon: <Home size={18} /> },
        { id: 'items', label: 'Items & Inventory', icon: <Package size={18} /> },
      ],
    },
    {
      title: 'CASH FLOW & SALES',
      items: [
        { id: 'sales', label: 'Sales & Invoices', icon: <ShoppingCart size={18} /> },
        { id: 'purchases', label: 'Purchases & Bills', icon: <ShoppingBag size={18} /> },
        { id: 'banking', label: 'Banking & Feeds', icon: <Landmark size={18} /> },
        { id: 'payments', label: 'Payments & UPI', icon: <CreditCard size={18} /> },
      ],
    },
    {
      title: 'FINANCE & AUDIT',
      items: [
        { id: 'time_tracking', label: 'Time Tracking', icon: <Clock size={18} /> },
        { id: 'accountant', label: 'Accounting & Journals', icon: <Calculator size={18} /> },
        { id: 'reports', label: 'Financial Reports', icon: <BarChart3 size={18} /> },
        { id: 'payroll', label: 'Payroll & HR', icon: <DollarSign size={18} /> },
        { id: 'documents', label: 'Document Vault', icon: <FileText size={18} /> },
      ],
    },
  ];

  const handleItemClick = (module: NavModule) => {
    onSelectModule(module);
    if (isOpenMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div className="rf-sidebar-backdrop zb-sidebar-backdrop" onClick={onCloseMobile} />
      )}

      <aside className={`rf-sidebar zb-sidebar ${isOpenMobile ? 'open-mobile' : ''}`}>
        <div className="rf-sidebar-content zb-sidebar-content">
          {navSections.map(section => (
            <div key={section.title} className="rf-sidebar-section zb-sidebar-section">
              <div className="rf-sidebar-section-title zb-sidebar-section-title">{section.title}</div>
              <nav className="rf-nav-list zb-nav-list">
                {section.items.map(item => {
                  const isActive = activeModule === item.id;
                  return (
                    <button
                      key={item.id}
                      className={`rf-nav-item zb-nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => handleItemClick(item.id)}
                      title={item.label}
                    >
                      <span className="rf-nav-icon zb-nav-icon">{item.icon}</span>
                      <span className="rf-nav-label zb-nav-label">{item.label}</span>
                      {isActive && <span className="rf-active-indicator"></span>}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Sidebar Footer status */}
        <div className="rf-sidebar-footer zb-sidebar-footer">
          <div className="rf-app-status-badge zb-app-status-badge">
            <span className="rf-status-dot-pulse zb-status-dot"></span>
            <span>All 11 Modules Active</span>
          </div>
        </div>
      </aside>
    </>
  );
};

