import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { TextField } from '@/components/ui/Field';
import { authApi } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatDateTime, titleCase } from '@/utils/format';

import { PASSWORD_HINT, validatePassword } from './passwordRules';

export function ProfilePage() {
  const toast = useToast();
  const { user, organization, updateUser } = useAuth();
  const profile = useSubmit();
  const password = useSubmit();

  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordProblem, setPasswordProblem] = useState<string | null>(null);

  if (!user) return null;

  const saveName = async () => {
    const updated = await profile.run(() => authApi.updateProfile({ name: name.trim() }));
    if (updated) {
      updateUser(updated);
      toast.success('Your name has been updated.');
    }
  };

  const changePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      setPasswordProblem('The new passwords do not match.');
      return;
    }
    const problem = validatePassword(newPassword);
    if (problem) {
      setPasswordProblem(problem);
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordProblem('Choose a password different from your current one.');
      return;
    }
    setPasswordProblem(null);
    const result = await password.run(() => authApi.changePassword({ currentPassword, newPassword }));
    if (result) {
      toast.success(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  };

  return (
    <div className="stack">
      <PageHeader title="Your profile" subtitle="Update your details and password" />

      <div className="grid-2">
        <Card
          title="Account details"
          subtitle="Only your name can be changed here"
          footer={
            <div className="row-between">
              <span className="text-muted small">Ask an administrator to change your email or role.</span>
              <Button variant="primary" onClick={saveName} loading={profile.submitting} disabled={name.trim().length < 2 || name.trim() === user.name}>
                Save name
              </Button>
            </div>
          }
        >
          <div className="stack">
            <FormError message={profile.error} />
            <TextField
              label="Full name"
              value={name}
              required
              maxLength={120}
              error={profile.fieldErrors.name}
              onChange={(event) => setName(event.target.value)}
            />
            <dl className="detail-grid">
              <div className="detail-item">
                <dt className="detail-label">Email</dt>
                <dd className="detail-value">{user.email}</dd>
              </div>
              <div className="detail-item">
                <dt className="detail-label">Role</dt>
                <dd className="detail-value">
                  <Badge tone={user.role === 'admin' ? 'success' : user.role === 'staff' ? 'info' : 'neutral'}>{titleCase(user.role)}</Badge>
                </dd>
              </div>
              <div className="detail-item">
                <dt className="detail-label">Organization</dt>
                <dd className="detail-value">{organization?.name ?? '—'}</dd>
              </div>
              <div className="detail-item">
                <dt className="detail-label">Last login</dt>
                <dd className="detail-value">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'This is your first session'}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card
          title="Change password"
          subtitle="You stay signed in on this device"
          footer={
            <div className="row-between">
              <span className="text-muted small">Every other session is signed out.</span>
              <Button
                variant="primary"
                onClick={changePassword}
                loading={password.submitting}
                disabled={!currentPassword || !newPassword || !confirmNewPassword}
              >
                Update password
              </Button>
            </div>
          }
        >
          <div className="stack">
            <FormError message={passwordProblem ?? password.error} />
            <p className="text-warning small">Changing your password signs you out of every other browser and device.</p>
            <TextField
              label="Current password"
              type="password"
              value={currentPassword}
              required
              autoComplete="current-password"
              error={password.fieldErrors.currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
            <TextField
              label="New password"
              type="password"
              value={newPassword}
              required
              hint={PASSWORD_HINT}
              autoComplete="new-password"
              error={password.fieldErrors.newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <TextField
              label="Confirm new password"
              type="password"
              value={confirmNewPassword}
              required
              autoComplete="new-password"
              onChange={(event) => setConfirmNewPassword(event.target.value)}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
