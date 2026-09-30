import { useEffect, useState } from 'react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { SelectField, TextField } from '@/components/ui/Field';
import { useApiScope, useScopedOrgApi } from '@/api/ApiScope';
import { payrollApi } from '@/api/endpoints';
import type { EmployeeOption } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';

interface InviteUserModalProps {
  onClose: () => void;
  onInvited: () => void;
}

export function InviteUserModal({ onClose, onInvited }: InviteUserModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const orgApi = useScopedOrgApi();
  // The org admin panel has no payroll, so it cannot link a portal-only employee.
  const { employeeInvites } = useApiScope().capabilities;
  const { submitting, error, fieldErrors, run, setError } = useSubmit();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [employeeId, setEmployeeId] = useState('');

  const unlinkedEmployees = useAsync<EmployeeOption[]>(
    () => (employeeInvites ? payrollApi.unlinkedEmployees() : Promise.resolve([])),
    [employeeInvites],
  );

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
      setError(t('settings.invite.employeeRequired'));
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
      toast.success(t('settings.invite.success', { email: created.email }));
      onInvited();
      onClose();
    }
  };

  return (
    <Modal
      open
      title={t('settings.invite.title')}
      subtitle={t('settings.invite.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={invite}
            loading={submitting}
            disabled={!name.trim() || !email.trim() || (role === 'employee' && !employeeId)}
          >
            {t('settings.invite.submit')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <SelectField
          label={t('settings.invite.role')}
          value={role}
          error={fieldErrors.role}
          options={[
            { value: 'admin', label: t('settings.invite.role.admin') },
            {
              value: 'staff',
              label: t('settings.invite.role.staff'),
            },
            { value: 'viewer', label: t('settings.invite.role.viewer') },
            ...(employeeInvites ? [{ value: 'employee', label: t('settings.invite.role.employee') }] : []),
          ]}
          onChange={(event) => {
            setRole(event.target.value);
            setEmployeeId('');
          }}
        />

        {role === 'employee' ? (
          <SelectField
            label={t('settings.invite.employee')}
            value={employeeId}
            hint={
              unlinkedEmployees.data && unlinkedEmployees.data.length === 0
                ? t('settings.invite.noEmployees')
                : undefined
            }
            options={[
              { value: '', label: unlinkedEmployees.loading ? t('settings.invite.loadingEmployees') : t('settings.invite.selectEmployee') },
              ...(unlinkedEmployees.data ?? []).map((e) => ({
                value: e.id,
                label: `${e.name} (${e.employeeCode})`,
              })),
            ]}
            onChange={(event) => setEmployeeId(event.target.value)}
          />
        ) : null}

        <TextField label={t('settings.invite.fullName')} value={name} required error={fieldErrors.name} onChange={(event) => setName(event.target.value)} />
        <TextField label={t('settings.invite.email')} type="email" value={email} required error={fieldErrors.email} onChange={(event) => setEmail(event.target.value)} />
      </div>
    </Modal>
  );
}
