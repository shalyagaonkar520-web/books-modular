import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';

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

import { EDITABLE_MODULES } from './moduleAccess';

interface InviteUserModalProps {
  onClose: () => void;
  onInvited: () => void;
}

export function InviteUserModal({ onClose, onInvited }: InviteUserModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const orgApi = useScopedOrgApi();
  // The org admin panel has no payroll, so it cannot link a portal-only employee.
  const { employeeInvites, customInvites } = useApiScope().capabilities;
  const { submitting, error, fieldErrors, run, setError } = useSubmit();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [employeeId, setEmployeeId] = useState('');
  // "custom" = a staff user who may edit only the ticked modules.
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const isCustom = role === 'custom';

  const plan = useAsync(
    () => (customInvites ? orgApi.planModules() : Promise.resolve({ planModules: null })),
    [customInvites],
  );
  const planModules = plan.data?.planModules ?? null;
  const inPlan = (key: string) => planModules === null || planModules.includes(key);
  const toggleModule = (key: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const chosenKeys = EDITABLE_MODULES.map((module) => module.key).filter((key) => chosen.has(key) && inPlan(key));

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
    if (isCustom && chosenKeys.length === 0) {
      setError('Tick at least one module this user can edit.');
      return;
    }
    const created = await run(() =>
      orgApi.inviteUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: isCustom ? 'staff' : role,
        employeeId: role === 'employee' ? employeeId : undefined,
        moduleAccess: isCustom ? chosenKeys : undefined,
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
            disabled={!name.trim() || !email.trim() || (role === 'employee' && !employeeId) || (isCustom && chosenKeys.length === 0)}
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
            ...(customInvites ? [{ value: 'custom', label: 'Custom — choose which modules they can edit' }] : []),
            ...(employeeInvites ? [{ value: 'employee', label: t('settings.invite.role.employee') }] : []),
          ]}
          onChange={(event) => {
            setRole(event.target.value);
            setEmployeeId('');
          }}
        />

        {isCustom ? (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">Modules they can edit</legend>
            <p className="small text-muted" style={{ margin: 0 }}>
              They join as Staff and can view everything in your plan, but only edit the modules you tick. You can change this
              later from their user window.
            </p>
            <div className="form-grid-3" role="group" aria-label="Modules they can edit">
              {EDITABLE_MODULES.map((module) => {
                const available = inPlan(module.key);
                return (
                  <label
                    key={module.key}
                    className="checkbox-field"
                    title={available ? undefined : 'Not in your subscription plan'}
                    style={available ? undefined : { opacity: 0.55 }}
                  >
                    <input
                      type="checkbox"
                      className="checkbox"
                      disabled={!available}
                      checked={available && chosen.has(module.key)}
                      onChange={(event) => toggleModule(module.key, event.target.checked)}
                    />
                    <span>
                      {module.label}
                      {available ? null : (
                        <span className="field-hint">
                          <Lock size={11} aria-hidden="true" /> Not in plan
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

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
