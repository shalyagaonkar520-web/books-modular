import { useRef, useState, type DragEvent } from 'react';
import { UploadCloud } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError, Spinner } from '@/components/ui/Feedback';
import { ApiError } from '@/api/client';
import { documentsApi } from '@/api/endpoints';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatBytes } from '@/utils/format';

import { documentCategoryOptions } from './categories';

const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.doc,.docx,.xls,.xlsx,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain';

export function DocumentUploadCard({ onUploaded }: { onUploaded: () => void }) {
  const { t } = useAppContent();
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
      toast.error(t('documents.upload.toast.tooLarge', { name: selected.name, size: formatBytes(selected.size) }));
      return;
    }
    if (selected.size === 0) {
      toast.error(t('documents.upload.toast.empty', { name: selected.name }));
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
      toast.error(t('documents.upload.toast.chooseFirst'));
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
        toast.error(err instanceof ApiError ? err.message : t('documents.upload.toast.failed'));
        throw err;
      }
    });
    if (created) {
      toast.success(t('documents.upload.toast.uploaded', { title: created.title }));
      clearForm();
      onUploaded();
    }
  };

  return (
    <Card title={t('documents.upload.title')} subtitle={t('documents.upload.subtitle')}>
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
          <span className="strong">{file ? file.name : t('documents.upload.dropPrompt')}</span>
          <span className="small">
            {file
              ? `${formatBytes(file.size)} · ${file.type || t('documents.upload.unknownType')}`
              : t('documents.upload.acceptedTypes')}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={ACCEPT}
          aria-label={t('documents.upload.inputAria')}
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />

        <div className="form-grid">
          <TextField
            label={t('documents.upload.titleLabel')}
            value={title}
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
            hint={t('documents.upload.titleHint')}
          />
          <SelectField
            label={t('documents.upload.category')}
            value={category}
            options={documentCategoryOptions(t)}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
        <TextAreaField label={t('documents.upload.notes')} value={notes} rows={2} onChange={(event) => setNotes(event.target.value)} />

        <div className="row">
          <Button variant="primary" onClick={upload} loading={submitting} disabled={!file}>
            {t('documents.upload.submit')}
          </Button>
          {file ? (
            <Button variant="ghost" onClick={clearForm} disabled={submitting}>
              {t('documents.upload.clear')}
            </Button>
          ) : null}
          {submitting ? (
            <span className="row small text-muted">
              <Spinner label={t('documents.upload.spinner')} />
              {t('documents.upload.uploading', { name: file?.name })}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
