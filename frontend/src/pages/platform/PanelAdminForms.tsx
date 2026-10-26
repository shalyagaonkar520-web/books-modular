/**
 * Organization admin panel logins (/org-admin) from the platform side. A
 * platform admin never types these credentials: "Create admin login" makes
 * admin@<org code> with a random temporary password, and "Reset password"
 * (also how a forgot-password request is approved) issues a new one. Either
 * way the credentials are shown once, and the organization's admin then
 * chooses their own login ID and password on first sign-in.
 */
import { useState } from 'react';
import { Copy, KeyRound, UserPlus } from 'lucide-react';

import { platformApi, type OrgPanelAdminItem, type PanelTempCredentials } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

/** Where panel admins sign in. */
export function orgPanelLoginUrl(): string {
  return `${window.location.origin}/org-admin/login`;
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

export interface PanelCredentials {
  orgName: string;
  loginId: string;
  password: string;
}

/** Shown once after a login is created or its password reset: what to hand to the organization. */
export function PanelCredentialsModal({ credentials, onClose }: { credentials: PanelCredentials; onClose: () => void }) {
  const copy = useCopy();
  const url = orgPanelLoginUrl();
  const all = `Admin panel for ${credentials.orgName}\nSign in at: ${url}\nAdmin ID: ${credentials.loginId}\nTemporary password: ${credentials.password}\nYou will choose your own ID and password when you first sign in.`;
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Sign-in URL', value: url },
    { label: 'Admin ID', value: credentials.loginId },
    { label: 'Temporary password', value: credentials.password },
  ];
  return (
    <Modal
      open
      title="Admin panel login"
      subtitle={`Share these with ${credentials.orgName}. The password is not shown again; they choose their own ID and password when they first sign in.`}
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

function toCredentials(orgName: string, result: PanelTempCredentials): PanelCredentials {
  return { orgName, loginId: result.loginId, password: result.password };
}

interface CreateAdminLoginButtonProps {
  org: { id: string; name: string; code?: string | null };
  size?: 'sm' | 'md';
  variant?: 'primary' | 'secondary' | 'ghost';
  onCreated?: () => void;
}

/** Creates admin@<code> with a random temporary password and shows the credentials once. */
export function CreateAdminLoginButton({ org, size = 'sm', variant = 'secondary', onCreated }: CreateAdminLoginButtonProps) {
  const toast = useToast();
  const submit = useSubmit();
  const [credentials, setCredentials] = useState<PanelCredentials | null>(null);

  const create = async () => {
    const result = await submit.run(() => platformApi.organizations.panelAdmins.createDefault(org.id));
    if (result) {
      setCredentials(toCredentials(org.name, result));
      toast.success(`Admin login ${result.loginId} created.`);
    } else if (submit.errorRef.current) {
      toast.error(submit.errorRef.current);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon={<UserPlus size={14} />}
        loading={submit.submitting}
        title={org.code ? `Creates admin@${org.code} with a temporary password` : undefined}
        onClick={() => void create()}
      >
        Create admin login
      </Button>
      {credentials ? (
        <PanelCredentialsModal
          credentials={credentials}
          onClose={() => {
            setCredentials(null);
            onCreated?.();
          }}
        />
      ) : null}
    </>
  );
}

/** Reset an admin login's password (approving a forgot-password request, or on request): shows the new temporary one. */
export function useResetPanelPassword(orgName: string, onDone?: () => void) {
  const toast = useToast();
  const submit = useSubmit();
  const [credentials, setCredentials] = useState<PanelCredentials | null>(null);

  const reset = async (admin: Pick<OrgPanelAdminItem, 'id' | 'email'>) => {
    const result = await submit.run(() => platformApi.organizations.panelAdmins.resetPassword(admin.id));
    if (result) {
      setCredentials(toCredentials(orgName, result));
      toast.success(`New temporary password issued for ${result.loginId}.`);
    } else if (submit.errorRef.current) {
      toast.error(submit.errorRef.current);
    }
  };

  const modal = credentials ? (
    <PanelCredentialsModal
      credentials={credentials}
      onClose={() => {
        setCredentials(null);
        onDone?.();
      }}
    />
  ) : null;

  return { reset, resetting: submit.submitting, modal, icon: <KeyRound size={14} /> };
}
