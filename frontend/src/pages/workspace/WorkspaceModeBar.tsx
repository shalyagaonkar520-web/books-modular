import { useEffect, useState } from 'react';

import { workspaceApi, type WorkspaceMe } from '@/api/workspace';
import { useAuth } from '@/auth/AuthContext';

import { ModeSwitch, rememberMode } from './ModeSwitch';

import '@/styles/workspace.css';

/** Shown above the regular app for an AI-workspace employee: the Automatic | Manual switch. */
export function WorkspaceModeBar() {
  const { user } = useAuth();
  const [me, setMe] = useState<WorkspaceMe | null>(null);
  const enabled = !!user?.workspaceEmployee;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    workspaceApi
      .me()
      .then((m) => {
        if (active) {
          setMe(m);
          rememberMode(m.modes.current);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);

  if (!enabled || !me) return null;
  return (
    <div className="ws-modebar">
      <span>
        {me.workspace.name} · you only see the screens assigned to you
      </span>
      <ModeSwitch mode="manual" allowAuto={me.modes.allowAuto} allowManual={me.modes.allowManual} />
    </div>
  );
}
