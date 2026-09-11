import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField } from '@/components/ui/Field';
import { payrollApi } from '@/api/endpoints';
import type { Employee } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, parseNumber } from '@/utils/format';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface PayRunCreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function PayRunCreateModal({ onClose, onCreated }: PayRunCreateModalProps) {
  const toast = useToast();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { submitting, error, run } = useSubmit();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [lossOfPay, setLossOfPay] = useState<Record<string, string>>({});

  const { data, loading, error: loadError, reload } = useAsync(() => payrollApi.employees(), []);
  const employees = data ?? [];

  const daysInMonth = new Date(Number(year), Number(month), 0).getDate();

  const create = async () => {
    const lop: Record<string, number> = {};
    Object.entries(lossOfPay).forEach(([employeeId, value]) => {
      const days = parseNumber(value);
      if (days > 0) lop[employeeId] = days;
    });
    const created = await run(() =>
      payrollApi.createPayRun({ periodYear: Number(year), periodMonth: Number(month), lossOfPay: lop }),
    );
    if (created) {
      toast.success(`Draft pay run created for ${created.periodLabel}.`);
      onCreated();
      onClose();
    }
  };

  const columns: Array<Column<Employee>> = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          <small>
            {row.employeeCode}
            {row.designation ? ` · ${row.designation}` : ''}
          </small>
        </div>
      ),
    },
    { key: 'gross', header: 'Monthly gross', align: 'right', render: (row) => <span className="num">{formatCurrency(row.grossSalary, currency)}</span> },
    {
      key: 'lop',
      header: 'Loss of pay (days)',
      align: 'right',
      width: '160px',
      render: (row) => (
        <input
          type="number"
          className="input"
          min={0}
          max={daysInMonth}
          step="0.5"
          value={lossOfPay[row.id] ?? ''}
          placeholder="0"
          aria-label={`Loss of pay days for ${row.name}`}
          onChange={(event) => setLossOfPay((current) => ({ ...current, [row.id]: event.target.value }))}
        />
      ),
    },
  ];

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <Modal
      open
      size="lg"
      title="New pay run"
      subtitle="One pay run per period — approve it, then record the payment"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} loading={submitting} disabled={!employees.length}>
            Create draft pay run
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <p className="text-muted small">
          A pay run can only be created once for a period. It starts as a draft built from each active employee&apos;s current salary
          structure, minus any loss-of-pay days you enter below.
        </p>

        <div className="form-grid">
          <SelectField
            label="Month"
            value={month}
            options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))}
            onChange={(event) => setMonth(event.target.value)}
          />
          <SelectField
            label="Year"
            value={year}
            options={years.map((value) => ({ value: String(value), label: String(value) }))}
            onChange={(event) => setYear(event.target.value)}
          />
        </div>

        {loading ? <LoadingBlock label="Loading active employees…" /> : null}
        {!loading && loadError ? <ErrorBlock message={loadError} onRetry={reload} /> : null}
        {!loading && !loadError && employees.length === 0 ? (
          <EmptyState title="No active employees" description="Add an active employee before creating a pay run." />
        ) : null}
        {!loading && !loadError && employees.length > 0 ? (
          <DataTable columns={columns} rows={employees} rowKey={(row) => row.id} caption="Loss of pay per employee" />
        ) : null}
      </div>
    </Modal>
  );
}
