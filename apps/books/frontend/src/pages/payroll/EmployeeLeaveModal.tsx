import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { payrollApi } from '@/api/endpoints';
import type { Employee, LeaveRecord } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatDate, todayIso } from '@/utils/format';

interface EmployeeLeaveModalProps {
  employee: Employee;
  onClose: () => void;
  onChanged: () => void;
}

export function EmployeeLeaveModal({ employee, onClose, onChanged }: EmployeeLeaveModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => payrollApi.leaves(employee.id), [employee.id]);
  const create = useSubmit();
  const remove = useSubmit();
  const [date, setDate] = useState(todayIso());
  const [leaveType, setLeaveType] = useState<'unpaid' | 'paid'>('unpaid');
  const [notes, setNotes] = useState('');

  const leaves = data ?? [];

  const apply = async () => {
    const saved = await create.run(() => payrollApi.createLeave(employee.id, { date, leaveType, notes: notes.trim() || null }));
    if (saved) {
      toast.success(t('payroll.leave.toast.recorded', { date: formatDate(saved.date) }));
      setNotes('');
      reload();
      onChanged();
    }
  };

  const removeLeave = async (record: LeaveRecord) => {
    const result = await remove.run(() => payrollApi.removeLeave(record.id));
    if (result) {
      toast.success(result.message);
      reload();
      onChanged();
    } else if (remove.errorRef.current) {
      toast.error(remove.errorRef.current);
    }
  };

  const columns: Array<Column<LeaveRecord>> = [
    { key: 'date', header: t('payroll.leave.col.date'), render: (row) => formatDate(row.date) },
    { key: 'type', header: t('payroll.leave.col.type'), render: (row) => (row.leaveType === 'unpaid' ? t('payroll.leave.type.unpaid') : t('payroll.leave.type.paid')) },
    { key: 'notes', header: t('payroll.leave.col.notes'), render: (row) => row.notes ?? <span className="text-muted">—</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '60px',
      render: (row) => (
        <button type="button" className="action-btn is-danger" onClick={() => void removeLeave(row)} aria-label={t('payroll.leave.removeAria')} title={t('payroll.leave.remove')}>
          <Trash2 size={15} />
        </button>
      ),
    },
  ];

  return (
    <Modal open size="lg" title={t('payroll.leave.title', { name: employee.name })} subtitle={t('payroll.leave.subtitle')} onClose={onClose}>
      <div className="stack">
        <FormError message={create.error} />
        <div className="form-grid-3">
          <TextField label={t('payroll.leave.col.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <SelectField
            label={t('payroll.leave.col.type')}
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as 'unpaid' | 'paid')}
            options={[
              { value: 'unpaid', label: t('payroll.leave.option.unpaid') },
              { value: 'paid', label: t('payroll.leave.option.paid') },
            ]}
          />
          <TextField label={t('payroll.leave.col.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={255} />
        </div>
        <Button variant="primary" size="sm" onClick={() => void apply()} loading={create.submitting} disabled={!date}>
          {t('payroll.leave.apply')}
        </Button>

        {loading ? <LoadingBlock label={t('payroll.leave.loading')} /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && leaves.length === 0 ? <EmptyState title={t('payroll.leave.empty.title')} description={t('payroll.leave.empty.body')} /> : null}
        {!loading && !error && leaves.length > 0 ? (
          <DataTable columns={columns} rows={leaves} rowKey={(row) => row.id} caption={t('payroll.leave.caption')} />
        ) : null}
      </div>
    </Modal>
  );
}
