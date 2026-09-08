import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/Field';
import { orgApi } from '@/api/endpoints';
import type { User } from '@/api/types';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';

import { PASSWORD_HINT, validatePassword } from './passwordRules';

interface ResetPasswordModalProps {
  user: User;
  onClose: () => void;
}

export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
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
    const problem = validatePassword(password);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    const result = await run(() => orgApi.resetUserPassword(user.id, password));
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
        <p className="text-muted small">Their existing sessions keep working until they sign out. Share the new password securely.</p>
        <TextField
          label="New password"
          type="password"
          value={password}
          required
          hint={PASSWORD_HINT}
          error={fieldErrors.new_password ?? fieldErrors.newPassword}
          autoComplete="new-password"
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
