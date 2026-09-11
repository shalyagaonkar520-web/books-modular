import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextField } from '@/components/ui/Field';
import { orgApi } from '@/api/endpoints';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';

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

  const invite = async () => {
    const created = await run(() => orgApi.inviteUser({ name: name.trim(), email: email.trim().toLowerCase(), role }));
    if (created) {
      toast.success(`Invite sent to ${created.email}. They'll set their own password from the link in that email.`);
      onInvited();
      onClose();
    }
  };

  return (
    <Modal
      open
      title="Invite user"
      subtitle="We'll email them a link to set their own password. They sign in here once that's done."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={invite} loading={submitting} disabled={!name.trim() || !email.trim()}>
            Send invite
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <TextField label="Full name" value={name} required error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />
        <TextField label="Email" type="email" value={email} required error={fieldErrors.email} onChange={(event) => setEmail(event.target.value)} />
        <SelectField
          label="Role"
          value={role}
          error={fieldErrors.role}
          options={[
            { value: 'admin', label: 'Administrator — full access' },
            {
              value: 'staff',
              label: 'Staff — everything except Accounting, Banking and Razorpay Payments',
            },
            { value: 'viewer', label: 'Viewer — read-only' },
          ]}
          onChange={(event) => setRole(event.target.value)}
        />
      </div>
    </Modal>
  );
}
