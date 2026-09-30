import { useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useAuth } from '@/auth/AuthContext';

import { EmployeesTab } from './EmployeesTab';
import { PayRunsTab } from './PayRunsTab';

type PayrollTab = 'employees' | 'pay_runs';

export function PayrollPage() {
  const { t } = useAppContent();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<PayrollTab>('employees');

  return (
    <div className="stack">
      <PageHeader
        title={t('payroll.title')}
        subtitle={isAdmin ? t('payroll.subtitle') : t('payroll.subtitleReadOnly')}
      />
      <Tabs
        tabs={[
          { id: 'employees', label: t('payroll.tab.employees') },
          { id: 'pay_runs', label: t('payroll.tab.payRuns') },
        ]}
        active={tab}
        onChange={(id) => setTab(id as PayrollTab)}
      />
      {tab === 'employees' ? <EmployeesTab /> : <PayRunsTab />}
    </div>
  );
}
