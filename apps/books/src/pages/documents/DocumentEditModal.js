import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { documentsApi } from '@/api/endpoints';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatBytes } from '@/utils/format';
import { DOCUMENT_CATEGORY_OPTIONS } from './categories';
export function DocumentEditModal({ document, onClose, onSaved }) {
    const toast = useToast();
    const { submitting, error, fieldErrors, run } = useSubmit();
    const [title, setTitle] = useState(document.title);
    const [category, setCategory] = useState(document.category);
    const [notes, setNotes] = useState(document.notes ?? '');
    const save = async () => {
        const updated = await run(() => documentsApi.update(document.id, { title: title.trim(), category, notes: notes.trim() || null }));
        if (updated) {
            toast.success('Document details saved.');
            onSaved();
            onClose();
        }
    };
    return (_jsx(Modal, { open: true, title: "Edit document", subtitle: `${document.originalFilename} · ${formatBytes(document.sizeBytes)}`, onClose: onClose, footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", onClick: onClose, disabled: submitting, children: "Cancel" }), _jsx(Button, { variant: "primary", onClick: save, loading: submitting, disabled: !title.trim(), children: "Save changes" })] }), children: _jsxs("div", { className: "stack", children: [_jsx(FormError, { message: error }), _jsx(TextField, { label: "Title", value: title, maxLength: 255, required: true, error: fieldErrors.title, onChange: (event) => setTitle(event.target.value) }), _jsx(SelectField, { label: "Category", value: category, options: DOCUMENT_CATEGORY_OPTIONS, error: fieldErrors.category, onChange: (event) => setCategory(event.target.value) }), _jsx(TextAreaField, { label: "Notes", value: notes, rows: 3, error: fieldErrors.notes, onChange: (event) => setNotes(event.target.value) })] }) }));
}
