import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextField } from '@/components/ui/Field';
import { bankingApi, payrollApi } from '@/api/endpoints';
import type { PayRun } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, todayIso } from '@/utils/format';

interface PayRunPayModalProps {
  payRun: PayRun;
  onClose: () => void;
  onPaid: () => void;
}

export function PayRunPayModal({ payRun, onClose, onPaid }: PayRunPayModalProps) {
  const toast = useToast();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [bankAccountId, setBankAccountId] = useState('');
  const [payDate, setPayDate] = useState(todayIso());

  const { data, loading, error: loadError, reload } = useAsync(() => bankingApi.accounts(), []);
  const accounts = data ?? [];

  const pay = async () => {
    const paid = await run(() => payrollApi.payPayRun(payRun.id, { bankAccountId, payDate }));
    if (paid) {
      toast.success(`${paid.periodLabel} payroll recorded from the selected account.`);
      onPaid();
      onClose();
    }
  };

  return (
    <Modal
      open
      title={`Record payment · ${payRun.periodLabel}`}
      subtitle={`${formatCurrency(payRun.totalNet, currency)} net across ${payRun.employeeCount} employees`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={pay} loading={submitting} disabled={!bankAccountId || !payDate}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        {loading ? <LoadingBlock label="Loading bank accounts…" /> : null}
        {!loading && loadError ? <ErrorBlock message={loadError} onRetry={reload} /> : null}
        {!loading && !loadError ? (
          <>
            <SelectField
              label="Pay from"
              value={bankAccountId}
              placeholder={accounts.length ? 'Select an account' : 'No bank accounts available'}
              required
              error={fieldErrors.bankAccountId}
              options={accounts.map((account) => ({
                value: account.id,
                label: `${account.name} · ${formatCurrency(account.currentBalance, account.currency)}`,
              }))}
              onChange={(event) => setBankAccountId(event.target.value)}
            />
            <TextField
              label="Pay date"
              type="date"
              value={payDate}
              required
              error={fieldErrors.payDate}
              onChange={(event) => setPayDate(event.target.value)}
              hint="Salary expense, statutory payables and the bank withdrawal are posted on this date"
            />
          </>
        ) : null}
      </div>
    </Modal>
  );
}
