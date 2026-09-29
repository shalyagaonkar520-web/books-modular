import { useNavigate } from 'react-router-dom';

import { platformApi } from '@/api/platform';
import { useAuth } from '@/auth/AuthContext';
import { clearWorkspace, setWorkspace } from '@/auth/workspace';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

/**
 * Signs the operator into the tenant app as a given user, then opens a route
 * in it. The platform mints a tenant access token; adoptSession() hands it to
 * the tenant AuthContext and loads who it belongs to via /auth/me, so the
 * tenant route guards see a logged-in user instead of bouncing to the landing
 * page. There is no refresh cookie for this session, so a reload ends it.
 */
export function useImpersonate() {
  const navigate = useNavigate();
  const toast = useToast();
  const { adoptSession } = useAuth();
  const { submitting, error, run } = useSubmit();

  const start = async (userId: string, to = '/dashboard'): Promise<boolean> => {
    const result = await run(() => platformApi.users.impersonate(userId));
    if (!result) return false;
    // Remember which org we're working in so a reload re-enters it.
    setWorkspace({ userId, userEmail: result.user.email, orgId: result.organization.id, orgName: result.organization.name });
    try {
      await adoptSession(result.accessToken);
    } catch {
      clearWorkspace();
      toast.error('Could not open the organization. The user may have been deactivated.');
      return false;
    }
    toast.success(`Signed in as ${result.user.email} at ${result.organization.name}.`);
    navigate(to);
    return true;
  };

  return { start, submitting, error };
}
