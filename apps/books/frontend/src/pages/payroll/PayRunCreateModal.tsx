import { useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
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

const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

interface PayRunCreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function PayRunCreateModal({ onClose, onCreated }: PayRunCreateModalProps) {
  const { t } = useAppContent();
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
      toast.success(t('payroll.payRunCreate.toast.created', { period: created.periodLabel }));
      onCreated();
      onClose();
    }
  };

  const columns: Array<Column<Employee>> = [
    {
      key: 'employee',
      header: t('payroll.payRunCreate.col.employee'),
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
    { key: 'gross', header: t('payroll.payRunCreate.col.gross'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.grossSalary, currency)}</span> },
    {
      key: 'lop',
      header: t('payroll.payRunCreate.col.lop'),
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
          aria-label={t('payroll.payRunCreate.lopAria', { name: row.name })}
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
      title={t('payroll.payRunCreate.title')}
      subtitle={t('payroll.payRunCreate.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('payroll.payRunCreate.cancel')}
          </Button>
          <Button variant="primary" onClick={create} loading={submitting} disabled={!employees.length}>
            {t('payroll.payRunCreate.submit')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <p className="text-muted small">
          {t('payroll.payRunCreate.intro')}
        </p>

        <div className="form-grid">
          <SelectField
            label={t('payroll.payRunCreate.month')}
            value={month}
            options={MONTH_NUMBERS.map((number) => ({ value: String(number), label: t(`payroll.month.${number}`) }))}
            onChange={(event) => setMonth(event.target.value)}
          />
          <SelectField
            label={t('payroll.payRunCreate.year')}
            value={year}
            options={years.map((value) => ({ value: String(value), label: String(value) }))}
            onChange={(event) => setYear(event.target.value)}
          />
        </div>

        {loading ? <LoadingBlock label={t('payroll.payRunCreate.loading')} /> : null}
        {!loading && loadError ? <ErrorBlock message={loadError} onRetry={reload} /> : null}
        {!loading && !loadError && employees.length === 0 ? (
          <EmptyState title={t('payroll.payRunCreate.empty.title')} description={t('payroll.payRunCreate.empty.body')} />
        ) : null}
        {!loading && !loadError && employees.length > 0 ? (
          <DataTable columns={columns} rows={employees} rowKey={(row) => row.id} caption={t('payroll.payRunCreate.caption')} />
        ) : null}
      </div>
    </Modal>
  );
}
