import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextField } from '@/components/ui/Field';
import { orgApi } from '@/api/endpoints';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';

import { PASSWORD_HINT, validatePassword } from './passwordRules';

interface InviteUserModalProps {
  onClose: () => void;
  onInvited: () => void;
}

export function InviteUserModal({ onClose, onInvited }: InviteUserModalProps) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const invite = async () => {
    const passwordProblem = validatePassword(password);
    if (passwordProblem) {
      setLocalError(passwordProblem);
      return;
    }
    setLocalError(null);
    const created = await run(() => orgApi.inviteUser({ name: name.trim(), email: email.trim().toLowerCase(), role, password }));
    if (created) {
      toast.success(`${created.name} can now sign in as ${created.role}.`);
      onInvited();
      onClose();
    }
  };

  return (
    <Modal
      open
      title="Invite user"
      subtitle="Share the temporary password with them — they can change it from their profile"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={invite} loading={submitting} disabled={!name.trim() || !email.trim() || !password}>
            Send invite
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={localError ?? error} />
        <TextField label="Full name" value={name} required error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />
        <TextField label="Email" type="email" value={email} required error={fieldErrors.email} onChange={(event) => setEmail(event.target.value)} />
        <SelectField
          label="Role"
          value={role}
          error={fieldErrors.role}
          options={[
            { value: 'admin', label: 'Administrator — full access' },
            { value: 'staff', label: 'Staff — can record transactions' },
            { value: 'viewer', label: 'Viewer — read-only' },
          ]}
          onChange={(event) => setRole(event.target.value)}
        />
        <TextField
          label="Temporary password"
          type="password"
          value={password}
          required
          hint={PASSWORD_HINT}
          error={fieldErrors.password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
    </Modal>
  );
}
