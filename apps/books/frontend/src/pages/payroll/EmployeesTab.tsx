import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { CheckboxField } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
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

export function EmployeesTab() {
  const toast = useToast();
  const { isAdmin, organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const [includeInactive, setIncludeInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const remove = useSubmit();

  const { data, loading, error, reload } = useAsync(() => payrollApi.employees({ include_inactive: includeInactive }), [includeInactive]);

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
    } else if (remove.error) {
      toast.error(remove.error);
    }
  };

  const columns: Array<Column<Employee>> = [
    { key: 'code', header: 'Code', render: (row) => <span className="code-tag">{row.employeeCode}</span> },
    {
      key: 'name',
      header: 'Employee',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          {row.email ? <small>{row.email}</small> : null}
        </div>
      ),
    },
    { key: 'designation', header: 'Designation', render: (row) => row.designation ?? <span className="text-muted">—</span> },
    { key: 'department', header: 'Department', render: (row) => row.department ?? <span className="text-muted">—</span> },
    { key: 'joined', header: 'Joined', render: (row) => formatDate(row.dateOfJoining) },
    { key: 'gross', header: 'Gross', align: 'right', render: (row) => <span className="num">{formatCurrency(row.grossSalary, currency)}</span> },
    { key: 'net', header: 'Net', align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.netSalary, currency)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '90px',
      render: (row) => (
        <div className="row-actions">
          <IfCanWrite>
            <button
              type="button"
              className="action-btn"
              onClick={() => {
                setEditing(row);
                setFormOpen(true);
              }}
              aria-label={`Edit ${row.name}`}
              title="Edit"
            >
              <Pencil size={15} />
            </button>
          </IfCanWrite>
          {isAdmin ? (
            <button type="button" className="action-btn is-danger" onClick={() => setDeleting(row)} aria-label={`Delete ${row.name}`} title="Delete">
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
        <StatTile label="Active employees" value={formatNumber(activeEmployees.length, 0)} sublabel={`${employees.length} on record`} />
        <StatTile label="Monthly gross" value={formatCurrency(monthlyGross, currency)} sublabel="Active employees" />
        <StatTile label="Monthly net" value={formatCurrency(monthlyNet, currency)} sublabel="Take-home after deductions" />
      </div>

      <Card
        title="Employees"
        subtitle="Salary structure used to build each pay run"
        actions={
          <div className="row">
            <CheckboxField label="Show inactive" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
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
                Add employee
              </Button>
            </IfCanWrite>
          </div>
        }
      >
        {loading ? <LoadingBlock label="Loading employees…" /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && employees.length === 0 ? (
          <EmptyState title="No employees yet" description="Add your first employee to start running payroll." />
        ) : null}
        {!loading && !error && employees.length > 0 ? (
          <DataTable columns={columns} rows={employees} rowKey={(row) => row.id} caption="Employees" />
        ) : null}
      </Card>

      {formOpen ? <EmployeeFormModal employee={editing} onClose={() => setFormOpen(false)} onSaved={reload} /> : null}

      <ConfirmDialog
        open={!!deleting}
        title="Delete employee"
        message={
          deleting ? (
            <>
              <strong>{deleting.name}</strong> will be deleted. If they already appear on a payslip they are marked inactive instead, so past pay
              runs stay intact.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete"
        busy={remove.submitting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
