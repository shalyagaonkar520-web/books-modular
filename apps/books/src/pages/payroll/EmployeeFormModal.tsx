import { useState } from 'react';

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
      toast.success(employee ? `${saved.name} updated.` : `${saved.name} added as ${saved.employeeCode}.`);
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={employee ? `Edit ${employee.name}` : 'Add employee'}
      subtitle="Salary components drive every future pay run"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={submitting} disabled={!form.name.trim() || net < 0}>
            {employee ? 'Save changes' : 'Add employee'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />

        <div className="form-grid">
          {employee ? null : (
            <TextField
              label="Employee code"
              value={form.employeeCode}
              onChange={set('employeeCode')}
              error={fieldErrors.employeeCode}
              hint="Leave blank to generate one automatically"
              maxLength={30}
            />
          )}
          <TextField label="Full name" value={form.name} onChange={set('name')} error={fieldErrors.name} required maxLength={120} />
          <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={fieldErrors.email} />
          <TextField label="Designation" value={form.designation} onChange={set('designation')} error={fieldErrors.designation} maxLength={120} />
          <TextField label="Department" value={form.department} onChange={set('department')} error={fieldErrors.department} maxLength={120} />
          <TextField
            label="Date of joining"
            type="date"
            value={form.dateOfJoining}
            onChange={set('dateOfJoining')}
            error={fieldErrors.dateOfJoining}
            required
          />
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Statutory and bank details</h3>
          <div className="form-grid-3">
            <TextField label="PAN" value={form.pan} onChange={set('pan')} error={fieldErrors.pan} maxLength={20} />
            <TextField
              label="Bank account number"
              value={form.bankAccountNumber}
              onChange={set('bankAccountNumber')}
              error={fieldErrors.bankAccountNumber}
              maxLength={40}
              hint={employee?.bankAccountNumberMasked ? `Currently ${employee.bankAccountNumberMasked} — leave blank to keep it` : undefined}
            />
            <TextField label="Bank IFSC" value={form.bankIfsc} onChange={set('bankIfsc')} error={fieldErrors.bankIfsc} maxLength={20} />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Earnings</h3>
          <div className="form-grid-3">
            <TextField label="Basic salary" type="number" min={0} step="0.01" value={form.basicSalary} onChange={set('basicSalary')} error={fieldErrors.basicSalary} required />
            <TextField label="HRA" type="number" min={0} step="0.01" value={form.hra} onChange={set('hra')} error={fieldErrors.hra} />
            <TextField label="Other allowances" type="number" min={0} step="0.01" value={form.otherAllowances} onChange={set('otherAllowances')} error={fieldErrors.otherAllowances} />
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Deductions</h3>
          <div className="form-grid-3">
            <TextField label="PF (employee)" type="number" min={0} step="0.01" value={form.pfEmployee} onChange={set('pfEmployee')} error={fieldErrors.pfEmployee} />
            <TextField label="Professional tax" type="number" min={0} step="0.01" value={form.professionalTax} onChange={set('professionalTax')} error={fieldErrors.professionalTax} />
            <TextField label="TDS" type="number" min={0} step="0.01" value={form.tds} onChange={set('tds')} error={fieldErrors.tds} />
          </div>
        </div>

        <div className="totals-list">
          <div>
            <span>Monthly gross</span>
            <span className="num">{formatCurrency(gross, currency)}</span>
          </div>
          <div>
            <span>Total deductions</span>
            <span className="num">{formatCurrency(deductions, currency)}</span>
          </div>
          <div className="grand">
            <span>Monthly net</span>
            <span className={net < 0 ? 'num text-danger' : 'num'}>{formatCurrency(net, currency)}</span>
          </div>
        </div>
        {net < 0 ? <p className="text-danger small">Deductions cannot exceed gross pay.</p> : null}
      </div>
    </Modal>
  );
}
