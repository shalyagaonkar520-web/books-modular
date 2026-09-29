import { useState } from 'react';

import { platformApi, type OrgSummary, type PlatformRole, type PlatformUser } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

import { PASSWORD_HINT } from '@/pages/settings/passwordRules';

const ROLE_OPTIONS: Array<{ value: PlatformRole; label: string }> = [
  { value: 'admin', label: 'Administrator' },
  { value: 'staff', label: 'Staff' },
  { value: 'viewer', label: 'Viewer' },
];

// ---------------------------------------------------------------------------
// Create user
// ---------------------------------------------------------------------------

interface CreateUserModalProps {
  organizations: OrgSummary[];
  defaultOrganizationId?: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePlatformUserModal({ organizations, defaultOrganizationId, onClose, onCreated }: CreateUserModalProps) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<PlatformRole>('staff');

  const create = async () => {
    const created = await run(() =>
      platformApi.users.create({
        organizationId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      }),
    );
    if (created) {
      toast.success(`${created.name} added to ${created.organizationName}.`);
      onCreated();
      onClose();
    }
  };

  const disabled = !organizationId || !name.trim() || !email.trim() || !password;

  return (
    <Modal
      open
      title="Create user"
      subtitle="Add a user directly to any organization."
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} loading={submitting} disabled={disabled}>
            Create user
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <SelectField
          label="Organization"
          value={organizationId}
          required
          placeholder="Select an organization"
          error={fieldErrors.organizationId}
          options={organizations.map((org) => ({ value: org.id, label: org.name }))}
          onChange={(event) => setOrganizationId(event.target.value)}
        />
        <TextField label="Full name" value={name} required error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />
        <TextField label="Email" type="email" value={email} required error={fieldErrors.email} onChange={(event) => setEmail(event.target.value)} />
        <SelectField
          label="Role"
          value={role}
          options={ROLE_OPTIONS}
          error={fieldErrors.role}
          onChange={(event) => setRole(event.target.value as PlatformRole)}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          required
          hint={PASSWORD_HINT}
          autoComplete="new-password"
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit user (role / active)
// ---------------------------------------------------------------------------

interface EditUserModalProps {
  user: PlatformUser;
  organizations?: OrgSummary[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditPlatformUserModal({ user, organizations, onClose, onSaved }: EditUserModalProps) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [organizationId, setOrganizationId] = useState(user.organizationId);
  const [role, setRole] = useState<PlatformRole>((ROLE_OPTIONS.find((r) => r.value === user.role)?.value) ?? 'staff');
  const [isActive, setIsActive] = useState(user.isActive);

  const orgsAsync = useAsync(
    (signal) => (organizations ? Promise.resolve(null) : platformApi.organizations.list({ page: 1, page_size: 200 }, signal)),
    [organizations],
  );
  const availableOrgs = organizations ?? orgsAsync.data?.items ?? [];

  const save = async () => {
    const updated = await run(() =>
      platformApi.users.update(user.id, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        organizationId: organizationId !== user.organizationId ? organizationId : undefined,
        role,
        isActive,
      }),
    );
    if (updated) {
      toast.success(`${updated.name} updated.`);
      onSaved();
      onClose();
    }
  };

  const roleIsCustom = !ROLE_OPTIONS.some((r) => r.value === user.role);

  return (
    <Modal
      open
      title={`Edit · ${user.name}`}
      subtitle={`${user.email} · ${user.organizationName}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={submitting} disabled={!name.trim() || !email.trim()}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        {availableOrgs.length > 0 ? (
          <SelectField
            label="Organization"
            value={organizationId}
            hint="Reassign or transfer this user to an organization"
            options={availableOrgs.map((org) => ({ value: org.id, label: org.name }))}
            error={fieldErrors.organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          />
        ) : null}
        <TextField label="Full name" value={name} required error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />
        <TextField label="Email address" type="email" value={email} required error={fieldErrors.email} onChange={(event) => setEmail(event.target.value)} />
        <SelectField
          label="Role"
          value={role}
          options={roleIsCustom ? [{ value: user.role, label: user.role }, ...ROLE_OPTIONS] : ROLE_OPTIONS}
          error={fieldErrors.role}
          onChange={(event) => setRole(event.target.value as PlatformRole)}
        />
        <CheckboxField
          label="Active (can sign in)"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

interface ResetPasswordModalProps {
  user: PlatformUser;
  onClose: () => void;
}

export function ResetPlatformUserPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const reset = async () => {
    if (password !== confirm) {
      setLocalError('The two passwords do not match.');
      return;
    }
    setLocalError(null);
    const result = await run(() => platformApi.users.resetPassword(user.id, password));
    if (result) {
      toast.success(`${user.name}'s password was reset.`);
      onClose();
    }
  };

  return (
    <Modal
      open
      title={`Reset password · ${user.name}`}
      subtitle={user.email}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={reset} loading={submitting} disabled={!password || !confirm}>
            Reset password
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={localError ?? error} />
        <p className="text-muted small">Share the new password securely with the user.</p>
        <TextField
          label="New password"
          type="password"
          value={password}
          required
          hint={PASSWORD_HINT}
          autoComplete="new-password"
          error={fieldErrors.newPassword ?? fieldErrors.new_password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={confirm}
          required
          autoComplete="new-password"
          onChange={(event) => setConfirm(event.target.value)}
        />
      </div>
    </Modal>
  );
}
