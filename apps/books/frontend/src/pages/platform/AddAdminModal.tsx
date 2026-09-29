import { useState } from 'react';

import { platformApi } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

import { PASSWORD_HINT } from '@/pages/settings/passwordRules';

interface AddAdminModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function AddAdminModal({ onClose, onCreated }: AddAdminModalProps) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const create = async () => {
    const created = await run(() =>
      platformApi.admins.create({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      }),
    );
    if (created) {
      toast.success(`${created.name} added as a super-admin.`);
      onCreated();
      onClose();
    }
  };

  const disabled = !name.trim() || !email.trim() || !password;

  return (
    <Modal
      open
      title="Add admin"
      subtitle="Grant another operator access to this console."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} loading={submitting} disabled={disabled}>
            Add admin
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <TextField
          label="Full name"
          value={name}
          required
          error={fieldErrors.name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="Email"
          type="email"
          value={email}
          required
          autoComplete="off"
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
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
