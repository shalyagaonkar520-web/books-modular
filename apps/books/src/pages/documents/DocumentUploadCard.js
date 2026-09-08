import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError, Spinner } from '@/components/ui/Feedback';
import { ApiError } from '@/api/client';
import { documentsApi } from '@/api/endpoints';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatBytes } from '@/utils/format';
import { DOCUMENT_CATEGORY_OPTIONS } from './categories';
const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.doc,.docx,.xls,.xlsx,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain';
export function DocumentUploadCard({ onUploaded }) {
    const toast = useToast();
    const { submitting, error, run, reset } = useSubmit();
    const inputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [title, setTitle] = useState('');
    const [category, setCategory] = useState('general');
    const [notes, setNotes] = useState('');
    const [dragging, setDragging] = useState(false);
    const chooseFile = (selected) => {
        reset();
        if (!selected)
            return;
        if (selected.size > MAX_SIZE_BYTES) {
            toast.error(`${selected.name} is ${formatBytes(selected.size)} — the limit is 25 MB.`);
            return;
        }
        if (selected.size === 0) {
            toast.error(`${selected.name} is empty.`);
            return;
        }
        setFile(selected);
        if (!title.trim())
            setTitle(selected.name.replace(/\.[^.]+$/, ''));
    };
    const clearForm = () => {
        setFile(null);
        setTitle('');
        setNotes('');
        setCategory('general');
        if (inputRef.current)
            inputRef.current.value = '';
    };
    const onDrop = (event) => {
        event.preventDefault();
        setDragging(false);
        chooseFile(event.dataTransfer.files?.[0] ?? null);
    };
    const upload = async () => {
        if (!file) {
            toast.error('Choose a file to upload first.');
            return;
        }
        const form = new FormData();
        form.append('file', file);
        form.append('title', title.trim() || file.name);
        form.append('category', category);
        form.append('notes', notes.trim());
        const created = await run(async () => {
            try {
                return await documentsApi.upload(form);
            }
            catch (err) {
                // 400 (bad type/category), 413 (too large) and 415 responses all carry a user-safe message.
                toast.error(err instanceof ApiError ? err.message : 'The upload failed. Please try again.');
                throw err;
            }
        });
        if (created) {
            toast.success(`${created.title} uploaded.`);
            clearForm();
            onUploaded();
        }
    };
    return (_jsx(Card, { title: "Upload a document", subtitle: "Contracts, receipts, statements and anything else worth keeping with the books", children: _jsxs("div", { className: "stack", children: [_jsx(FormError, { message: error }), _jsxs("button", { type: "button", className: `upload-drop ${dragging ? 'is-active' : ''}`.trim(), onClick: () => inputRef.current?.click(), onDragOver: (event) => {
                        event.preventDefault();
                        setDragging(true);
                    }, onDragLeave: () => setDragging(false), onDrop: onDrop, disabled: submitting, children: [_jsx(UploadCloud, { size: 22, "aria-hidden": "true" }), _jsx("span", { className: "strong", children: file ? file.name : 'Drop a file here, or click to browse' }), _jsx("span", { className: "small", children: file
                                ? `${formatBytes(file.size)} · ${file.type || 'unknown type'}`
                                : 'PDF, PNG, JPEG, WebP, CSV, text, Word or Excel · up to 25 MB per file' })] }), _jsx("input", { ref: inputRef, type: "file", className: "sr-only", accept: ACCEPT, "aria-label": "Choose a document to upload", onChange: (event) => chooseFile(event.target.files?.[0] ?? null) }), _jsxs("div", { className: "form-grid", children: [_jsx(TextField, { label: "Title", value: title, maxLength: 255, onChange: (event) => setTitle(event.target.value), hint: "Defaults to the file name" }), _jsx(SelectField, { label: "Category", value: category, options: DOCUMENT_CATEGORY_OPTIONS, onChange: (event) => setCategory(event.target.value) })] }), _jsx(TextAreaField, { label: "Notes", value: notes, rows: 2, onChange: (event) => setNotes(event.target.value) }), _jsxs("div", { className: "row", children: [_jsx(Button, { variant: "primary", onClick: upload, loading: submitting, disabled: !file, children: "Upload document" }), file ? (_jsx(Button, { variant: "ghost", onClick: clearForm, disabled: submitting, children: "Clear" })) : null, submitting ? (_jsxs("span", { className: "row small text-muted", children: [_jsx(Spinner, { label: "Uploading" }), "Uploading ", file?.name, "\u2026"] })) : null] })] }) }));
}
