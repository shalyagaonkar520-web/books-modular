import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LogOut, User as UserIcon, Wallet } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { employeePortalApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Card, StatTile } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate } from '@/utils/format';
import type { LeaveRecord, Payslip, TimeEntry } from '@/api/types';

type PortalTab = 'payslips' | 'profile' | 'time' | 'leave';

export function EmployeePortalPage() {
  const { t } = useAppContent();
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<PortalTab>('payslips');

  const employee = useAsync(() => employeePortalApi.myEmployee(), []);
  const payslips = useAsync(() => employeePortalApi.myPayslips(), []);
  const timeEntries = useAsync(() => employeePortalApi.myTimeEntries(), []);
  const leaves = useAsync(() => employeePortalApi.myLeaves(), []);

  // useAsync only fetches once on mount, so an admin editing this employee's
  // salary or approving a pay run never reached an already-open portal tab
  // until a hard refresh. Re-pull whenever the tab becomes active again -
  // returning from another app, or switching back from another browser tab.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      employee.reload();
      payslips.reload();
      timeEntries.reload();
      leaves.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // Intentionally run once: the reload() functions from useAsync are stable
    // across renders (memoised on mount), so this listener never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const payslipColumns: Array<Column<Payslip>> = [
    { key: 'period', header: t('portal.payslips.col.period'), render: (p) => p.periodLabel ?? '—' },
    { key: 'gross', header: t('portal.payslips.col.gross'), align: 'right', render: (p) => formatCurrency(p.gross) },
    { key: 'deductions', header: t('portal.payslips.col.deductions'), align: 'right', render: (p) => formatCurrency(p.totalDeductions) },
    { key: 'net', header: t('portal.payslips.col.net'), align: 'right', render: (p) => <strong>{formatCurrency(p.netPay)}</strong> },
    {
      key: 'status',
      header: t('portal.payslips.col.status'),
      render: (p) =>
        p.payRunStatus === 'paid'
          ? p.payDate
            ? t('portal.payslips.status.paidOn', { date: formatDate(p.payDate) })
            : t('portal.payslips.status.paid')
          : t('portal.payslips.status.approved'),
    },
  ];

  const timeColumns: Array<Column<TimeEntry>> = [
    { key: 'date', header: t('portal.time.col.date'), render: (entry) => formatDate(entry.date) },
    { key: 'project', header: t('portal.time.col.project'), render: (entry) => entry.projectName },
    { key: 'hours', header: t('portal.time.col.hours'), align: 'right', render: (entry) => entry.hours },
    { key: 'description', header: t('portal.time.col.notes'), render: (entry) => entry.description ?? '—' },
    { key: 'billable', header: t('portal.time.col.billable'), render: (entry) => (entry.isBillable ? t('portal.time.yes') : t('portal.time.no')) },
  ];

  const leaveColumns: Array<Column<LeaveRecord>> = [
    { key: 'date', header: t('portal.leave.col.date'), render: (l) => formatDate(l.date) },
    { key: 'type', header: t('portal.leave.col.type'), render: (l) => (l.leaveType === 'unpaid' ? t('portal.leave.type.unpaid') : t('portal.leave.type.paid')) },
    { key: 'notes', header: t('portal.leave.col.notes'), render: (l) => l.notes ?? '—' },
  ];

  return (
    <div className="auth-shell" style={{ alignItems: 'flex-start', paddingTop: '32px' }}>
      <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src="/rooman-logo.png" alt="" style={{ height: '36px' }} />
            <div>
              <h1 style={{ margin: 0, fontSize: '18px' }}>{organization?.name ?? t('portal.orgFallback')}</h1>
              <span className="small text-muted">{t('portal.heading', { name: user?.name ?? '' })}</span>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={<LogOut size={14} />} onClick={() => void onSignOut()}>
            {t('portal.signOut')}
          </Button>
        </div>

        <div className="stack">
          <Tabs
            tabs={[
              { id: 'payslips', label: t('portal.tab.payslips') },
              { id: 'profile', label: t('portal.tab.profile') },
              { id: 'leave', label: t('portal.tab.leave') },
              { id: 'time', label: t('portal.tab.time') },
            ]}
            active={tab}
            onChange={(id) => setTab(id as PortalTab)}
          />

          {tab === 'payslips' ? (
            <Card title={t('portal.payslips.title')} subtitle={t('portal.payslips.subtitle')}>
              {payslips.loading ? (
                <SkeletonRows rows={3} />
              ) : payslips.error ? (
                <ErrorBlock message={payslips.error} onRetry={payslips.reload} />
              ) : !payslips.data || payslips.data.length === 0 ? (
                <EmptyState title={t('portal.payslips.empty.title')} description={t('portal.payslips.empty.body')} />
              ) : (
                <DataTable columns={payslipColumns} rows={payslips.data} rowKey={(p) => p.id} caption={t('portal.payslips.title')} />
              )}
            </Card>
          ) : null}

          {tab === 'profile' ? (
            <Card title={t('portal.profile.title')} subtitle={t('portal.profile.subtitle')}>
              {employee.loading ? (
                <SkeletonRows rows={3} />
              ) : employee.error ? (
                <ErrorBlock message={employee.error} onRetry={employee.reload} />
              ) : employee.data ? (
                <div className="stack">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <StatTile label={t('portal.profile.gross')} value={formatCurrency(employee.data.grossSalary)} icon={<Wallet size={16} />} />
                    <StatTile label={t('portal.profile.net')} value={formatCurrency(employee.data.netSalary)} icon={<Wallet size={16} />} />
                    <StatTile label={t('portal.profile.code')} value={employee.data.employeeCode} icon={<UserIcon size={16} />} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    <StatTile
                      label={t('portal.profile.nextPayDate')}
                      value={employee.data.nextPayDate ? formatDate(employee.data.nextPayDate) : '—'}
                      icon={<Wallet size={16} />}
                    />
                    <StatTile label={t('portal.profile.dailyRate')} value={t('portal.profile.perDay', { amount: formatCurrency(employee.data.dailyRate) })} icon={<Wallet size={16} />} />
                    <StatTile
                      label={t('portal.profile.accrued')}
                      value={formatCurrency(employee.data.accruedThisPeriod)}
                      sublabel={t('portal.profile.daysSoFar', { elapsed: employee.data.daysElapsedThisPeriod, total: employee.data.daysInPeriod })}
                      icon={<Wallet size={16} />}
                    />
                  </div>
                  <p className="small text-muted">
                    {t('portal.profile.estimateNote')}
                  </p>
                  <dl className="detail-grid">
                    <div><dt>{t('portal.profile.name')}</dt><dd>{employee.data.name}</dd></div>
                    <div><dt>{t('portal.profile.email')}</dt><dd>{employee.data.email ?? '—'}</dd></div>
                    <div><dt>{t('portal.profile.designation')}</dt><dd>{employee.data.designation ?? '—'}</dd></div>
                    <div><dt>{t('portal.profile.department')}</dt><dd>{employee.data.department ?? '—'}</dd></div>
                    <div><dt>{t('portal.profile.dateOfJoining')}</dt><dd>{formatDate(employee.data.dateOfJoining)}</dd></div>
                    <div><dt>{t('portal.profile.pan')}</dt><dd>{employee.data.pan ?? '—'}</dd></div>
                    <div><dt>{t('portal.profile.bankAccount')}</dt><dd>{employee.data.bankAccountNumberMasked ?? '—'}</dd></div>
                    <div><dt>{t('portal.profile.ifsc')}</dt><dd>{employee.data.bankIfsc ?? '—'}</dd></div>
                  </dl>
                </div>
              ) : null}
            </Card>
          ) : null}

          {tab === 'leave' ? (
            <Card title={t('portal.leave.title')} subtitle={t('portal.leave.subtitle')}>
              {leaves.loading ? (
                <SkeletonRows rows={3} />
              ) : leaves.error ? (
                <ErrorBlock message={leaves.error} onRetry={leaves.reload} />
              ) : !leaves.data || leaves.data.length === 0 ? (
                <EmptyState title={t('portal.leave.empty')} />
              ) : (
                <DataTable columns={leaveColumns} rows={leaves.data} rowKey={(l) => l.id} caption={t('portal.leave.title')} />
              )}
            </Card>
          ) : null}

          {tab === 'time' ? (
            <Card title={t('portal.time.title')} subtitle={t('portal.time.subtitle')}>
              {timeEntries.loading ? (
                <SkeletonRows rows={3} />
              ) : timeEntries.error ? (
                <ErrorBlock message={timeEntries.error} onRetry={timeEntries.reload} />
              ) : !timeEntries.data || timeEntries.data.length === 0 ? (
                <EmptyState title={t('portal.time.empty')} icon={<Clock size={20} />} />
              ) : (
                <DataTable columns={timeColumns} rows={timeEntries.data} rowKey={(entry) => entry.id} caption={t('portal.time.title')} />
              )}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
