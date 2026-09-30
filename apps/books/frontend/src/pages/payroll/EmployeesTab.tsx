import { useState } from 'react';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useAppContent } from '@/app/AppContentContext';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { IfCanWrite } from '@/auth/RouteGuards';
import { payrollApi } from '@/api/endpoints';
import type { Employee } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate, formatNumber } from '@/utils/format';

import { EmployeeFormModal } from './EmployeeFormModal';
import { EmployeeLeaveModal } from './EmployeeLeaveModal';

export function EmployeesTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin, organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [leaveFor, setLeaveFor] = useState<Employee | null>(null);
  const remove = useSubmit();

  const { data, loading, error, reload } = useAsync(() => payrollApi.employees(), []);

  const employees = data ?? [];
  const activeEmployees = employees.filter((employee) => employee.isActive);
  const monthlyNet = activeEmployees.reduce((sum, employee) => sum + employee.netSalary, 0);
  const monthlyGross = activeEmployees.reduce((sum, employee) => sum + employee.grossSalary, 0);

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await remove.run(() => payrollApi.removeEmployee(deleting.id));
    if (result) {
      toast.success(result.message);
      setDeleting(null);
      reload();
    } else if (remove.errorRef.current) {
      toast.error(remove.errorRef.current);
    }
  };

  const columns: Array<Column<Employee>> = [
    { key: 'code', header: t('payroll.employees.col.code'), render: (row) => <span className="code-tag">{row.employeeCode}</span> },
    {
      key: 'name',
      header: t('payroll.employees.col.employee'),
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          {row.email ? <small>{row.email}</small> : null}
        </div>
      ),
    },
    { key: 'designation', header: t('payroll.employees.col.designation'), render: (row) => row.designation ?? <span className="text-muted">—</span> },
    { key: 'department', header: t('payroll.employees.col.department'), render: (row) => row.department ?? <span className="text-muted">—</span> },
    { key: 'joined', header: t('payroll.employees.col.joined'), render: (row) => formatDate(row.dateOfJoining) },
    {
      key: 'nextPay',
      header: t('payroll.employees.col.nextPay'),
      render: (row) => (
        <div className="cell-stack">
          <span>{row.nextPayDate ? formatDate(row.nextPayDate) : '—'}</span>
          <small className="text-muted">{t('payroll.employees.perDay', { amount: formatCurrency(row.dailyRate, currency) })}</small>
        </div>
      ),
    },
    { key: 'gross', header: t('payroll.employees.col.gross'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.grossSalary, currency)}</span> },
    { key: 'net', header: t('payroll.employees.col.net'), align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.netSalary, currency)}</span> },
    {
      key: 'status',
      header: t('payroll.employees.col.status'),
      render: (row) => <Badge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? t('payroll.employees.status.active') : t('payroll.employees.status.inactive')}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '90px',
      render: (row) => (
        <div className="row-actions">
          {isAdmin ? (
            <button type="button" className="action-btn" onClick={() => setLeaveFor(row)} aria-label={t('payroll.employees.applyLeaveFor', { name: row.name })} title={t('payroll.employees.applyLeave')}>
              <CalendarClock size={15} />
            </button>
          ) : null}
          <IfCanWrite>
            <button
              type="button"
              className="action-btn"
              onClick={() => {
                setEditing(row);
                setFormOpen(true);
              }}
              aria-label={t('payroll.employees.editFor', { name: row.name })}
              title={t('payroll.employees.edit')}
            >
              <Pencil size={15} />
            </button>
          </IfCanWrite>
          {isAdmin ? (
            <button type="button" className="action-btn is-danger" onClick={() => setDeleting(row)} aria-label={t('payroll.employees.deleteFor', { name: row.name })} title={t('payroll.employees.delete')}>
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile label={t('payroll.employees.stat.active')} value={formatNumber(activeEmployees.length, 0)} sublabel={t('payroll.employees.stat.onRecord', { count: employees.length })} />
        <StatTile label={t('payroll.employees.stat.monthlyGross')} value={formatCurrency(monthlyGross, currency)} sublabel={t('payroll.employees.stat.monthlyGrossSub')} />
        <StatTile label={t('payroll.employees.stat.monthlyNet')} value={formatCurrency(monthlyNet, currency)} sublabel={t('payroll.employees.stat.monthlyNetSub')} />
      </div>

      <Card
        title={t('payroll.employees.card.title')}
        subtitle={t('payroll.employees.card.subtitle')}
        actions={
          <IfCanWrite>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={15} />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              {t('payroll.employees.add')}
            </Button>
          </IfCanWrite>
        }
      >
        {loading ? <LoadingBlock label={t('payroll.employees.loading')} /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && employees.length === 0 ? (
          <EmptyState title={t('payroll.employees.empty.title')} description={t('payroll.employees.empty.body')} />
        ) : null}
        {!loading && !error && employees.length > 0 ? (
          <DataTable columns={columns} rows={employees} rowKey={(row) => row.id} caption={t('payroll.employees.card.title')} />
        ) : null}
      </Card>

      {formOpen ? <EmployeeFormModal employee={editing} onClose={() => setFormOpen(false)} onSaved={reload} /> : null}

      {leaveFor ? <EmployeeLeaveModal employee={leaveFor} onClose={() => setLeaveFor(null)} onChanged={reload} /> : null}

      <ConfirmDialog
        open={!!deleting}
        title={t('payroll.employees.deleteDialog.title')}
        message={
          deleting ? (
            <>
              <strong>{deleting.name}</strong> {t('payroll.employees.deleteDialog.body')}
            </>
          ) : (
            ''
          )
        }
        confirmLabel={t('payroll.employees.delete')}
        busy={remove.submitting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
