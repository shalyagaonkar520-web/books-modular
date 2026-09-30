import { useEffect, useId, useState, type FormEvent } from 'react';

import { orgApi, projectsApi } from '@/api/endpoints';
import type { Project, TimeEntry } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { parseNumber, todayIso } from '@/utils/format';

interface FormState {
  projectId: string;
  userId: string;
  date: string;
  hours: string;
  description: string;
  isBillable: boolean;
}

interface TimeEntryModalProps {
  open: boolean;
  /** `null` opens the modal in "log time" mode. */
  entry: TimeEntry | null;
  projects: Project[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function TimeEntryModal({ open, entry, projects, onClose, onSaved }: TimeEntryModalProps) {
  const { t } = useAppContent();
  const formId = useId();
  const { isAdmin, user } = useAuth();
  const { submitting, error, fieldErrors, run, reset } = useSubmit();
  const [form, setForm] = useState<FormState>({ projectId: '', userId: '', date: todayIso(), hours: '', description: '', isBillable: true });

  const users = useAsync(() => (isAdmin ? orgApi.users() : Promise.resolve([])), [isAdmin]);

  useEffect(() => {
    if (!open) return;
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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const activeProjects = projects.filter((project) => project.status === 'active' || project.id === entry?.projectId);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = await run(() =>
      entry
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
          }),
    );
    if (saved) onSaved(entry ? t('timeTracking.timeEntry.toast.updated') : t('timeTracking.timeEntry.toast.logged'));
  };

  return (
    <Modal
      open={open}
      title={entry ? t('timeTracking.timeEntry.editTitle') : t('timeTracking.timeEntry.newTitle')}
      subtitle={entry ? `${entry.projectName} · ${entry.userName}` : undefined}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('timeTracking.timeEntry.cancel')}
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            {entry ? t('timeTracking.timeEntry.saveChanges') : t('timeTracking.timeEntry.submit')}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid">
          {entry ? null : (
            <SelectField
              label={t('timeTracking.timeEntry.project')}
              required
              placeholder={t('timeTracking.timeEntry.selectProject')}
              options={activeProjects.map((project) => ({ value: project.id, label: project.name }))}
              value={form.projectId}
              error={fieldErrors.projectId}
              hint={t('timeTracking.timeEntry.projectHint')}
              onChange={(event) => set('projectId', event.target.value)}
            />
          )}
          {!entry && isAdmin ? (
            <SelectField
              label={t('timeTracking.timeEntry.teamMember')}
              options={(users.data ?? []).filter((member) => member.isActive).map((member) => ({ value: member.id, label: member.name }))}
              placeholder={users.loading ? t('timeTracking.timeEntry.loadingUsers') : t('timeTracking.timeEntry.myself')}
              value={form.userId}
              error={fieldErrors.userId}
              onChange={(event) => set('userId', event.target.value)}
            />
          ) : null}
          <TextField label={t('timeTracking.timeEntry.date')} type="date" required value={form.date} error={fieldErrors.date} onChange={(event) => set('date', event.target.value)} />
          <TextField
            label={t('timeTracking.timeEntry.hours')}
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            required
            value={form.hours}
            error={fieldErrors.hours}
            onChange={(event) => set('hours', event.target.value)}
          />
        </div>
        <TextAreaField
          label={t('timeTracking.timeEntry.description')}
          rows={2}
          value={form.description}
          error={fieldErrors.description}
          onChange={(event) => set('description', event.target.value)}
        />
        <CheckboxField label={t('timeTracking.timeEntry.billable')} checked={form.isBillable} onChange={(event) => set('isBillable', event.target.checked)} />
      </form>
    </Modal>
  );
}
