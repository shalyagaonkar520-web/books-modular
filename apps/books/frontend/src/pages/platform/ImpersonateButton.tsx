import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';

import { setAccessToken } from '@/api/client';
import { platformApi } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

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
}

/**
 * "View as" support tool. Signs the operator into the tenant app as the target
 * user by swapping the *tenant* access token, then opens the tenant dashboard.
 * There is no refresh cookie for the impersonated session, so reloading ends it.
 */
export function ImpersonateButton({ user, size = 'sm' }: ImpersonateButtonProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { submitting, error, run } = useSubmit();
  const [confirming, setConfirming] = useState(false);

  if (!IMPERSONATABLE_ROLES.has(user.role)) return null;

  const impersonate = async () => {
    const result = await run(() => platformApi.users.impersonate(user.id));
    if (result) {
      setAccessToken(result.accessToken);
      toast.success(`Signed in as ${result.user.email} at ${result.organization.name}.`);
      setConfirming(false);
      navigate('/dashboard');
    }
  };

  return (
    <>
      <Button variant="ghost" size={size} icon={<LogIn size={14} />} onClick={() => setConfirming(true)}>
        View as
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
