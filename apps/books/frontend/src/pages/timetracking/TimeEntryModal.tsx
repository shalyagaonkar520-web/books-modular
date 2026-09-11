import { useEffect, useId, useState, type FormEvent } from 'react';

import { orgApi, projectsApi } from '@/api/endpoints';
import type { Project, TimeEntry } from '@/api/types';
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
    if (saved) onSaved(entry ? 'Time entry updated.' : 'Time logged.');
  };

  return (
    <Modal
      open={open}
      title={entry ? 'Edit time entry' : 'Log time'}
      subtitle={entry ? `${entry.projectName} · ${entry.userName}` : undefined}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={submitting}>
            {entry ? 'Save changes' : 'Log time'}
          </Button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={onSubmit}>
        <FormError message={error} />
        <div className="form-grid">
          {entry ? null : (
            <SelectField
              label="Project"
              required
              placeholder="Select a project"
              options={activeProjects.map((project) => ({ value: project.id, label: project.name }))}
              value={form.projectId}
              error={fieldErrors.projectId}
              hint="Time can only be logged on active projects."
              onChange={(event) => set('projectId', event.target.value)}
            />
          )}
          {!entry && isAdmin ? (
            <SelectField
              label="Team member"
              options={(users.data ?? []).filter((member) => member.isActive).map((member) => ({ value: member.id, label: member.name }))}
              placeholder={users.loading ? 'Loading users…' : 'Myself'}
              value={form.userId}
              error={fieldErrors.userId}
              onChange={(event) => set('userId', event.target.value)}
            />
          ) : null}
          <TextField label="Date" type="date" required value={form.date} error={fieldErrors.date} onChange={(event) => set('date', event.target.value)} />
          <TextField
            label="Hours"
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
          label="Description"
          rows={2}
          value={form.description}
          error={fieldErrors.description}
          onChange={(event) => set('description', event.target.value)}
        />
        <CheckboxField label="Billable" checked={form.isBillable} onChange={(event) => set('isBillable', event.target.checked)} />
      </form>
    </Modal>
  );
}
