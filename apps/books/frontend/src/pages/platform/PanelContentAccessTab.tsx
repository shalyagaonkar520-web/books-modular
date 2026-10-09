import { useEffect, useState } from 'react';
import { Lock, RotateCcw, Save } from 'lucide-react';

import { APP_MODULES } from '@/api/appContent';
import { platformApi, type PanelContentAccess } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

const EXTRAS = [
  { key: 'branding', label: 'Branding', hint: 'App name, logo and colour' },
  { key: 'general', label: 'General texts', hint: 'Sign-in, dashboard, settings, menus' },
];

function keysOf(access: PanelContentAccess): Set<string> {
  return new Set([...access.modules, ...(access.branding ? ['branding'] : []), ...(access.general ? ['general'] : [])]);
}

/**
 * What the organization's admin panel may edit in its app content. By default
 * it follows the subscription plan (its modules, no extras); ticking more, e.g.
 * after an upgrade, grants them. A module outside the plan can have its texts
 * edited but can never be switched on.
 */
export function PanelContentAccessTab({ orgId, orgName }: { orgId: string; orgName: string }) {
  const toast = useToast();
  const submit = useSubmit();
  const access = useAsync((signal) => platformApi.organizations.panelAdmins.contentAccess(orgId, signal), [orgId]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (access.data) setChosen(keysOf(access.data));
  }, [access.data]);

  if (access.loading && !access.data) return <LoadingBlock label="Loading admin panel permissions…" />;
  if (access.error || !access.data) return <ErrorBlock message={access.error ?? 'Could not load.'} onRetry={access.reload} />;

  const plan = access.data.planModules ?? null;
  const inPlan = (key: string) => plan === null || plan.includes(key);
  const toggle = (key: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const save = async (keys: string[] | null) => {
    const saved = await submit.run(() => platformApi.organizations.panelAdmins.setContentAccess(orgId, keys));
    if (saved) {
      access.setData(saved);
      toast.success(keys === null ? `${orgName} follows its subscription plan again.` : `Admin panel permissions saved for ${orgName}.`);
    }
  };

  const ordered = [...APP_MODULES.map((module) => module.key), 'branding', 'general'];

  return (
    <div className="stack">
      <p className="text-muted small" style={{ margin: 0 }}>
        What {orgName}'s admin panel can edit under <strong>App content</strong>: each module's labels and messages and its on/off
        switch. {access.data.isDefault ? 'Now following the subscription plan.' : 'Customised by a platform admin.'} Modules outside the
        plan can have their texts edited but are never switched on.
      </p>
      <FormError message={submit.error} />

      <div className="form-grid-3" role="group" aria-label="Modules the admin panel can edit">
        {APP_MODULES.map((module) => (
          <label key={module.key} className="checkbox-field">
            <input
              type="checkbox"
              className="checkbox"
              checked={chosen.has(module.key)}
              onChange={(event) => toggle(module.key, event.target.checked)}
            />
            <span>
              {module.label}
              {inPlan(module.key) ? null : (
                <span className="field-hint">
                  <Lock size={11} aria-hidden="true" /> Not in plan
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      <div className="form-grid-3" role="group" aria-label="Extras the admin panel can edit">
        {EXTRAS.map((extra) => (
          <label key={extra.key} className="checkbox-field">
            <input type="checkbox" className="checkbox" checked={chosen.has(extra.key)} onChange={(event) => toggle(extra.key, event.target.checked)} />
            <span>
              {extra.label}
              <span className="field-hint">{extra.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" icon={<RotateCcw size={14} />} disabled={submit.submitting || access.data.isDefault} onClick={() => void save(null)}>
          Use the plan's modules
        </Button>
        <Button variant="primary" icon={<Save size={14} />} loading={submit.submitting} onClick={() => void save(ordered.filter((key) => chosen.has(key)))}>
          Save permissions
        </Button>
      </div>
    </div>
  );
}
