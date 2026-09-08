import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/Field';
import { payrollApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, parseNumber, round2, todayIso } from '@/utils/format';
const numeric = (value) => (value ? String(value) : '');
function initialState(employee) {
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
export function EmployeeFormModal({ employee, onClose, onSaved }) {
    const toast = useToast();
    const { organization } = useAuth();
    const currency = organization?.currency ?? 'INR';
    const { submitting, error, fieldErrors, run } = useSubmit();
    const [form, setForm] = useState(() => initialState(employee));
    const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
    const basic = parseNumber(form.basicSalary);
    const hra = parseNumber(form.hra);
    const other = parseNumber(form.otherAllowances);
    const deductions = round2(parseNumber(form.pfEmployee) + parseNumber(form.professionalTax) + parseNumber(form.tds));
    const gross = round2(basic + hra + other);
    const net = round2(gross - deductions);
    const save = async () => {
        const body = {
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
        if (form.bankAccountNumber.trim())
            body.bankAccountNumber = form.bankAccountNumber.trim();
        if (!employee)
            body.employeeCode = form.employeeCode.trim() || null;
        const saved = await run(() => (employee ? payrollApi.updateEmployee(employee.id, body) : payrollApi.createEmployee(body)));
        if (saved) {
            toast.success(employee ? `${saved.name} updated.` : `${saved.name} added as ${saved.employeeCode}.`);
            onSaved();
            onClose();
        }
    };
    return (_jsx(Modal, { open: true, size: "lg", title: employee ? `Edit ${employee.name}` : 'Add employee', subtitle: "Salary components drive every future pay run", onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", onClick: save, loading: submitting, disabled: !form.name.trim() || net < 0, children: employee ? 'Save changes' : 'Add employee' })] }), children: _jsxs("div", { className: "stack", children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [employee ? null : (_jsx(TextField, { label: "Employee code", value: form.employeeCode, onChange: set('employeeCode'), error: fieldErrors.employeeCode, hint: "Leave blank to generate one automatically", maxLength: 30 })), _jsx(TextField, { label: "Full name", value: form.name, onChange: set('name'), error: fieldErrors.name, required: true, maxLength: 120 }), _jsx(TextField, { label: "Email", type: "email", value: form.email, onChange: set('email'), error: fieldErrors.email }), _jsx(TextField, { label: "Designation", value: form.designation, onChange: set('designation'), error: fieldErrors.designation, maxLength: 120 }), _jsx(TextField, { label: "Department", value: form.department, onChange: set('department'), error: fieldErrors.department, maxLength: 120 }), _jsx(TextField, { label: "Date of joining", type: "date", value: form.dateOfJoining, onChange: set('dateOfJoining'), error: fieldErrors.dateOfJoining, required: true })] }), _jsxs("div", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Statutory and bank details" }), _jsxs("div", { className: "form-grid-3", children: [_jsx(TextField, { label: "PAN", value: form.pan, onChange: set('pan'), error: fieldErrors.pan, maxLength: 20 }), _jsx(TextField, { label: "Bank account number", value: form.bankAccountNumber, onChange: set('bankAccountNumber'), error: fieldErrors.bankAccountNumber, maxLength: 40, hint: employee?.bankAccountNumberMasked ? `Currently ${employee.bankAccountNumberMasked} — leave blank to keep it` : undefined }), _jsx(TextField, { label: "Bank IFSC", value: form.bankIfsc, onChange: set('bankIfsc'), error: fieldErrors.bankIfsc, maxLength: 20 })] })] }), _jsxs("div", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Earnings" }), _jsxs("div", { className: "form-grid-3", children: [_jsx(TextField, { label: "Basic salary", type: "number", min: 0, step: "0.01", value: form.basicSalary, onChange: set('basicSalary'), error: fieldErrors.basicSalary, required: true }), _jsx(TextField, { label: "HRA", type: "number", min: 0, step: "0.01", value: form.hra, onChange: set('hra'), error: fieldErrors.hra }), _jsx(TextField, { label: "Other allowances", type: "number", min: 0, step: "0.01", value: form.otherAllowances, onChange: set('otherAllowances'), error: fieldErrors.otherAllowances })] })] }), _jsxs("div", { className: "form-section", children: [_jsx("h3", { className: "form-section-title", children: "Deductions" }), _jsxs("div", { className: "form-grid-3", children: [_jsx(TextField, { label: "PF (employee)", type: "number", min: 0, step: "0.01", value: form.pfEmployee, onChange: set('pfEmployee'), error: fieldErrors.pfEmployee }), _jsx(TextField, { label: "Professional tax", type: "number", min: 0, step: "0.01", value: form.professionalTax, onChange: set('professionalTax'), error: fieldErrors.professionalTax }), _jsx(TextField, { label: "TDS", type: "number", min: 0, step: "0.01", value: form.tds, onChange: set('tds'), error: fieldErrors.tds })] })] }), _jsxs("div", { className: "totals-list", children: [_jsxs("div", { children: [_jsx("span", { children: "Monthly gross" }), _jsx("span", { className: "num", children: formatCurrency(gross, currency) })] }), _jsxs("div", { children: [_jsx("span", { children: "Total deductions" }), _jsx("span", { className: "num", children: formatCurrency(deductions, currency) })] }), _jsxs("div", { className: "grand", children: [_jsx("span", { children: "Monthly net" }), _jsx("span", { className: net < 0 ? 'num text-danger' : 'num', children: formatCurrency(net, currency) })] })] }), net < 0 ? _jsx("p", { className: "text-danger small", children: "Deductions cannot exceed gross pay." }) : null] }) }));
}
