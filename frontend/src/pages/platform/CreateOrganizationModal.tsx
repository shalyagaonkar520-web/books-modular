import { useState } from 'react';
import { Copy, Wand2 } from 'lucide-react';

import { platformApi } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

import { PASSWORD_HINT } from '@/pages/settings/passwordRules';
import { generateStrongPassword } from '@/utils/password';

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
  // Defaults: the first administrator is "Admin" with a random password, shown once after creating.
  const [adminName, setAdminName] = useState('Admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState(() => generateStrongPassword());
  const [created, setCreated] = useState<{ orgName: string; email: string; password: string } | null>(null);

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(`${what} copied.`),
      () => toast.error(`Could not copy the ${what.toLowerCase()}.`),
    );
  };

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
      toast.success(`Organization "${result.organization.name}" created.`);
      onCreated();
      setCreated({ orgName: result.organization.name, email: result.admin.email, password: adminPassword });
    }
  };

  const disabled = !name.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword;

  if (created) {
    const signIn = `${window.location.origin}/login`;
    const rows = [
      { label: 'Sign-in URL', value: signIn },
      { label: 'Email', value: created.email },
      { label: 'Password', value: created.password },
    ];
    const all = `${created.orgName}\nSign in at: ${signIn}\nEmail: ${created.email}\nPassword: ${created.password}`;
    return (
      <Modal
        open
        title="Organization created"
        subtitle={`Share the administrator's login for ${created.orgName}. The password is not shown again; they can change it after signing in.`}
        size="sm"
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" icon={<Copy size={14} />} onClick={() => copy(all, 'Login details')}>
              Copy all
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <dl className="detail-grid" aria-label="Administrator login">
          {rows.map((row) => (
            <div key={row.label} className="detail-item">
              <dt>{row.label}</dt>
              <dd className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <span className="mono" style={{ wordBreak: 'break-all' }}>
                  {row.value}
                </span>
                <Button variant="ghost" size="sm" icon={<Copy size={14} />} aria-label={`Copy ${row.label.toLowerCase()}`} onClick={() => copy(row.value, row.label)} />
              </dd>
            </div>
          ))}
        </dl>
      </Modal>
    );
  }

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
        <div className="row" style={{ alignItems: 'flex-start', gap: 8, flexWrap: 'nowrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField
              label="Admin password"
              type="text"
              className="mono"
              value={adminPassword}
              required
              hint={`Random by default. ${PASSWORD_HINT}`}
              autoComplete="new-password"
              spellCheck={false}
              error={fieldErrors.adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
            />
          </div>
          <div style={{ marginTop: 24 }}>
            <Button variant="secondary" size="sm" icon={<Wand2 size={14} />} onClick={() => setAdminPassword(generateStrongPassword())}>
              Generate
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
