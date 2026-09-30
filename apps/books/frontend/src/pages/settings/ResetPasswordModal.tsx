import { useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/Field';
import { useScopedOrgApi } from '@/api/ApiScope';
import type { User } from '@/api/types';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';

import { PASSWORD_HINT_KEY, validatePassword } from './passwordRules';

interface ResetPasswordModalProps {
  user: User;
  onClose: () => void;
}

export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const orgApi = useScopedOrgApi();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const reset = async () => {
    if (password !== confirm) {
      setLocalError(t('settings.resetPassword.mismatch'));
      return;
    }
    const problem = validatePassword(password, t);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    const result = await run(() => orgApi.resetUserPassword(user.id, password));
    if (result) {
      toast.success(t('settings.resetPassword.success', { name: user.name }));
      onClose();
    }
  };

  return (
    <Modal
      open
      title={t('settings.resetPassword.title', { name: user.name })}
      subtitle={user.email}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={reset} loading={submitting} disabled={!password || !confirm}>
            {t('settings.resetPassword.submit')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={localError ?? error} />
        <p className="text-muted small">{t('settings.resetPassword.note')}</p>
        <TextField
          label={t('settings.resetPassword.newPassword')}
          type="password"
          value={password}
          required
          hint={t(PASSWORD_HINT_KEY)}
          error={fieldErrors.new_password ?? fieldErrors.newPassword}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextField
          label={t('settings.resetPassword.confirmPassword')}
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
