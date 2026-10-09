/**
 * The header every Rooman One app shows: app switcher, org switcher, profile
 * menu and theme toggle. Data comes from Core (/api/me, /api/me/orgs,
 * /api/me/apps); the shell only renders it and reports choices back.
 *
 * Apps the organization's plan does not include are shown greyed out with an
 * "Upgrade" prompt, never as a link to a broken page.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { ThemeToggle } from './theme';

export interface ShellApp {
  key: string;
  name: string;
  url: string;
  /** False when the organization's plan does not include this app. */
  enabled: boolean;
}

export interface ShellOrg {
  id: string;
  name: string;
  code: string;
}

export interface ShellUser {
  name: string;
  email: string;
}

export interface ShellHeaderProps {
  currentApp: string;
  apps: ShellApp[];
  orgs: ShellOrg[];
  currentOrgId: string;
  user: ShellUser;
  /** Where "Upgrade" sends an admin to choose a plan. */
  upgradeUrl: string;
  onSwitchOrg: (orgId: string) => void;
  onSignOut: () => void;
}

type MenuName = 'apps' | 'orgs' | 'profile' | null;

export function ShellHeader({ currentApp, apps, orgs, currentOrgId, user, upgradeUrl, onSwitchOrg, onSignOut }: ShellHeaderProps) {
  const [open, setOpen] = useState<MenuName>(null);
  const rootRef = useRef<HTMLElement>(null);
  const ids = useId();
  const current = apps.find((app) => app.key === currentApp);
  const currentOrg = orgs.find((org) => org.id === currentOrgId);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (name: Exclude<MenuName, null>) => setOpen((value) => (value === name ? null : name));

  return (
    <header className="rs-header" ref={rootRef}>
      <div className="rs-group">
        <button
          type="button"
          className="rs-trigger"
          aria-haspopup="true"
          aria-expanded={open === 'apps'}
          aria-controls={`${ids}-apps`}
          onClick={() => toggle('apps')}
        >
          <span className="rs-brand">Rooman One</span>
          <span className="rs-sep" aria-hidden="true">/</span>
          <span>{current?.name ?? currentApp}</span>
        </button>
        {open === 'apps' && (
          <ul className="rs-menu" id={`${ids}-apps`} aria-label="Switch app">
            {apps.map((app) =>
              app.enabled ? (
                <li key={app.key}>
                  <a className="rs-item" href={app.url} aria-current={app.key === currentApp ? 'page' : undefined}>
                    {app.name}
                  </a>
                </li>
              ) : (
                <li key={app.key} className="rs-item rs-locked" aria-disabled="true">
                  <span>{app.name}</span>
                  <a className="rs-upgrade" href={upgradeUrl}>
                    Upgrade
                  </a>
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <div className="rs-spacer" />

      {orgs.length > 1 && (
        <div className="rs-group">
          <button
            type="button"
            className="rs-trigger"
            aria-haspopup="true"
            aria-expanded={open === 'orgs'}
            aria-controls={`${ids}-orgs`}
            onClick={() => toggle('orgs')}
          >
            {currentOrg?.name ?? 'Organization'}
          </button>
          {open === 'orgs' && (
            <ul className="rs-menu rs-menu-end" id={`${ids}-orgs`} aria-label="Switch organization">
              {orgs.map((org) => (
                <li key={org.id}>
                  <button
                    type="button"
                    className="rs-item"
                    aria-current={org.id === currentOrgId ? 'true' : undefined}
                    onClick={() => {
                      setOpen(null);
                      if (org.id !== currentOrgId) onSwitchOrg(org.id);
                    }}
                  >
                    {org.name} <span className="rs-muted">{org.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {orgs.length <= 1 && currentOrg && <span className="rs-org">{currentOrg.name}</span>}

      <ThemeToggle />

      <div className="rs-group">
        <button
          type="button"
          className="rs-avatar"
          aria-label={`Account menu for ${user.name}`}
          aria-haspopup="true"
          aria-expanded={open === 'profile'}
          aria-controls={`${ids}-profile`}
          onClick={() => toggle('profile')}
        >
          {initials(user.name)}
        </button>
        {open === 'profile' && (
          <div className="rs-menu rs-menu-end" id={`${ids}-profile`}>
            <div className="rs-profile">
              <strong>{user.name}</strong>
              <span className="rs-muted">{user.email}</span>
            </div>
            <button type="button" className="rs-item" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}
