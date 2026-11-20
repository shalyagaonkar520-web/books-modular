import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Sparkles } from 'lucide-react';

import { ApiError } from '@/api/client';
import { workspaceApi } from '@/api/workspace';
import { useToast } from '@/components/ui/Toast';

import '@/styles/workspace.css';

export type WorkspaceMode = 'auto' | 'manual';
const KEY = 'rooman.workspace.mode';

/** The last mode this browser used: decides where "/dashboard" sends a workspace employee. */
export function storedMode(): WorkspaceMode {
  try {
    return window.localStorage.getItem(KEY) === 'manual' ? 'manual' : 'auto';
  } catch {
    return 'auto';
  }
}

export function rememberMode(mode: WorkspaceMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* private mode: the server copy still applies */
  }
}

interface Props {
  mode: WorkspaceMode;
  allowAuto: boolean;
  allowManual: boolean;
  block?: boolean;
  /** Called after the switch succeeded (the page then moves to the matching screen). */
  onChanged?: (mode: WorkspaceMode) => void;
}

/**
 * Automatic Mode | Manual Mode. Switching changes the screen only: what the employee may do is
 * decided by their workspace on the server and is identical in both modes.
 */
export function ModeSwitch({ mode, allowAuto, allowManual, block, onChanged }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const choose = useCallback(
    async (next: WorkspaceMode) => {
      if (next === mode || busy) return;
      setBusy(true);
      try {
        await workspaceApi.setMode(next);
        rememberMode(next);
        onChanged?.(next);
        navigate(next === 'auto' ? '/workspace' : '/workspace/home');
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Could not switch mode');
      } finally {
        setBusy(false);
      }
    },
    [busy, mode, navigate, onChanged, toast],
  );

  return (
    <div className={`ws-mode ${block ? 'is-block' : ''}`} role="group" aria-label="Mode">
      <button type="button" className={mode === 'auto' ? 'is-on' : ''} aria-pressed={mode === 'auto'} disabled={!allowAuto || busy} onClick={() => choose('auto')} title={allowAuto ? 'Chat with the AI assistant' : 'Turned off by your administrator'}>
        <Sparkles size={15} /> Automatic
      </button>
      <button type="button" className={mode === 'manual' ? 'is-on' : ''} aria-pressed={mode === 'manual'} disabled={!allowManual || busy} onClick={() => choose('manual')} title={allowManual ? 'Use the regular screens and forms' : 'Turned off by your administrator'}>
        <LayoutGrid size={15} /> Manual
      </button>
    </div>
  );
}

/** Keeps the remembered mode in step with what the server says. */
export function useRememberServerMode(mode: WorkspaceMode | undefined): void {
  useEffect(() => {
    if (mode) rememberMode(mode);
  }, [mode]);
}
