/**
 * Whose work a reviewer reviews: switch on roles (Admin, Staff, Viewer, the
 * organization's custom roles) and/or single users. Values are "role:staff",
 * "custom:<role id>" and "user:<id>" (backend services/reviews).
 */
import { useState } from 'react';

import { useScopedOrgApi } from '@/api/ApiScope';
import type { User } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';
import { useAsync } from '@/hooks/useAsync';

const BUILT_IN = [
  { value: 'role:staff', label: 'Staff' },
  { value: 'role:viewer', label: 'Viewer' },
  { value: 'role:admin', label: 'Administrator' },
];

interface PickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  /** The reviewer themself: never offered. */
  excludeUserId?: string;
}

export function ReviewScopePicker({ value, onChange, excludeUserId }: PickerProps) {
  const orgApi = useScopedOrgApi();
  const users = useAsync(() => orgApi.users(), []);
  const roles = useAsync(() => orgApi.roles().catch(() => []), []);
  const chosen = new Set(value);
  const toggle = (key: string, on: boolean) => onChange(on ? [...value.filter((v) => v !== key), key] : value.filter((v) => v !== key));
  const people = (users.data ?? []).filter((u: User) => u.id !== excludeUserId && u.role !== 'employee');
  const roleRows = [...BUILT_IN, ...(roles.data ?? []).map((r) => ({ value: `custom:${r.id}`, label: `${r.name} (custom role)` }))];

  return (
    <fieldset className="review-scope">
      <legend className="field-label">Whose work do they review?</legend>
      <p className="small text-muted" style={{ margin: '0 0 8px' }}>
        Work still saves straight away. Every change by these roles or people waits in the reviewer’s list until they mark it Reviewed or Flag it
        with a note. Pick at least one.
      </p>
      <strong className="small">Roles</strong>
      <div className="form-grid-3 review-scope-grid">
        {roleRows.map((row) => (
          <div key={row.value} className="plan-switch-row">
            <span>{row.label}</span>
            <Switch label={`Review ${row.label}`} checked={chosen.has(row.value)} onChange={(on) => toggle(row.value, on)} />
          </div>
        ))}
      </div>
      {people.length ? (
        <>
          <strong className="small">People</strong>
          <div className="form-grid-3 review-scope-grid">
            {people.map((u) => (
              <div key={u.id} className="plan-switch-row">
                <span className="plan-feature-label">
                  <span>{u.name}</span>
                  <span className="field-hint">{u.customRoleName ?? u.role}</span>
                </span>
                <Switch label={`Review ${u.name}`} checked={chosen.has(`user:${u.id}`)} onChange={(on) => toggle(`user:${u.id}`, on)} />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </fieldset>
  );
}

/** Make a user a reviewer, or change whose work they review. */
export function ReviewScopeModal({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (scope: string[]) => Promise<boolean>;
}) {
  const [scope, setScope] = useState<string[]>(user.reviewTargets ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setSaving(true);
    setError(null);
    const ok = await onSave(scope);
    setSaving(false);
    if (ok) onClose();
    else setError('Could not save. Check the choices and try again.');
  };
  return (
    <Modal
      open
      size="lg"
      title={`${user.name}: reviewer`}
      subtitle="A reviewer sees everything read-only and reviews the changes of the roles and people you switch on."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={scope.length === 0}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <ReviewScopePicker value={scope} onChange={setScope} excludeUserId={user.id} />
      </div>
    </Modal>
  );
}
