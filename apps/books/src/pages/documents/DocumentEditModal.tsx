import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { documentsApi } from '@/api/endpoints';
import type { StoredDocument } from '@/api/types';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatBytes } from '@/utils/format';

import { DOCUMENT_CATEGORY_OPTIONS } from './categories';

interface DocumentEditModalProps {
  document: StoredDocument;
  onClose: () => void;
  onSaved: () => void;
}

export function DocumentEditModal({ document, onClose, onSaved }: DocumentEditModalProps) {
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

  return (
    <Modal
      open
      title="Edit document"
      subtitle={`${document.originalFilename} · ${formatBytes(document.sizeBytes)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={submitting} disabled={!title.trim()}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <TextField
          label="Title"
          value={title}
          maxLength={255}
          required
          error={fieldErrors.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <SelectField
          label="Category"
          value={category}
          options={DOCUMENT_CATEGORY_OPTIONS}
          error={fieldErrors.category}
          onChange={(event) => setCategory(event.target.value)}
        />
        <TextAreaField label="Notes" value={notes} rows={3} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
    </Modal>
  );
}
