/**
 * Building blocks for organization admin panel logins (/org-admin), which only
 * a platform admin can create: the name / email / password fields (with a
 * strong-password generator), the one-time credentials hand-off, and the
 * modals the org drawer uses to add a login or set a new password.
 */
import { useState } from 'react';
import { Copy, Wand2 } from 'lucide-react';

import { ApiError } from '@/api/client';
import { platformApi, type OrgPanelAdminItem } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';
import { PASSWORD_HINT, validatePassword } from '@/pages/settings/passwordRules';

/** Where panel admins sign in. */
export function orgPanelLoginUrl(): string {
  return `${window.location.origin}/org-admin/login`;
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';

function randomIndex(max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % max;
}

/** A 16-character password with upper and lower case letters, digits and a symbol (satisfies the server policy). */
export function generateStrongPassword(length = 16): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [LOWER, UPPER, DIGITS, SYMBOLS].map((set) => set[randomIndex(set.length)]);
  while (chars.length < length) chars.push(all[randomIndex(all.length)]);
  // Fisher–Yates, so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function useCopy() {
  const toast = useToast();
  return (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(`${what} copied.`),
      () => toast.error(`Could not copy the ${what.toLowerCase()}.`),
    );
  };
}

export interface PanelAdminFormValue {
  name: string;
  email: string;
  password: string;
}

export type PanelAdminFormErrors = Partial<Record<keyof PanelAdminFormValue, string>>;

/** Client-side checks before the request (the server repeats them). */
export function validatePanelAdminForm(value: PanelAdminFormValue, { passwordRequired = true } = {}): PanelAdminFormErrors {
  const errors: PanelAdminFormErrors = {};
  if (!value.name.trim()) errors.name = 'Enter a name.';
  if (!/^\S+@\S+\.\S+$/.test(value.email.trim())) errors.email = 'Enter a valid email address.';
  if (passwordRequired || value.password) {
    const problem = validatePassword(value.password);
    if (problem) errors.password = problem;
  }
  return errors;
}

/**
 * Server errors for the login form: 422s map onto the fields (the body may nest
 * them under `panelAdmin`, whose last path segment is still the field name) and
 * a 409 is the email being taken.
 */
export function panelAdminServerErrors(error: unknown): PanelAdminFormErrors {
  if (!(error instanceof ApiError)) return {};
  if (error.status === 409) return { email: error.message };
  const { name, email, password } = error.fieldErrors;
  return { name, email, password };
}

interface PasswordFieldProps {
  value: string;
  error?: string;
  label?: string;
  onChange: (value: string) => void;
}

/** A visible password input with Generate and Copy, and the password rules as its hint. */
export function GeneratedPasswordField({ value, error, label = 'Password', onChange }: PasswordFieldProps) {
  const copy = useCopy();
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 8, flexWrap: 'nowrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TextField
          label={label}
          type="text"
          className="mono"
          value={value}
          required
          autoComplete="new-password"
          spellCheck={false}
          hint={PASSWORD_HINT}
          error={error}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div className="row" style={{ gap: 6, marginTop: 24, flexWrap: 'nowrap' }}>
        <Button variant="secondary" size="sm" icon={<Wand2 size={14} />} onClick={() => onChange(generateStrongPassword())}>
          Generate
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Copy size={14} />}
          aria-label="Copy password"
          disabled={!value}
          onClick={() => copy(value, 'Password')}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

interface PanelAdminFieldsProps {
  value: PanelAdminFormValue;
  errors: PanelAdminFormErrors;
  onChange: (patch: Partial<PanelAdminFormValue>) => void;
}

export function PanelAdminFields({ value, errors, onChange }: PanelAdminFieldsProps) {
  return (
    <>
      <TextField
        label="Name"
        value={value.name}
        required
        maxLength={200}
        error={errors.name}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <TextField
        label="Email"
        type="email"
        value={value.email}
        required
        autoComplete="off"
        error={errors.email}
        hint="They sign in to the admin panel with this email."
        onChange={(event) => onChange({ email: event.target.value })}
      />
      <GeneratedPasswordField value={value.password} error={errors.password} onChange={(password) => onChange({ password })} />
    </>
  );
}

export interface PanelCredentials {
  orgName: string;
  email: string;
  password: string;
}

/** Shown once after a login is created (or its password set): what to hand to the organization. */
export function PanelCredentialsModal({ credentials, onClose }: { credentials: PanelCredentials; onClose: () => void }) {
  const copy = useCopy();
  const url = orgPanelLoginUrl();
  const all = `Admin panel for ${credentials.orgName}\nSign in at: ${url}\nEmail: ${credentials.email}\nPassword: ${credentials.password}`;
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Sign-in URL', value: url },
    { label: 'Email', value: credentials.email },
    { label: 'Password', value: credentials.password },
  ];
  return (
    <Modal
      open
      title="Admin panel login"
      subtitle={`Share these with ${credentials.orgName}. The password is not shown again.`}
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
      <dl className="detail-grid" aria-label="Admin panel login details">
        {rows.map((row) => (
          <div key={row.label} className="detail-item">
            <dt>{row.label}</dt>
            <dd className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <span className="mono" style={{ wordBreak: 'break-all' }}>
                {row.value}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={<Copy size={14} />}
                aria-label={`Copy ${row.label.toLowerCase()}`}
                onClick={() => copy(row.value, row.label)}
              />
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

/** "Sign in at …" with a copy button. */
export function PanelLoginUrl() {
  const copy = useCopy();
  const url = orgPanelLoginUrl();
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className="text-muted small">Sign in at</span>
      <span className="mono small" style={{ wordBreak: 'break-all' }}>
        {url}
      </span>
      <Button variant="ghost" size="sm" icon={<Copy size={14} />} aria-label="Copy sign-in URL" onClick={() => copy(url, 'Sign-in URL')} />
    </div>
  );
}

interface CreatePanelAdminModalProps {
  orgId: string;
  orgName: string;
  initial?: Partial<PanelAdminFormValue>;
  onClose: () => void;
  onCreated: (created: OrgPanelAdminItem, credentials: PanelCredentials) => void;
}

export function CreatePanelAdminModal({ orgId, orgName, initial, onClose, onCreated }: CreatePanelAdminModalProps) {
  const toast = useToast();
  const submit = useSubmit();
  const [value, setValue] = useState<PanelAdminFormValue>({
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    password: initial?.password ?? generateStrongPassword(),
  });
  const [errors, setErrors] = useState<PanelAdminFormErrors>({});

  const create = async () => {
    const local = validatePanelAdminForm(value);
    setErrors(local);
    if (Object.keys(local).length) return;
    const body = { name: value.name.trim(), email: value.email.trim().toLowerCase(), password: value.password };
    const created = await submit.run(async () => {
      try {
        return await platformApi.organizations.panelAdmins.create(orgId, body);
      } catch (error) {
        setErrors(panelAdminServerErrors(error));
        throw error;
      }
    });
    if (created) {
      toast.success(`Admin panel login created for ${created.email}.`);
      onCreated(created, { orgName, email: body.email, password: body.password });
    }
  };

  const onFieldError = Object.values(errors).some(Boolean);

  return (
    <Modal
      open
      title="Add admin panel login"
      subtitle={`A separate login for ${orgName}'s admin panel. It is not an app user.`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submit.submitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={submit.submitting} onClick={() => void create()}>
            Create login
          </Button>
        </>
      }
    >
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <FormError message={onFieldError ? null : submit.error} />
        <PanelAdminFields
          value={value}
          errors={errors}
          onChange={(patch) => {
            setValue((current) => ({ ...current, ...patch }));
            setErrors((current) => {
              const next = { ...current };
              (Object.keys(patch) as Array<keyof PanelAdminFormValue>).forEach((key) => delete next[key]);
              return next;
            });
          }}
        />
      </form>
    </Modal>
  );
}

interface SetPanelPasswordModalProps {
  admin: OrgPanelAdminItem;
  orgName: string;
  onClose: () => void;
  onSaved: (credentials: PanelCredentials) => void;
}

export function SetPanelPasswordModal({ admin, orgName, onClose, onSaved }: SetPanelPasswordModalProps) {
  const toast = useToast();
  const submit = useSubmit();
  const [password, setPassword] = useState(() => generateStrongPassword());
  const [error, setError] = useState<string | undefined>();

  const save = async () => {
    const problem = validatePassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    const updated = await submit.run(async () => {
      try {
        return await platformApi.organizations.panelAdmins.update(admin.id, { password });
      } catch (err) {
        setError(panelAdminServerErrors(err).password);
        throw err;
      }
    });
    if (updated) {
      toast.success(`New password set for ${admin.email}.`);
      onSaved({ orgName, email: admin.email, password });
    }
  };

  return (
    <Modal
      open
      title="Set new password"
      subtitle={`For ${admin.name} (${admin.email}). Their current password stops working.`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submit.submitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={submit.submitting} onClick={() => void save()}>
            Set password
          </Button>
        </>
      }
    >
      <form
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FormError message={error ? null : submit.error} />
        <GeneratedPasswordField
          label="New password"
          value={password}
          error={error}
          onChange={(next) => {
            setPassword(next);
            setError(undefined);
          }}
        />
      </form>
    </Modal>
  );
}
