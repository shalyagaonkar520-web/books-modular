import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextField } from '@/components/ui/Field';
import { orgApi, payrollApi } from '@/api/endpoints';
import type { EmployeeOption } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';

interface InviteUserModalProps {
  onClose: () => void;
  onInvited: () => void;
}

export function InviteUserModal({ onClose, onInvited }: InviteUserModalProps) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run, setError } = useSubmit();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [employeeId, setEmployeeId] = useState('');

  const unlinkedEmployees = useAsync<EmployeeOption[]>(() => payrollApi.unlinkedEmployees(), []);

  // Picking an employee pre-fills their name and email as a convenience.
  useEffect(() => {
    if (role !== 'employee' || !employeeId) return;
    const picked = unlinkedEmployees.data?.find((e) => e.id === employeeId);
    if (picked) {
      setName(picked.name);
      setEmail(picked.email ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const invite = async () => {
    if (role === 'employee' && !employeeId) {
      setError('Select which employee this portal login is for.');
      return;
    }
    const created = await run(() =>
      orgApi.inviteUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        employeeId: role === 'employee' ? employeeId : undefined,
      }),
    );
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
          <Button
            variant="primary"
            onClick={invite}
            loading={submitting}
            disabled={!name.trim() || !email.trim() || (role === 'employee' && !employeeId)}
          >
            Send invite
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
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
            { value: 'employee', label: 'Employee — portal only: their own payslips, profile and time entries' },
          ]}
          onChange={(event) => {
            setRole(event.target.value);
            setEmployeeId('');
          }}
        />

        {role === 'employee' ? (
          <SelectField
            label="Which payroll employee is this?"
            value={employeeId}
            hint={
              unlinkedEmployees.data && unlinkedEmployees.data.length === 0
                ? 'Every active employee already has portal access, or add one under Payroll first.'
                : undefined
            }
            options={[
              { value: '', label: unlinkedEmployees.loading ? 'Loading employees…' : 'Select an employee' },
              ...(unlinkedEmployees.data ?? []).map((e) => ({
                value: e.id,
                label: `${e.name} (${e.employeeCode})`,
              })),
            ]}
            onChange={(event) => setEmployeeId(event.target.value)}
          />
        ) : null}

        <TextField label="Full name" value={name} required error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />
        <TextField label="Email" type="email" value={email} required error={fieldErrors.email} onChange={(event) => setEmail(event.target.value)} />
      </div>
    </Modal>
  );
}
