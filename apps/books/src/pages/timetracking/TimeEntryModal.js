import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useState } from 'react';
import { orgApi, projectsApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber, todayIso } from '@/utils/format';
export function TimeEntryModal({ open, entry, projects, onClose, onSaved }) {
    const formId = useId();
    const { isAdmin, user } = useAuth();
    const { submitting, error, fieldErrors, run, reset } = useSubmit();
    const [form, setForm] = useState({ projectId: '', userId: '', date: todayIso(), hours: '', description: '', isBillable: true });
    const users = useAsync(() => (isAdmin ? orgApi.users() : Promise.resolve([])), [isAdmin]);
    useEffect(() => {
        if (!open)
            return;
        reset();
        setForm({
            projectId: entry?.projectId ?? '',
            userId: entry?.userId ?? user?.id ?? '',
            date: entry?.date ?? todayIso(),
            hours: entry ? String(entry.hours) : '',
            description: entry?.description ?? '',
            isBillable: entry?.isBillable ?? true,
        });
    }, [open, entry, user, reset]);
    const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
    const activeProjects = projects.filter((project) => project.status === 'active' || project.id === entry?.projectId);
    const onSubmit = async (event) => {
        event.preventDefault();
        const saved = await run(() => entry
            ? projectsApi.updateTime(entry.id, {
                date: form.date,
                hours: parseNumber(form.hours),
                description: form.description.trim() || null,
                isBillable: form.isBillable,
            })
            : projectsApi.logTime({
                projectId: form.projectId,
                date: form.date,
                hours: parseNumber(form.hours),
                description: form.description.trim() || null,
                isBillable: form.isBillable,
                ...(isAdmin && form.userId ? { userId: form.userId } : {}),
            }));
        if (saved)
            onSaved(entry ? 'Time entry updated.' : 'Time logged.');
    };
    return (_jsx(Modal, { open: open, title: entry ? 'Edit time entry' : 'Log time', subtitle: entry ? `${entry.projectName} · ${entry.userName}` : undefined, onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", type: "submit", form: formId, loading: submitting, children: entry ? 'Save changes' : 'Log time' })] }), children: _jsxs("form", { id: formId, className: "stack", onSubmit: onSubmit, children: [_jsx(FormError, { message: error }), _jsxs("div", { className: "form-grid", children: [entry ? null : (_jsx(SelectField, { label: "Project", required: true, placeholder: "Select a project", options: activeProjects.map((project) => ({ value: project.id, label: project.name })), value: form.projectId, error: fieldErrors.projectId, hint: "Time can only be logged on active projects.", onChange: (event) => set('projectId', event.target.value) })), !entry && isAdmin ? (_jsx(SelectField, { label: "Team member", options: (users.data ?? []).filter((member) => member.isActive).map((member) => ({ value: member.id, label: member.name })), placeholder: users.loading ? 'Loading users…' : 'Myself', value: form.userId, error: fieldErrors.userId, onChange: (event) => set('userId', event.target.value) })) : null, _jsx(TextField, { label: "Date", type: "date", required: true, value: form.date, error: fieldErrors.date, onChange: (event) => set('date', event.target.value) }), _jsx(TextField, { label: "Hours", type: "number", step: "0.25", min: "0.25", max: "24", required: true, value: form.hours, error: fieldErrors.hours, onChange: (event) => set('hours', event.target.value) })] }), _jsx(TextAreaField, { label: "Description", rows: 2, value: form.description, error: fieldErrors.description, onChange: (event) => set('description', event.target.value) }), _jsx(CheckboxField, { label: "Billable", checked: form.isBillable, onChange: (event) => set('isBillable', event.target.checked) })] }) }));
}
