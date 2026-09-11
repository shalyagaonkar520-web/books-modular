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
      toast.success(`Dashboard PDF for ${user.name} downloaded successfully.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const auditColumns: Array<Column<AuditLog>> = [
    {
      key: 'timestamp',
      header: 'Date & Time',
      width: '180px',
      render: (log) => formatDateTime(log.createdAt),
    },
    {
      key: 'action',
      header: 'Action',
      width: '110px',
      render: (log) => <Badge tone="neutral">{log.action.toUpperCase()}</Badge>,
    },
    {
      key: 'entityType',
      header: 'Entity',
      width: '130px',
      render: (log) => <span className="strong">{log.entityType}</span>,
    },
    {
      key: 'summary',
      header: 'Summary / Details',
      render: (log) => log.summary || '—',
    },
  ];

  const payslipColumns: Array<Column<Payslip>> = [
    { key: 'period', header: 'Period', render: (p) => p.periodLabel ?? '—' },
    { key: 'gross', header: 'Gross', align: 'right', render: (p) => formatCurrency(p.gross) },
    { key: 'deductions', header: 'Deductions', align: 'right', render: (p) => formatCurrency(p.totalDeductions) },
    { key: 'net', header: 'Net pay', align: 'right', render: (p) => <strong>{formatCurrency(p.netPay)}</strong> },
    {
      key: 'status',
      header: 'Status',
      render: (p) =>
        p.payRunStatus === 'paid'
          ? `Paid${p.payDate ? ` · ${formatDate(p.payDate)}` : ''}`
          : 'Approved',
    },
  ];

  const timeColumns: Array<Column<TimeEntry>> = [
    { key: 'date', header: 'Date', render: (t) => formatDate(t.date) },
    { key: 'project', header: 'Project', render: (t) => t.projectName || '—' },
    { key: 'hours', header: 'Hours', align: 'right', render: (t) => t.hours },
    { key: 'description', header: 'Notes', render: (t) => t.description ?? '—' },
    { key: 'billable', header: 'Billable', render: (t) => (t.isBillable ? 'Yes' : 'No') },
  ];

  const hasEmployee = Boolean(data?.employee);

  const availableTabs = [
    { id: 'activity', label: 'Activity & Audit Trail' },
    ...(hasEmployee
      ? [
          { id: 'profile', label: 'Employee Profile' },
          { id: 'payslips', label: `Payslips (${data?.payslips?.length ?? 0})` },
          { id: 'time', label: `Time Entries (${data?.timeEntries?.length ?? 0})` },
        ]
      : []),
  ];

  return (
    <Modal
      open
      title={`User Dashboard · ${user.name}`}
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
            Download PDF Report
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
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
              label="Role & Access"
              value={user.role.toUpperCase()}
              icon={<Shield size={16} />}
            />
            <StatTile
              label="Account Status"
              value={!user.isActive ? 'Deactivated' : user.pendingInvite ? 'Invite Sent' : 'Active'}
              icon={<UserIcon size={16} />}
            />
            <StatTile
              label="Total Activities"
              value={String(data.stats.totalActions)}
              icon={<Activity size={16} />}
            />
            {hasEmployee && data.employee ? (
              <>
                <StatTile
                  label="Monthly Gross"
                  value={formatCurrency(data.employee.grossSalary)}
                  icon={<Wallet size={16} />}
                />
                <StatTile
                  label="Logged Hours"
                  value={`${data.stats.totalHoursLogged} hrs`}
                  icon={<Clock size={16} />}
                />
              </>
            ) : (
              <StatTile
                label="Last Login"
                value={user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                icon={<Clock size={16} />}
              />
            )}
          </div>

          {/* Account Overview Card */}
          <Card title="Account Overview" subtitle="System credentials and access profile">
            <dl className="detail-grid">
              <div>
                <dt>Name</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>
                  <Badge tone={user.role === 'admin' ? 'info' : 'neutral'}>
                    {user.role}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {!user.isActive ? (
                    <Badge tone="neutral">Deactivated</Badge>
                  ) : user.pendingInvite ? (
                    <Badge tone="warning">Invite Sent</Badge>
                  ) : (
                    <Badge tone="success">Active</Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt>Member Since</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt>Last Sign In</dt>
                <dd>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</dd>
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
              title="Recent Activity & Audit Trail"
              subtitle="Actions recorded in the system for this user account"
            >
              {data.auditLogs.length === 0 ? (
                <EmptyState
                  title="No activity recorded"
                  description="This user has not performed any auditable actions yet."
                />
              ) : (
                <DataTable
                  columns={auditColumns}
                  rows={data.auditLogs}
                  rowKey={(row) => row.id}
                  caption="User audit log entries"
                />
              )}
            </Card>
          )}

          {/* Employee Profile Tab */}
          {tab === 'profile' && data.employee && (
            <Card title="Employee & Compensation Profile" subtitle="Employment records linked from Payroll">
              <dl className="detail-grid">
                <div>
                  <dt>Employee Code</dt>
                  <dd>{data.employee.employeeCode}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{data.employee.department || '—'}</dd>
                </div>
                <div>
                  <dt>Designation</dt>
                  <dd>{data.employee.designation || '—'}</dd>
                </div>
                <div>
                  <dt>Date of Joining</dt>
                  <dd>{formatDate(data.employee.dateOfJoining)}</dd>
                </div>
                <div>
                  <dt>PAN</dt>
                  <dd>{data.employee.pan || '—'}</dd>
                </div>
                <div>
                  <dt>Bank Account</dt>
                  <dd>{data.employee.bankAccountNumberMasked || '—'}</dd>
                </div>
                <div>
                  <dt>IFSC Code</dt>
                  <dd>{data.employee.bankIfsc || '—'}</dd>
                </div>
                <div>
                  <dt>Basic Salary</dt>
                  <dd>{formatCurrency(data.employee.basicSalary)}</dd>
                </div>
                <div>
                  <dt>HRA</dt>
                  <dd>{formatCurrency(data.employee.hra)}</dd>
                </div>
                <div>
                  <dt>Other Allowances</dt>
                  <dd>{formatCurrency(data.employee.otherAllowances)}</dd>
                </div>
                <div>
                  <dt>Net Salary</dt>
                  <dd className="strong">{formatCurrency(data.employee.netSalary)}</dd>
                </div>
              </dl>
            </Card>
          )}

          {/* Payslips Tab */}
          {tab === 'payslips' && (
            <Card title="Payslips" subtitle="Compensation runs including this user">
              {data.payslips.length === 0 ? (
                <EmptyState
                  title="No payslips found"
                  description="No approved or paid pay runs have been generated for this employee yet."
                />
              ) : (
                <DataTable
                  columns={payslipColumns}
                  rows={data.payslips}
                  rowKey={(row) => row.id}
                  caption="Employee payslips"
                />
              )}
            </Card>
          )}

          {/* Time Entries Tab */}
          {tab === 'time' && (
            <Card title="Time Entries" subtitle="Hours logged against projects by or for this user">
              {data.timeEntries.length === 0 ? (
                <EmptyState
                  title="No time entries logged"
                  description="No billable or non-billable time entries recorded."
                />
              ) : (
                <DataTable
                  columns={timeColumns}
                  rows={data.timeEntries}
                  rowKey={(row) => row.id}
                  caption="Time entries"
                />
              )}
            </Card>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
