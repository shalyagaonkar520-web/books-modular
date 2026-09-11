import { useState } from 'react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useAuth } from '@/auth/AuthContext';

import { EmployeesTab } from './EmployeesTab';
import { PayRunsTab } from './PayRunsTab';

type PayrollTab = 'employees' | 'pay_runs';

export function PayrollPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<PayrollTab>('employees');

  return (
    <div className="stack">
      <PageHeader
        title="Payroll"
        subtitle={
          isAdmin
            ? 'Maintain salary structures, then draft, approve and pay monthly pay runs'
            : 'Salary structures and monthly pay runs (read-only — ask an administrator to make changes)'
        }
      />
      <Tabs
        tabs={[
          { id: 'employees', label: 'Employees' },
          { id: 'pay_runs', label: 'Pay runs' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as PayrollTab)}
      />
      {tab === 'employees' ? <EmployeesTab /> : <PayRunsTab />}
    </div>
  );
}
