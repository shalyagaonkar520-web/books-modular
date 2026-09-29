import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ShieldCheck, Undo2 } from 'lucide-react';

import { useAuth } from '@/auth/AuthContext';
import { getWorkspace, type WorkspaceNote } from '@/auth/workspace';
import { Button } from '@/components/ui/Button';

/**
 * Shown across the tenant app while a platform admin works inside an
 * organization ("workspace mode"), so it is always obvious whose books are
 * being changed, with a one-click way back to the admin console.
 */
export function WorkspaceBanner() {
  const navigate = useNavigate();
  const { user, organization, endWorkspace } = useAuth();
  const [note, setNote] = useState<WorkspaceNote | null>(() => getWorkspace());

  useEffect(() => {
    const sync = () => setNote(getWorkspace());
    window.addEventListener('rb:workspace', sync);
    return () => window.removeEventListener('rb:workspace', sync);
  }, []);

  // Only when the signed-in tenant user IS the one the workspace note is for;
  // a normal login in this tab must never look like an admin session.
  if (!note || !user || user.id !== note.userId) return null;

  const backToConsole = () => {
    navigate('/platform');
    endWorkspace();
  };

  return (
    <div
      role="status"
      className="no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '8px 16px',
        background: '#fef3c7',
        borderBottom: '1px solid #f59e0b',
        color: '#78350f',
        fontSize: 13.5,
      }}
    >
      <ShieldCheck size={16} aria-hidden="true" />
      <span style={{ flex: '1 1 260px' }}>
        <strong>Admin workspace:</strong> managing <strong>{organization?.name ?? note.orgName}</strong> as {note.userEmail}. Every
        change is recorded under your admin account.
      </span>
      <Button size="sm" variant="secondary" icon={<ArrowLeftRight size={14} />} onClick={() => navigate('/platform/workspace')}>
        Switch organization
      </Button>
      <Button size="sm" variant="primary" icon={<Undo2 size={14} />} onClick={backToConsole}>
        Back to admin console
      </Button>
    </div>
  );
}
