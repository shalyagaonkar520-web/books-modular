import { useState } from 'react';
import { Trash2 } from 'lucide-react';

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
      toast.success(`Leave recorded for ${formatDate(saved.date)}.`);
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
    } else if (remove.error) {
      toast.error(remove.error);
    }
  };

  const columns: Array<Column<LeaveRecord>> = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'type', header: 'Type', render: (row) => (row.leaveType === 'unpaid' ? 'Unpaid' : 'Paid') },
    { key: 'notes', header: 'Notes', render: (row) => row.notes ?? <span className="text-muted">—</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '60px',
      render: (row) => (
        <button type="button" className="action-btn is-danger" onClick={() => void removeLeave(row)} aria-label="Remove leave" title="Remove">
          <Trash2 size={15} />
        </button>
      ),
    },
  ];

  return (
    <Modal open size="lg" title={`Leave — ${employee.name}`} subtitle="Unpaid days here automatically become loss-of-pay on this employee's next pay run" onClose={onClose}>
      <div className="stack">
        <FormError message={create.error} />
        <div className="form-grid-3">
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <SelectField
            label="Type"
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as 'unpaid' | 'paid')}
            options={[
              { value: 'unpaid', label: 'Unpaid (counts as loss-of-pay)' },
              { value: 'paid', label: 'Paid (no deduction)' },
            ]}
          />
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={255} />
        </div>
        <Button variant="primary" size="sm" onClick={() => void apply()} loading={create.submitting} disabled={!date}>
          Apply leave
        </Button>

        {loading ? <LoadingBlock label="Loading leave records…" /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && leaves.length === 0 ? <EmptyState title="No leave recorded" description="Apply a day of leave above." /> : null}
        {!loading && !error && leaves.length > 0 ? (
          <DataTable columns={columns} rows={leaves} rowKey={(row) => row.id} caption="Leave records" />
        ) : null}
      </div>
    </Modal>
  );
}
