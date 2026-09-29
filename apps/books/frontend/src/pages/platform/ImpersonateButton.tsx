import { useState } from 'react';
import { LogIn } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';

import { useImpersonate } from './useImpersonate';

const IMPERSONATABLE_ROLES = new Set(['admin', 'staff', 'viewer']);

interface ImpersonateTarget {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationName: string;
}

interface ImpersonateButtonProps {
  user: ImpersonateTarget;
  size?: 'sm' | 'md';
  /** Tenant route to open once signed in (defaults to the dashboard). */
  to?: string;
  label?: string;
}

/**
 * "View as" support tool. Signs the operator into the tenant app as the target
 * user by swapping the *tenant* access token, then opens the tenant dashboard.
 * There is no refresh cookie for the impersonated session, so reloading ends it.
 */
export function ImpersonateButton({ user, size = 'sm', to = '/dashboard', label = 'View as' }: ImpersonateButtonProps) {
  const { start, submitting, error } = useImpersonate();
  const [confirming, setConfirming] = useState(false);

  if (!IMPERSONATABLE_ROLES.has(user.role)) return null;

  const impersonate = async () => {
    if (await start(user.id, to)) setConfirming(false);
  };

  return (
    <>
      <Button variant="ghost" size={size} icon={<LogIn size={14} />} onClick={() => setConfirming(true)}>
        {label}
      </Button>
      <ConfirmDialog
        open={confirming}
        title="View as user"
        tone="primary"
        message={
          <>
            <FormError message={error} />
            <p>
              You will be signed into <strong>{user.organizationName}</strong> as <strong>{user.email}</strong> for support.
              Continue?
            </p>
            <p className="text-muted small">Reloading the page ends the impersonated session — there is no refresh cookie.</p>
          </>
        }
        confirmLabel="Continue"
        busy={submitting}
        onConfirm={impersonate}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
