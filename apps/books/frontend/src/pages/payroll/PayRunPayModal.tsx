import { useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
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
  const { t } = useAppContent();
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
      toast.success(t('payroll.payRunPay.toast.paid', { period: paid.periodLabel }));
      onPaid();
      onClose();
    }
  };

  return (
    <Modal
      open
      title={t('payroll.payRunPay.title', { period: payRun.periodLabel })}
      subtitle={t('payroll.payRunPay.subtitle', { amount: formatCurrency(payRun.totalNet, currency), count: payRun.employeeCount })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('payroll.payRunPay.cancel')}
          </Button>
          <Button variant="primary" onClick={pay} loading={submitting} disabled={!bankAccountId || !payDate}>
            {t('payroll.payRunPay.submit')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        {loading ? <LoadingBlock label={t('payroll.payRunPay.loading')} /> : null}
        {!loading && loadError ? <ErrorBlock message={loadError} onRetry={reload} /> : null}
        {!loading && !loadError ? (
          <>
            <SelectField
              label={t('payroll.payRunPay.payFrom')}
              value={bankAccountId}
              placeholder={accounts.length ? t('payroll.payRunPay.selectAccount') : t('payroll.payRunPay.noAccounts')}
              required
              error={fieldErrors.bankAccountId}
              options={accounts.map((account) => ({
                value: account.id,
                label: `${account.name} · ${formatCurrency(account.currentBalance, account.currency)}`,
              }))}
              onChange={(event) => setBankAccountId(event.target.value)}
            />
            <TextField
              label={t('payroll.payRunPay.payDate')}
              type="date"
              value={payDate}
              required
              error={fieldErrors.payDate}
              onChange={(event) => setPayDate(event.target.value)}
              hint={t('payroll.payRunPay.payDateHint')}
            />
          </>
        ) : null}
      </div>
    </Modal>
  );
}
