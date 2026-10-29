import { useState } from 'react';

import { platformApi, type OrgSummary, type PlatformUser } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

import { PASSWORD_HINT } from '@/pages/settings/passwordRules';

import { CreateOrgRole, NEW_ROLE, roleOptions, splitRole, useOrgRoles } from './orgRoles';

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
  const [role, setRole] = useState('staff');
  const [creatingRole, setCreatingRole] = useState(false);
  const orgRoles = useOrgRoles(organizationId);

  const create = async () => {
    const created = await run(() =>
      platformApi.users.create({
        organizationId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        ...splitRole(role),
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
    <>
      {creatingRole ? (
        <CreateOrgRole
          orgId={organizationId}
          onDone={(made) => {
            setCreatingRole(false);
            if (made) {
              orgRoles.reload();
              setRole(`custom:${made.id}`);
            }
          }}
        />
      ) : null}
      <Modal
        open={!creatingRole}
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
            onChange={(event) => {
              setOrganizationId(event.target.value);
              if (role.startsWith('custom:')) setRole('staff');
            }}
          />
          <TextField label="Full name" value={name} required error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />
          <TextField label="Email" type="email" value={email} required error={fieldErrors.email} onChange={(event) => setEmail(event.target.value)} />
          <SelectField
            label="Role"
            value={role}
            options={roleOptions(orgRoles.data ?? [], !!organizationId)}
            hint={organizationId ? 'Custom roles choose exactly which features this user can see or edit.' : 'Choose an organization to see its custom roles.'}
            error={fieldErrors.role ?? fieldErrors.customRoleId}
            onChange={(event) => (event.target.value === NEW_ROLE ? setCreatingRole(true) : setRole(event.target.value))}
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
    </>
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
  // Start from the user's own role (a custom or employee role included), so saving other changes never changes it.
  const startRole = user.role === 'custom' && user.customRoleId ? `custom:${user.customRoleId}` : user.role;
  const [role, setRole] = useState(startRole);
  const [creatingRole, setCreatingRole] = useState(false);
  const orgRoles = useOrgRoles(organizationId);
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
        ...(role !== startRole ? splitRole(role) : {}),
        isActive,
      }),
    );
    if (updated) {
      toast.success(`${updated.name} updated.`);
      onSaved();
      onClose();
    }
  };

  const options = roleOptions(organizationId === user.organizationId ? (orgRoles.data ?? []) : [], organizationId === user.organizationId);
  // An employee portal login, or a custom role still loading, keeps its own entry.
  if (!options.some((o) => o.value === role)) {
    options.unshift({ value: role, label: role === startRole && user.customRoleName ? `${user.customRoleName} (custom role)` : role });
  }

  return (
    <>
      {creatingRole ? (
        <CreateOrgRole
          orgId={organizationId}
          onDone={(made) => {
            setCreatingRole(false);
            if (made) {
              orgRoles.reload();
              setRole(`custom:${made.id}`);
            }
          }}
        />
      ) : null}
      <Modal
        open={!creatingRole}
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
              onChange={(event) => {
                setOrganizationId(event.target.value);
                if (role.startsWith('custom:')) setRole('staff');
              }}
            />
          ) : null}
          <TextField label="Full name" value={name} required error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />
          <TextField label="Email address" type="email" value={email} required error={fieldErrors.email} onChange={(event) => setEmail(event.target.value)} />
          <SelectField
            label="Role"
            value={role}
            options={options}
            error={fieldErrors.role ?? fieldErrors.customRoleId}
            onChange={(event) => (event.target.value === NEW_ROLE ? setCreatingRole(true) : setRole(event.target.value))}
          />
          <CheckboxField
            label="Active (can sign in)"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
        </div>
      </Modal>
    </>
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
