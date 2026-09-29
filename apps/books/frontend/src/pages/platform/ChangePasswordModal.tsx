import { useState } from 'react';

import { platformApi } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

import { PASSWORD_HINT } from '@/pages/settings/passwordRules';

interface ChangePasswordModalProps {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
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
    const result = await run(() => platformApi.auth.changePassword({ currentPassword, newPassword }));
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
      subtitle="Update the password for your operator account."
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
