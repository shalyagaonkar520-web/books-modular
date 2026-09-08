import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextField } from '@/components/ui/Field';
import { bankingApi, payrollApi } from '@/api/endpoints';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, todayIso } from '@/utils/format';
export function PayRunPayModal({ payRun, onClose, onPaid }) {
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
    return (_jsx(Modal, { open: true, title: `Record payment · ${payRun.periodLabel}`, subtitle: `${formatCurrency(payRun.totalNet, currency)} net across ${payRun.employeeCount} employees`, onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", onClick: pay, loading: submitting, disabled: !bankAccountId || !payDate, children: "Record payment" })] }), children: _jsxs("div", { className: "stack", children: [_jsx(FormError, { message: error }), loading ? _jsx(LoadingBlock, { label: "Loading bank accounts\u2026" }) : null, !loading && loadError ? _jsx(ErrorBlock, { message: loadError, onRetry: reload }) : null, !loading && !loadError ? (_jsxs(_Fragment, { children: [_jsx(SelectField, { label: "Pay from", value: bankAccountId, placeholder: accounts.length ? 'Select an account' : 'No bank accounts available', required: true, error: fieldErrors.bankAccountId, options: accounts.map((account) => ({
                                value: account.id,
                                label: `${account.name} · ${formatCurrency(account.currentBalance, account.currency)}`,
                            })), onChange: (event) => setBankAccountId(event.target.value) }), _jsx(TextField, { label: "Pay date", type: "date", value: payDate, required: true, error: fieldErrors.payDate, onChange: (event) => setPayDate(event.target.value), hint: "Salary expense, statutory payables and the bank withdrawal are posted on this date" })] })) : null] }) }));
}
