import { useRef, useState, type DragEvent } from 'react';
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
const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.doc,.docx,.xls,.xlsx,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain';

export function DocumentUploadCard({ onUploaded }: { onUploaded: () => void }) {
  const toast = useToast();
  const { submitting, error, run, reset } = useSubmit();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [notes, setNotes] = useState('');
  const [dragging, setDragging] = useState(false);

  const chooseFile = (selected: File | null) => {
    reset();
    if (!selected) return;
    if (selected.size > MAX_SIZE_BYTES) {
      toast.error(`${selected.name} is ${formatBytes(selected.size)} — the limit is 25 MB.`);
      return;
    }
    if (selected.size === 0) {
      toast.error(`${selected.name} is empty.`);
      return;
    }
    setFile(selected);
    if (!title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, ''));
  };

  const clearForm = () => {
    setFile(null);
    setTitle('');
    setNotes('');
    setCategory('general');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
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
      } catch (err) {
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

  return (
    <Card title="Upload a document" subtitle="Contracts, receipts, statements and anything else worth keeping with the books">
      <div className="stack">
        <FormError message={error} />
        <button
          type="button"
          className={`upload-drop ${dragging ? 'is-active' : ''}`.trim()}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          disabled={submitting}
        >
          <UploadCloud size={22} aria-hidden="true" />
          <span className="strong">{file ? file.name : 'Drop a file here, or click to browse'}</span>
          <span className="small">
            {file
              ? `${formatBytes(file.size)} · ${file.type || 'unknown type'}`
              : 'PDF, PNG, JPEG, WebP, CSV, text, Word or Excel · up to 25 MB per file'}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={ACCEPT}
          aria-label="Choose a document to upload"
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />

        <div className="form-grid">
          <TextField label="Title" value={title} maxLength={255} onChange={(event) => setTitle(event.target.value)} hint="Defaults to the file name" />
          <SelectField label="Category" value={category} options={DOCUMENT_CATEGORY_OPTIONS} onChange={(event) => setCategory(event.target.value)} />
        </div>
        <TextAreaField label="Notes" value={notes} rows={2} onChange={(event) => setNotes(event.target.value)} />

        <div className="row">
          <Button variant="primary" onClick={upload} loading={submitting} disabled={!file}>
            Upload document
          </Button>
          {file ? (
            <Button variant="ghost" onClick={clearForm} disabled={submitting}>
              Clear
            </Button>
          ) : null}
          {submitting ? (
            <span className="row small text-muted">
              <Spinner label="Uploading" />
              Uploading {file?.name}…
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
