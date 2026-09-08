import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useAuth } from '@/auth/AuthContext';
import { EmployeesTab } from './EmployeesTab';
import { PayRunsTab } from './PayRunsTab';
export function PayrollPage() {
    const { isAdmin } = useAuth();
    const [tab, setTab] = useState('employees');
    return (_jsxs("div", { className: "stack", children: [_jsx(PageHeader, { title: "Payroll", subtitle: isAdmin
                    ? 'Maintain salary structures, then draft, approve and pay monthly pay runs'
                    : 'Salary structures and monthly pay runs (read-only — ask an administrator to make changes)' }), _jsx(Tabs, { tabs: [
                    { id: 'employees', label: 'Employees' },
                    { id: 'pay_runs', label: 'Pay runs' },
                ], active: tab, onChange: (id) => setTab(id) }), tab === 'employees' ? _jsx(EmployeesTab, {}) : _jsx(PayRunsTab, {})] }));
}
