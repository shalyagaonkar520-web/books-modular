import { useState } from 'react';

import { platformApi } from '@/api/platform';
import type { Message } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

import { PASSWORD_HINT } from '@/pages/settings/passwordRules';

interface ChangePasswordModalProps {
  onClose: () => void;
  /** Defaults to the platform operator's own change-password call (the org admin panel passes its own). */
  onSubmit?: (body: { currentPassword: string; newPassword: string }) => Promise<Message>;
  subtitle?: string;
}

export function ChangePasswordModal({
  onClose,
  onSubmit = platformApi.auth.changePassword,
  subtitle = 'Update the password for your operator account.',
}: ChangePasswordModalProps) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const change = async () => {
    if (newPassword !== confirm) {
      setLocalError('The two new passwords do not match.');
      return;
    }
    setLocalError(null);
    const result = await run(() => onSubmit({ currentPassword, newPassword }));
    if (result) {
      toast.success(result.message || 'Your password has been changed.');
      onClose();
    }
  };

  const disabled = !currentPassword || !newPassword || !confirm;

  return (
    <Modal
      open
      title="Change password"
      subtitle={subtitle}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={change} loading={submitting} disabled={disabled}>
            Change password
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={localError ?? error} />
        <TextField
          label="Current password"
          type="password"
          value={currentPassword}
          required
          autoComplete="current-password"
          error={fieldErrors.currentPassword ?? fieldErrors.current_password}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <TextField
          label="New password"
          type="password"
          value={newPassword}
          required
          hint={PASSWORD_HINT}
          autoComplete="new-password"
          error={fieldErrors.newPassword ?? fieldErrors.new_password}
          onChange={(event) => setNewPassword(event.target.value)}
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
