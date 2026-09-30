import { useState } from 'react';
import {
  Activity,
  Clock,
  Download,
  Shield,
  User as UserIcon,
  Wallet,
} from 'lucide-react';

import { orgApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import type { AuditLog, Payslip, TimeEntry, User } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';

interface UserDashboardModalProps {
  user: User;
  onClose: () => void;
}

type TabKey = 'activity' | 'profile' | 'payslips' | 'time';

export function UserDashboardModal({ user, onClose }: UserDashboardModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [tab, setTab] = useState<TabKey>('activity');

  const { data, loading, error, reload } = useAsync(
    () => orgApi.getUserDashboard(user.id),
    [user.id]
  );

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      await orgApi.downloadUserDashboardPdf(user.id, user.name);
      toast.success(t('settings.userDashboard.pdfDownloaded', { name: user.name }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('settings.userDashboard.pdfFailed'));
    } finally {
      setDownloading(false);
    }
  };

  const auditColumns: Array<Column<AuditLog>> = [
    {
      key: 'timestamp',
      header: t('settings.userDashboard.col.dateTime'),
      width: '180px',
      render: (log) => formatDateTime(log.createdAt),
    },
    {
      key: 'action',
      header: t('settings.userDashboard.col.action'),
      width: '110px',
      render: (log) => <Badge tone="neutral">{log.action.toUpperCase()}</Badge>,
    },
    {
      key: 'entityType',
      header: t('settings.userDashboard.col.entity'),
      width: '130px',
      render: (log) => <span className="strong">{log.entityType}</span>,
    },
    {
      key: 'summary',
      header: t('settings.userDashboard.col.summary'),
      render: (log) => log.summary || '—',
    },
  ];

  const payslipColumns: Array<Column<Payslip>> = [
    { key: 'period', header: t('settings.userDashboard.col.period'), render: (p) => p.periodLabel ?? '—' },
    { key: 'gross', header: t('settings.userDashboard.col.gross'), align: 'right', render: (p) => formatCurrency(p.gross) },
    { key: 'deductions', header: t('settings.userDashboard.col.deductions'), align: 'right', render: (p) => formatCurrency(p.totalDeductions) },
    { key: 'net', header: t('settings.userDashboard.col.netPay'), align: 'right', render: (p) => <strong>{formatCurrency(p.netPay)}</strong> },
    {
      key: 'status',
      header: t('settings.userDashboard.col.status'),
      render: (p) =>
        p.payRunStatus === 'paid'
          ? `${t('settings.userDashboard.payslip.paid')}${p.payDate ? ` · ${formatDate(p.payDate)}` : ''}`
          : t('settings.userDashboard.payslip.approved'),
    },
  ];

  const timeColumns: Array<Column<TimeEntry>> = [
    { key: 'date', header: t('settings.userDashboard.col.date'), render: (entry) => formatDate(entry.date) },
    { key: 'project', header: t('settings.userDashboard.col.project'), render: (entry) => entry.projectName || '—' },
    { key: 'hours', header: t('settings.userDashboard.col.hours'), align: 'right', render: (entry) => entry.hours },
    { key: 'description', header: t('settings.userDashboard.col.notes'), render: (entry) => entry.description ?? '—' },
    { key: 'billable', header: t('settings.userDashboard.col.billable'), render: (entry) => (entry.isBillable ? t('settings.userDashboard.yes') : t('settings.userDashboard.no')) },
  ];

  const hasEmployee = Boolean(data?.employee);

  const availableTabs = [
    { id: 'activity', label: t('settings.userDashboard.tab.activity') },
    ...(hasEmployee
      ? [
          { id: 'profile', label: t('settings.userDashboard.tab.profile') },
          { id: 'payslips', label: t('settings.userDashboard.tab.payslips', { count: data?.payslips?.length ?? 0 }) },
          { id: 'time', label: t('settings.userDashboard.tab.time', { count: data?.timeEntries?.length ?? 0 }) },
        ]
      : []),
  ];

  return (
    <Modal
      open
      title={t('settings.userDashboard.title', { name: user.name })}
      subtitle={`${user.email} · ${user.role.toUpperCase()}`}
      size="xl"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Button
            variant="primary"
            icon={<Download size={15} />}
            loading={downloading}
            onClick={handleDownloadPdf}
          >
            {t('settings.userDashboard.downloadPdf')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('settings.userDashboard.close')}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="stack" style={{ padding: '16px 0' }}>
          <SkeletonRows rows={4} />
        </div>
      ) : error ? (
        <ErrorBlock message={error} onRetry={reload} />
      ) : data ? (
        <div className="stack" style={{ gap: '20px' }}>
          {/* Top Quick Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
            <StatTile
              label={t('settings.userDashboard.stat.role')}
              value={user.role.toUpperCase()}
              icon={<Shield size={16} />}
            />
            <StatTile
              label={t('settings.userDashboard.stat.status')}
              value={!user.isActive ? t('settings.userDashboard.status.deactivated') : user.pendingInvite ? t('settings.userDashboard.status.inviteSent') : t('settings.userDashboard.status.active')}
              icon={<UserIcon size={16} />}
            />
            <StatTile
              label={t('settings.userDashboard.stat.activities')}
              value={String(data.stats.totalActions)}
              icon={<Activity size={16} />}
            />
            {hasEmployee && data.employee ? (
              <>
                <StatTile
                  label={t('settings.userDashboard.stat.monthlyGross')}
                  value={formatCurrency(data.employee.grossSalary)}
                  icon={<Wallet size={16} />}
                />
                <StatTile
                  label={t('settings.userDashboard.stat.loggedHours')}
                  value={t('settings.userDashboard.stat.hours', { hours: data.stats.totalHoursLogged })}
                  icon={<Clock size={16} />}
                />
              </>
            ) : (
              <StatTile
                label={t('settings.userDashboard.stat.lastLogin')}
                value={user.lastLoginAt ? formatDate(user.lastLoginAt) : t('settings.userDashboard.never')}
                icon={<Clock size={16} />}
              />
            )}
          </div>

          {/* Account Overview Card */}
          <Card title={t('settings.userDashboard.overview.title')} subtitle={t('settings.userDashboard.overview.subtitle')}>
            <dl className="detail-grid">
              <div>
                <dt>{t('settings.userDashboard.dt.name')}</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt>{t('settings.userDashboard.dt.email')}</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>{t('settings.userDashboard.dt.role')}</dt>
                <dd>
                  <Badge tone={user.role === 'admin' ? 'info' : 'neutral'}>
                    {user.role}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>{t('settings.userDashboard.dt.status')}</dt>
                <dd>
                  {!user.isActive ? (
                    <Badge tone="neutral">{t('settings.userDashboard.status.deactivated')}</Badge>
                  ) : user.pendingInvite ? (
                    <Badge tone="warning">{t('settings.userDashboard.status.inviteSent')}</Badge>
                  ) : (
                    <Badge tone="success">{t('settings.userDashboard.status.active')}</Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('settings.userDashboard.dt.memberSince')}</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt>{t('settings.userDashboard.dt.lastSignIn')}</dt>
                <dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t('settings.userDashboard.never')}</dd>
              </div>
            </dl>
          </Card>

          {/* Dynamic Tabs */}
          {availableTabs.length > 1 && (
            <Tabs
              tabs={availableTabs}
              active={tab}
              onChange={(id) => setTab(id as TabKey)}
            />
          )}

          {/* Activity Tab */}
          {tab === 'activity' && (
            <Card
              title={t('settings.userDashboard.activity.title')}
              subtitle={t('settings.userDashboard.activity.subtitle')}
            >
              {data.auditLogs.length === 0 ? (
                <EmptyState
                  title={t('settings.userDashboard.activity.empty.title')}
                  description={t('settings.userDashboard.activity.empty.description')}
                />
              ) : (
                <DataTable
                  columns={auditColumns}
                  rows={data.auditLogs}
                  rowKey={(row) => row.id}
                  caption={t('settings.userDashboard.activity.caption')}
                />
              )}
            </Card>
          )}

          {/* Employee Profile Tab */}
          {tab === 'profile' && data.employee && (
            <Card title={t('settings.userDashboard.profile.title')} subtitle={t('settings.userDashboard.profile.subtitle')}>
              <dl className="detail-grid">
                <div>
                  <dt>{t('settings.userDashboard.dt.employeeCode')}</dt>
                  <dd>{data.employee.employeeCode}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.department')}</dt>
                  <dd>{data.employee.department || '—'}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.designation')}</dt>
                  <dd>{data.employee.designation || '—'}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.dateOfJoining')}</dt>
                  <dd>{formatDate(data.employee.dateOfJoining)}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.pan')}</dt>
                  <dd>{data.employee.pan || '—'}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.bankAccount')}</dt>
                  <dd>{data.employee.bankAccountNumberMasked || '—'}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.ifsc')}</dt>
                  <dd>{data.employee.bankIfsc || '—'}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.basicSalary')}</dt>
                  <dd>{formatCurrency(data.employee.basicSalary)}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.hra')}</dt>
                  <dd>{formatCurrency(data.employee.hra)}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.otherAllowances')}</dt>
                  <dd>{formatCurrency(data.employee.otherAllowances)}</dd>
                </div>
                <div>
                  <dt>{t('settings.userDashboard.dt.netSalary')}</dt>
                  <dd className="strong">{formatCurrency(data.employee.netSalary)}</dd>
                </div>
              </dl>
            </Card>
          )}

          {/* Payslips Tab */}
          {tab === 'payslips' && (
            <Card title={t('settings.userDashboard.payslips.title')} subtitle={t('settings.userDashboard.payslips.subtitle')}>
              {data.payslips.length === 0 ? (
                <EmptyState
                  title={t('settings.userDashboard.payslips.empty.title')}
                  description={t('settings.userDashboard.payslips.empty.description')}
                />
              ) : (
                <DataTable
                  columns={payslipColumns}
                  rows={data.payslips}
                  rowKey={(row) => row.id}
                  caption={t('settings.userDashboard.payslips.caption')}
                />
              )}
            </Card>
          )}

          {/* Time Entries Tab */}
          {tab === 'time' && (
            <Card title={t('settings.userDashboard.time.title')} subtitle={t('settings.userDashboard.time.subtitle')}>
              {data.timeEntries.length === 0 ? (
                <EmptyState
                  title={t('settings.userDashboard.time.empty.title')}
                  description={t('settings.userDashboard.time.empty.description')}
                />
              ) : (
                <DataTable
                  columns={timeColumns}
                  rows={data.timeEntries}
                  rowKey={(row) => row.id}
                  caption={t('settings.userDashboard.time.caption')}
                />
              )}
            </Card>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
