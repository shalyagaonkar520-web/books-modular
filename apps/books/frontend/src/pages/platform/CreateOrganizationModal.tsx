import { useState } from 'react';

import { platformApi } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

import { PASSWORD_HINT } from '@/pages/settings/passwordRules';

const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR — Indian Rupee' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
];

interface CreateOrganizationModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateOrganizationModal({ onClose, onCreated }: CreateOrganizationModalProps) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();

  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [country, setCountry] = useState('India');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const create = async () => {
    const result = await run(() =>
      platformApi.organizations.create({
        name: name.trim(),
        gstin: gstin.trim() || undefined,
        currency,
        country: country.trim() || undefined,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
      }),
    );
    if (result) {
      toast.success(`Organization "${result.organization.name}" created with admin ${result.admin.email}.`);
      onCreated();
      onClose();
    }
  };

  const disabled = !name.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword;

  return (
    <Modal
      open
      title="Create organization"
      subtitle="Provision a new tenant and its first administrator."
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} loading={submitting} disabled={disabled}>
            Create organization
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />

        <h3 className="card-subtitle" style={{ margin: 0 }}>Organization</h3>
        <TextField
          label="Organization name"
          value={name}
          required
          error={fieldErrors.name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label="GSTIN"
          value={gstin}
          hint="Optional"
          error={fieldErrors.gstin}
          onChange={(event) => setGstin(event.target.value)}
        />
        <div className="form-grid">
          <SelectField
            label="Currency"
            value={currency}
            options={CURRENCY_OPTIONS}
            error={fieldErrors.currency}
            onChange={(event) => setCurrency(event.target.value)}
          />
          <TextField
            label="Country"
            value={country}
            error={fieldErrors.country}
            onChange={(event) => setCountry(event.target.value)}
          />
        </div>

        <h3 className="card-subtitle" style={{ margin: '6px 0 0' }}>First administrator</h3>
        <TextField
          label="Admin name"
          value={adminName}
          required
          error={fieldErrors.adminName}
          onChange={(event) => setAdminName(event.target.value)}
        />
        <TextField
          label="Admin email"
          type="email"
          value={adminEmail}
          required
          error={fieldErrors.adminEmail}
          onChange={(event) => setAdminEmail(event.target.value)}
        />
        <TextField
          label="Admin password"
          type="password"
          value={adminPassword}
          required
          hint={PASSWORD_HINT}
          autoComplete="new-password"
          error={fieldErrors.adminPassword}
          onChange={(event) => setAdminPassword(event.target.value)}
        />
      </div>
    </Modal>
  );
}
