import { useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/Field';
import { payrollApi } from '@/api/endpoints';
import type { Employee } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, parseNumber, round2, todayIso } from '@/utils/format';

interface EmployeeFormModalProps {
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  employeeCode: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  dateOfJoining: string;
  salaryDay: string;
  pan: string;
  bankAccountNumber: string;
  bankIfsc: string;
  basicSalary: string;
  hra: string;
  otherAllowances: string;
  pfEmployee: string;
  professionalTax: string;
  tds: string;
}

const numeric = (value: number) => (value ? String(value) : '');

function initialState(employee: Employee | null): FormState {
  return {
    employeeCode: employee?.employeeCode ?? '',
    name: employee?.name ?? '',
    email: employee?.email ?? '',
    designation: employee?.designation ?? '',
    department: employee?.department ?? '',
    dateOfJoining: employee?.dateOfJoining ?? todayIso(),
    salaryDay: employee?.salaryDay ? String(employee.salaryDay) : '',
    pan: employee?.pan ?? '',
    bankAccountNumber: '',
    bankIfsc: employee?.bankIfsc ?? '',
    basicSalary: numeric(employee?.basicSalary ?? 0),
    hra: numeric(employee?.hra ?? 0),
    otherAllowances: numeric(employee?.otherAllowances ?? 0),
    pfEmployee: numeric(employee?.pfEmployee ?? 0),
    professionalTax: numeric(employee?.professionalTax ?? 0),
    tds: numeric(employee?.tds ?? 0),
  };
}

export function EmployeeFormModal({ employee, onClose, onSaved }: EmployeeFormModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [form, setForm] = useState<FormState>(() => initialState(employee));

  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const basic = parseNumber(form.basicSalary);
  const hra = parseNumber(form.hra);
  const other = parseNumber(form.otherAllowances);
  const deductions = round2(parseNumber(form.pfEmployee) + parseNumber(form.professionalTax) + parseNumber(form.tds));
  const gross = round2(basic + hra + other);
  const net = round2(gross - deductions);

  const save = async () => {
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      designation: form.designation.trim() || null,
      department: form.department.trim() || null,
      dateOfJoining: form.dateOfJoining,
      salaryDay: form.salaryDay.trim() ? Number(form.salaryDay) : null,
      pan: form.pan.trim().toUpperCase() || null,
      bankIfsc: form.bankIfsc.trim().toUpperCase() || null,
      basicSalary: basic,
      hra,
      otherAllowances: other,
      pfEmployee: parseNumber(form.pfEmployee),
      professionalTax: parseNumber(form.professionalTax),
      tds: parseNumber(form.tds),
    };
    if (form.bankAccountNumber.trim()) body.bankAccountNumber = form.bankAccountNumber.trim();
    if (!employee) body.employeeCode = form.employeeCode.trim() || null;

    const saved = await run(() => (employee ? payrollApi.updateEmployee(employee.id, body) : payrollApi.createEmployee(body)));
    if (saved) {
      toast.success(employee ? t('payroll.employeeForm.toast.updated', { name: saved.name }) : t('payroll.employeeForm.toast.added', { name: saved.name, code: saved.employeeCode }));
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={employee ? t('payroll.employeeForm.editTitle', { name: employee.name }) : t('payroll.employeeForm.addTitle')}
      subtitle={t('payroll.employeeForm.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('payroll.employeeForm.cancel')}
          </Button>
          <Button variant="primary" onClick={save} loading={submitting} disabled={!form.name.trim() || net < 0}>
            {employee ? t('payroll.employeeForm.save') : t('payroll.employeeForm.addTitle')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />

        <div className="form-grid">
          {employee ? null : (
            <TextField
              label={t('payroll.employeeForm.code')}
              value={form.employeeCode}
              onChange={set('employeeCode')}
              error={fieldErrors.employeeCode}
              hint={t('payroll.employeeForm.codeHint')}
              maxLength={30}
            />
          )}
          <TextField label={t('payroll.employeeForm.name')} value={form.name} onChange={set('name')} error={fieldErrors.name} required maxLength={120} />
          <TextField label={t('payroll.employeeForm.email')} type="email" value={form.email} onChange={set('email')} error={fieldErrors.email} />
          <TextField label={t('payroll.employeeForm.designation')} value={form.designation} onChange={set('designation')} error={fieldErrors.designation} maxLength={120} />
          <TextField label={t('payroll.employeeForm.department')} value={form.department} onChange={set('department')} error={fieldErrors.department} maxLength={120} />
          <TextField
            label={t('payroll.employeeForm.dateOfJoining')}
            type="date"
            value={form.dateOfJoining}
            onChange={set('dateOfJoining')}
            error={fieldErrors.dateOfJoining}
            required
          />
          <TextField
            label={t('payroll.employeeForm.salaryDay')}
            type="number"
            min={1}
            max={31}
            value={form.salaryDay}
            onChange={set('salaryDay')}
            error={fieldErrors.salaryDay}
            hint={t('payroll.employeeForm.salaryDayHint')}
          />
        </div>

        <div className="form-section">
          <h3 className="form-section-title">{t('payroll.employeeForm.section.statutory')}</h3>
          <div className="form-grid-3">
            <TextField
              label={t('payroll.employeeForm.pan')}
              value={form.pan}
              onChange={(event) => set('pan')({ target: { value: event.target.value.toUpperCase() } })}
              error={fieldErrors.pan}
              maxLength={10}
              hint={t('payroll.employeeForm.panHint')}
            />
            <TextField
              label={t('payroll.employeeForm.bankAccount')}
              value={form.bankAccountNumber}
              inputMode="numeric"
              onChange={set('bankAccountNumber')}
              error={fieldErrors.bankAccountNumber}
              maxLength={18}
              hint={
                employee?.bankAccountNumberMasked
                  ? t('payroll.employeeForm.bankAccountCurrent', { masked: employee.bankAccountNumberMasked })
                  : t('payroll.employeeForm.bankAccountHint')
              }
            />
            <TextField
              label={t('payroll.employeeForm.ifsc')}
              value={form.bankIfsc}
              onChange={(event) => set('bankIfsc')({ target: { value: event.target.value.toUpperCase() } })}
              error={fieldErrors.bankIfsc}
              maxLength={11}
              hint={t('payroll.employeeForm.ifscHint')}
            />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">{t('payroll.employeeForm.section.earnings')}</h3>
          <div className="form-grid-3">
            <TextField label={t('payroll.employeeForm.basic')} type="number" min={0} step="0.01" value={form.basicSalary} onChange={set('basicSalary')} error={fieldErrors.basicSalary} required />
            <TextField label={t('payroll.employeeForm.hra')} type="number" min={0} step="0.01" value={form.hra} onChange={set('hra')} error={fieldErrors.hra} />
            <TextField label={t('payroll.employeeForm.otherAllowances')} type="number" min={0} step="0.01" value={form.otherAllowances} onChange={set('otherAllowances')} error={fieldErrors.otherAllowances} />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">{t('payroll.employeeForm.section.deductions')}</h3>
          <div className="form-grid-3">
            <TextField label={t('payroll.employeeForm.pf')} type="number" min={0} step="0.01" value={form.pfEmployee} onChange={set('pfEmployee')} error={fieldErrors.pfEmployee} />
            <TextField label={t('payroll.employeeForm.professionalTax')} type="number" min={0} step="0.01" value={form.professionalTax} onChange={set('professionalTax')} error={fieldErrors.professionalTax} />
            <TextField label={t('payroll.employeeForm.tds')} type="number" min={0} step="0.01" value={form.tds} onChange={set('tds')} error={fieldErrors.tds} />
          </div>
        </div>

        <div className="totals-list">
          <div>
            <span>{t('payroll.employeeForm.monthlyGross')}</span>
            <span className="num">{formatCurrency(gross, currency)}</span>
          </div>
          <div>
            <span>{t('payroll.employeeForm.totalDeductions')}</span>
            <span className="num">{formatCurrency(deductions, currency)}</span>
          </div>
          <div className="grand">
            <span>{t('payroll.employeeForm.monthlyNet')}</span>
            <span className={net < 0 ? 'num text-danger' : 'num'}>{formatCurrency(net, currency)}</span>
          </div>
        </div>
        {net < 0 ? <p className="text-danger small">{t('payroll.employeeForm.negativeNet')}</p> : null}
      </div>
    </Modal>
  );
}
