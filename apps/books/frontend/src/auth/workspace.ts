/**
 * "Workspace mode": a platform super-admin working inside one organization's
 * app through impersonation.
 *
 * Only a small, non-secret note is kept in sessionStorage (which org/user the
 * admin is working as), never a token. When the tenant session is missing or
 * expired - a page reload, or the short-lived token running out - the tenant
 * client falls back to re-minting it from the admin's platform session, so the
 * admin stays in the workspace instead of being signed out.
 */
import { setRefreshFallback } from '@/api/client';
import { platformApi } from '@/api/platform';

const KEY = 'rb.workspace';

export interface WorkspaceNote {
  userId: string;
  userEmail: string;
  orgId: string;
  orgName: string;
}

export function getWorkspace(): WorkspaceNote | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const note = JSON.parse(raw) as Partial<WorkspaceNote>;
    return note.userId && note.orgId ? (note as WorkspaceNote) : null;
  } catch {
    return null;
  }
}

export function setWorkspace(note: WorkspaceNote): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(note));
  } catch {
    // Private mode / storage blocked: the session still works, it just won't
    // survive a reload.
  }
  window.dispatchEvent(new Event('rb:workspace'));
}

export function clearWorkspace(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('rb:workspace'));
}

/** Re-mint the tenant session from the platform session, or null. */
async function reauthorize(): Promise<string | null> {
  const note = getWorkspace();
  if (!note) return null;
  try {
    // The platform client restores its own session from its refresh cookie
    // when needed, so this works right after a page reload too.
    const result = await platformApi.users.impersonate(note.userId);
    return result.accessToken;
  } catch {
    clearWorkspace();
    return null;
  }
}

setRefreshFallback(reauthorize);
