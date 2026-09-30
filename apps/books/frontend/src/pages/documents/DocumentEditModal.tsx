import { useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { documentsApi } from '@/api/endpoints';
import type { StoredDocument } from '@/api/types';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatBytes } from '@/utils/format';

import { documentCategoryOptions } from './categories';

interface DocumentEditModalProps {
  document: StoredDocument;
  onClose: () => void;
  onSaved: () => void;
}

export function DocumentEditModal({ document, onClose, onSaved }: DocumentEditModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [title, setTitle] = useState(document.title);
  const [category, setCategory] = useState(document.category);
  const [notes, setNotes] = useState(document.notes ?? '');

  const save = async () => {
    const updated = await run(() => documentsApi.update(document.id, { title: title.trim(), category, notes: notes.trim() || null }));
    if (updated) {
      toast.success(t('documents.edit.toast.saved'));
      onSaved();
      onClose();
    }
  };

  return (
    <Modal
      open
      title={t('documents.edit.title')}
      subtitle={`${document.originalFilename} · ${formatBytes(document.sizeBytes)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('documents.edit.cancel')}
          </Button>
          <Button variant="primary" onClick={save} loading={submitting} disabled={!title.trim()}>
            {t('documents.edit.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <TextField
          label={t('documents.edit.titleLabel')}
          value={title}
          maxLength={255}
          required
          error={fieldErrors.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <SelectField
          label={t('documents.edit.category')}
          value={category}
          options={documentCategoryOptions(t)}
          error={fieldErrors.category}
          onChange={(event) => setCategory(event.target.value)}
        />
        <TextAreaField label={t('documents.edit.notes')} value={notes} rows={3} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
    </Modal>
  );
}
