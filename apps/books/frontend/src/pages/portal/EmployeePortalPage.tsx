import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LogOut, User as UserIcon, Wallet } from 'lucide-react';

import { employeePortalApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Card, StatTile } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate } from '@/utils/format';
import type { Payslip, TimeEntry } from '@/api/types';

type PortalTab = 'payslips' | 'profile' | 'time';

export function EmployeePortalPage() {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<PortalTab>('payslips');

  const employee = useAsync(() => employeePortalApi.myEmployee(), []);
  const payslips = useAsync(() => employeePortalApi.myPayslips(), []);
  const timeEntries = useAsync(() => employeePortalApi.myTimeEntries(), []);

  const onSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const payslipColumns: Array<Column<Payslip>> = [
    { key: 'period', header: 'Period', render: (p) => p.periodLabel ?? '—' },
    { key: 'gross', header: 'Gross', align: 'right', render: (p) => formatCurrency(p.gross) },
    { key: 'deductions', header: 'Deductions', align: 'right', render: (p) => formatCurrency(p.totalDeductions) },
    { key: 'net', header: 'Net pay', align: 'right', render: (p) => <strong>{formatCurrency(p.netPay)}</strong> },
    { key: 'status', header: 'Status', render: (p) => (p.payRunStatus === 'paid' ? `Paid${p.payDate ? ` · ${formatDate(p.payDate)}` : ''}` : 'Approved') },
  ];

  const timeColumns: Array<Column<TimeEntry>> = [
    { key: 'date', header: 'Date', render: (t) => formatDate(t.date) },
    { key: 'project', header: 'Project', render: (t) => t.projectName },
    { key: 'hours', header: 'Hours', align: 'right', render: (t) => t.hours },
    { key: 'description', header: 'Notes', render: (t) => t.description ?? '—' },
    { key: 'billable', header: 'Billable', render: (t) => (t.isBillable ? 'Yes' : 'No') },
  ];

  return (
    <div className="auth-shell" style={{ alignItems: 'flex-start', paddingTop: '32px' }}>
      <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/rooman-logo.png" alt="" style={{ height: '36px' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: '18px' }}>{organization?.name ?? 'Rooman Books'}</h1>
              <span className="small text-muted">Employee portal — {user?.name}</span>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={<LogOut size={14} />} onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </div>

        <div className="stack">
          <Tabs
            tabs={[
              { id: 'payslips', label: 'My Payslips' },
              { id: 'profile', label: 'My Profile' },
              { id: 'time', label: 'My Time Entries' },
            ]}
            active={tab}
            onChange={(id) => setTab(id as PortalTab)}
          />

          {tab === 'payslips' ? (
            <Card title="Payslips" subtitle="Approved and paid pay runs that include you">
              {payslips.loading ? (
                <SkeletonRows rows={3} />
              ) : payslips.error ? (
                <ErrorBlock message={payslips.error} onRetry={payslips.reload} />
              ) : !payslips.data || payslips.data.length === 0 ? (
                <EmptyState title="No payslips yet" description="They'll appear here once a pay run including you is approved." />
              ) : (
                <DataTable columns={payslipColumns} rows={payslips.data} rowKey={(p) => p.id} caption="Payslips" />
              )}
            </Card>
          ) : null}

          {tab === 'profile' ? (
            <Card title="My profile" subtitle="Read-only — ask an administrator to update these details">
              {employee.loading ? (
                <SkeletonRows rows={3} />
              ) : employee.error ? (
                <ErrorBlock message={employee.error} onRetry={employee.reload} />
              ) : employee.data ? (
                <div className="stack">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <StatTile label="Gross salary" value={formatCurrency(employee.data.grossSalary)} icon={<Wallet size={16} />} />
                    <StatTile label="Net salary" value={formatCurrency(employee.data.netSalary)} icon={<Wallet size={16} />} />
                    <StatTile label="Employee code" value={employee.data.employeeCode} icon={<UserIcon size={16} />} />
                  </div>
                  <dl className="detail-grid">
                    <div><dt>Name</dt><dd>{employee.data.name}</dd></div>
                    <div><dt>Email</dt><dd>{employee.data.email ?? '—'}</dd></div>
                    <div><dt>Designation</dt><dd>{employee.data.designation ?? '—'}</dd></div>
                    <div><dt>Department</dt><dd>{employee.data.department ?? '—'}</dd></div>
                    <div><dt>Date of joining</dt><dd>{formatDate(employee.data.dateOfJoining)}</dd></div>
                    <div><dt>PAN</dt><dd>{employee.data.pan ?? '—'}</dd></div>
                    <div><dt>Bank account</dt><dd>{employee.data.bankAccountNumberMasked ?? '—'}</dd></div>
                    <div><dt>IFSC</dt><dd>{employee.data.bankIfsc ?? '—'}</dd></div>
                  </dl>
                </div>
              ) : null}
            </Card>
          ) : null}

          {tab === 'time' ? (
            <Card title="Time entries" subtitle="Hours logged against your account by an administrator or staff member">
              {timeEntries.loading ? (
                <SkeletonRows rows={3} />
              ) : timeEntries.error ? (
                <ErrorBlock message={timeEntries.error} onRetry={timeEntries.reload} />
              ) : !timeEntries.data || timeEntries.data.length === 0 ? (
                <EmptyState title="No time entries yet" icon={<Clock size={20} />} />
              ) : (
                <DataTable columns={timeColumns} rows={timeEntries.data} rowKey={(t) => t.id} caption="Time entries" />
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
