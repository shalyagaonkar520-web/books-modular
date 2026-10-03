import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Briefcase, Building2, ChevronRight, RotateCcw, Save, Undo2 } from 'lucide-react';

import {
  APP_CONTENT_LIMITS as LIMITS,
  APP_MODULES,
  DEFAULT_APP_CONTENT,
  TEXT_GROUP_LABELS,
  brandPalette,
  isHexColor,
  normalizeAppContent,
  validateAppContent,
  type AppBranding,
  type AppContent,
  type AppModuleKey,
} from '@/api/appContent';
import { platformApi } from '@/api/platform';
import { PlatformApiError } from '@/api/platformClient';
import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

// ---------------------------------------------------------------------------
// Text catalog helpers
// ---------------------------------------------------------------------------

const DEFAULT_TEXTS = DEFAULT_APP_CONTENT.texts;

function words(segment: string): string {
  return segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

/** "empty.filteredTitle" → "Empty · filtered title" (the group prefix is dropped). */
function textLabel(key: string): string {
  const label = key.split('.').slice(1).map(words).join(' · ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function groupOf(key: string): string {
  return key.split('.')[0];
}

/** Text keys grouped by their first segment, in catalog order. */
const TEXT_GROUPS: Array<{ id: string; label: string; keys: string[] }> = (() => {
  const groups = new Map<string, string[]>();
  Object.keys(DEFAULT_TEXTS).forEach((key) => {
    const id = groupOf(key);
    groups.set(id, [...(groups.get(id) ?? []), key]);
  });
  return Array.from(groups, ([id, keys]) => ({ id, label: TEXT_GROUP_LABELS[id] ?? words(id), keys }));
})();

/** A text differs from the baseline it sits on (an empty value means "use the baseline"). */
function isChanged(key: string, value: string, baseline: Record<string, string>): boolean {
  return value !== '' && value !== baseline[key];
}

/** Which editor card owns an error path: `branding`, `modules` or `texts:<group>`. */
function sectionOfPath(path: string): string | null {
  const [head, ...rest] = path.split('.');
  if (head === 'branding' || head === 'modules') return head;
  if (head === 'texts' && rest.length) return `texts:${rest[0]}`;
  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** The super-admin editor: the shared content or, via ?org=, any organization's copy. */
export function AppContentPage() {
  const toast = useToast();
  const { reload: reloadAppContent } = useAppContent();
  const [searchParams, setSearchParams] = useSearchParams();
  // '' edits the shared content every organization sees; an org id edits only that organization's copy.
  const scope = searchParams.get('org') ?? '';
  // Editing one organization's copy (compared against the shared content) rather than the shared content itself.
  const perOrg = Boolean(scope);
  const orgs = useAsync((signal) => platformApi.organizations.list({ page: 1, page_size: 200 }, signal), []);
  const remote = useAsync(
    async (signal) => {
      if (!scope) {
        return { content: normalizeAppContent(await platformApi.appContent.get(signal)), shared: DEFAULT_APP_CONTENT, orgName: null };
      }
      const org = await platformApi.appContent.org.get(scope, signal);
      return { content: normalizeAppContent(org.content), shared: normalizeAppContent(org.shared), orgName: org.organizationName };
    },
    [scope],
  );
  const baseline = remote.data?.shared ?? DEFAULT_APP_CONTENT;
  const orgName = remote.data?.orgName ?? null;
  const [saved, setSaved] = useState<AppContent | null>(null);
  const [draft, setDraft] = useState<AppContent | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set<string>());
  const [search, setSearch] = useState('');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [confirmingReset, setConfirmingReset] = useState(false);
  const saveSubmit = useSubmit();
  const resetSubmit = useSubmit();

  useEffect(() => {
    if (remote.data) {
      setSaved(remote.data.content);
      setDraft(remote.data.content);
      setServerErrors({});
    } else {
      setSaved(null);
      setDraft(null);
    }
  }, [remote.data]);

  const changeScope = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('org', next);
    else params.delete('org');
    setSearchParams(params, { replace: true });
  };

  const dirty = useMemo(() => Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved)), [draft, saved]);
  const localErrors = useMemo(() => (draft ? validateAppContent(draft) : {}), [draft]);
  const errors = useMemo(() => ({ ...serverErrors, ...localErrors }), [serverErrors, localErrors]);

  const errorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(errors).forEach((path) => {
      const section = sectionOfPath(path);
      if (section) counts[section] = (counts[section] ?? 0) + 1;
    });
    return counts;
  }, [errors]);

  const customizedCount = useMemo(() => {
    if (!draft || !perOrg) return 0;
    const branding = (['appName', 'logoUrl', 'primaryColor'] as const).filter((k) => draft.branding[k] !== baseline.branding[k]).length;
    const modules = APP_MODULES.filter((m) => draft.modules[m.key] !== baseline.modules[m.key]).length;
    const texts = Object.keys(draft.texts).filter((k) => isChanged(k, draft.texts[k] ?? '', baseline.texts)).length;
    return branding + modules + texts;
  }, [draft, perOrg, baseline]);

  const query = search.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!draft) return [];
    return TEXT_GROUPS.map((group) => ({
      ...group,
      keys: query
        ? group.keys.filter((key) =>
            [key, textLabel(key), group.label, draft.texts[key] ?? '', DEFAULT_TEXTS[key]].some((part) => part.toLowerCase().includes(query)),
          )
        : group.keys,
    })).filter((group) => group.keys.length > 0);
  }, [draft, query]);

  const toggleSection = (id: string) =>
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandSectionsFor = (paths: string[]) =>
    setOpenSections((current) => {
      const next = new Set(current);
      paths.forEach((path) => {
        const section = sectionOfPath(path);
        if (section) next.add(section);
      });
      return next;
    });

  const update = (change: (current: AppContent) => AppContent) => {
    setDraft((current) => (current ? change(current) : current));
    if (Object.keys(serverErrors).length) setServerErrors({});
  };
  const patchBranding = (value: Partial<AppBranding>) => update((current) => ({ ...current, branding: { ...current.branding, ...value } }));
  const setModule = (key: AppModuleKey, on: boolean) => update((current) => ({ ...current, modules: { ...current.modules, [key]: on } }));
  const setText = (key: string, value: string) => update((current) => ({ ...current, texts: { ...current.texts, [key]: value } }));

  const applyServerContent = (content: AppContent) => {
    const normalized = normalizeAppContent(content);
    setSaved(normalized);
    setDraft(normalized);
    setServerErrors({});
  };

  const save = async () => {
    if (!draft) return;
    const problems = Object.keys(localErrors);
    if (problems.length) {
      expandSectionsFor(problems);
      toast.error('Fix the highlighted fields before saving.');
      return;
    }
    setServerErrors({});
    const updated = await saveSubmit.run(async () => {
      try {
        if (scope) return normalizeAppContent((await platformApi.appContent.org.update(scope, draft)).content);
        return await platformApi.appContent.update(draft);
      } catch (error) {
        if (error instanceof PlatformApiError && Object.keys(error.pathErrors).length) {
          setServerErrors(error.pathErrors);
          expandSectionsFor(Object.keys(error.pathErrors));
        }
        throw error;
      }
    });
    if (updated) {
      applyServerContent(updated);
      void reloadAppContent();
      toast.success(
        perOrg
          ? `Saved for ${orgName ?? 'this organization'}. Only its users see these changes.`
          : 'App content saved. Every organization without its own customization now sees these changes.',
      );
    } else if (saveSubmit.errorRef.current) {
      toast.error('The app content could not be saved. See the highlighted fields.');
    }
  };

  const reset = async () => {
    const defaults = await resetSubmit.run(async () => {
      return scope ? normalizeAppContent((await platformApi.appContent.org.reset(scope)).content) : platformApi.appContent.reset();
    });
    if (defaults) {
      applyServerContent(defaults);
      void reloadAppContent();
      setConfirmingReset(false);
      toast.success(perOrg ? `${orgName ?? 'The organization'} now uses the shared content again.` : 'App content was reset to the defaults.');
    }
  };

  const discard = () => {
    if (saved) setDraft(saved);
    setServerErrors({});
    saveSubmit.reset();
  };

  const orgOptions = [
    { value: '', label: 'All organizations (shared content)' },
    ...(orgs.data?.items ?? []).map((org) => ({ value: org.id, label: org.name })),
  ];
  if (scope && !orgOptions.some((option) => option.value === scope)) {
    orgOptions.push({ value: scope, label: orgName ?? 'Selected organization' });
  }

  const header = (
    <>
      <PageHeader
        title="App content"
        subtitle="Edit what organizations see after signing in: branding, which modules are on, and every label and message."
      />
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-body">
          <div className="form-grid-2">
            <SelectField
              label="Apply changes to"
              value={scope}
              options={orgOptions}
              disabled={dirty}
              hint={
                dirty
                  ? 'Save or discard your changes before switching.'
                  : scope
                    ? 'Only this organization sees what you change here. Anything you leave as it is keeps following the shared content.'
                    : 'The shared content every organization sees, unless an organization has its own customization.'
              }
              onChange={(e) => changeScope(e.target.value)}
            />
          </div>
          {perOrg ? (
            <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 4 }}>
              <Building2 size={15} aria-hidden="true" />
              <span className="small">
                Editing <strong>{orgName ?? 'this organization'}</strong> only · {customizedCount} customized{' '}
                {customizedCount === 1 ? 'field' : 'fields'}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );

  if (!draft) {
    return (
      <>
        {header}
        <div className="card">
          {remote.error ? <ErrorBlock message={remote.error} onRetry={remote.reload} /> : <LoadingBlock label="Loading app content…" />}
        </div>
      </>
    );
  }

  const { branding, modules, texts } = draft;
  const sectionProps = (id: string) => ({
    id,
    open: openSections.has(id) || (Boolean(query) && id.startsWith('texts:')),
    onToggle: () => toggleSection(id),
    errorCount: errorCounts[id] ?? 0,
  });
  const colorValid = isHexColor(branding.primaryColor);
  const palette = brandPalette(colorValid ? branding.primaryColor : DEFAULT_APP_CONTENT.branding.primaryColor);
  const disabledModules = APP_MODULES.filter((module) => !modules[module.key]).length;

  return (
    <>
      {header}

      <div className="notification notification-info" role="note" style={{ marginBottom: 12 }}>
        <Briefcase size={16} aria-hidden="true" />
        <span>
          Preview in an organization: after saving, open any organization from <Link to="/platform/workspace">Workspace</Link> to see the
          app exactly as its users do.
        </span>
      </div>

      <div className="site-editor">
        <FormError message={saveSubmit.error} />

        <EditorSection {...sectionProps('branding')} title="Branding" description="App name, logo and primary colour used in the header, sign-in pages and buttons.">
          <div className="form-grid-3">
            <TextField
              label="App name"
              required
              maxLength={LIMITS.appNameMax}
              value={branding.appName}
              error={errors['branding.appName']}
              onChange={(e) => patchBranding({ appName: e.target.value })}
            />
            <TextField
              label="Logo URL"
              hint="A site path such as /rooman-logo.png or an https:// URL."
              maxLength={LIMITS.logoUrl}
              value={branding.logoUrl}
              error={errors['branding.logoUrl']}
              onChange={(e) => patchBranding({ logoUrl: e.target.value })}
            />
            <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
              <input
                type="color"
                aria-label="Pick primary colour"
                value={colorValid ? branding.primaryColor.toLowerCase() : DEFAULT_APP_CONTENT.branding.primaryColor}
                onChange={(e) => patchBranding({ primaryColor: e.target.value })}
                style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 8, background: 'none', marginBottom: 14 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextField
                  label="Primary colour"
                  hint="Hex, e.g. #2563eb"
                  maxLength={7}
                  value={branding.primaryColor}
                  error={errors['branding.primaryColor']}
                  onChange={(e) => patchBranding({ primaryColor: e.target.value.trim() })}
                />
              </div>
            </div>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="site-editor-legend">Live preview</span>
            <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Branding preview">
              <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                <img src={branding.logoUrl} alt="" width={24} height={24} style={{ borderRadius: 6 }} />
                <strong>{branding.appName || DEFAULT_APP_CONTENT.branding.appName}</strong>
              </span>
              <span className="btn btn-primary btn-sm" style={{ background: palette.primary, borderColor: palette.primary, pointerEvents: 'none' }}>
                {texts['header.create'] || DEFAULT_TEXTS['header.create']}
              </span>
              <span
                style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: 8, background: palette.soft, color: palette.hover, fontWeight: 600, fontSize: 13 }}
              >
                {texts['sidebar.dashboard'] || DEFAULT_TEXTS['sidebar.dashboard']}
              </span>
            </div>
          </div>
        </EditorSection>

        <EditorSection
          {...sectionProps('modules')}
          title="Modules"
          description={
            disabledModules
              ? `${disabledModules} of ${APP_MODULES.length} modules are turned off. Dashboard and Settings are always on.`
              : 'Every module is on. Turned-off modules disappear from the sidebar and their pages redirect to the dashboard.'
          }
        >
          <div className="form-grid-3">
            {APP_MODULES.map((module) => (
              <CheckboxField
                key={module.key}
                label={module.label}
                hint={module.routes.join(', ')}
                checked={modules[module.key]}
                onChange={(e) => setModule(module.key, e.target.checked)}
              />
            ))}
          </div>
        </EditorSection>

        <div className="card">
          <div className="card-body">
            <SearchInput value={search} onChange={setSearch} placeholder="Search texts by key, label or wording…" label="Search texts" />
          </div>
        </div>

        {visibleGroups.length === 0 ? <p className="text-muted small">No texts match “{search}”.</p> : null}

        {visibleGroups.map((group) => {
          const changedCount = group.keys.filter((key) => isChanged(key, texts[key] ?? '', baseline.texts)).length;
          return (
            <EditorSection
              key={group.id}
              {...sectionProps(`texts:${group.id}`)}
              title={group.label}
              description={`${group.keys.length} ${group.keys.length === 1 ? 'text' : 'texts'}${changedCount ? ` · ${changedCount} changed` : ''}`}
            >
              {group.keys.map((key) => {
                const value = texts[key] ?? '';
                const changed = isChanged(key, value, baseline.texts);
                return (
                  <div className="site-editor-string-row" key={key}>
                    <TextField
                      label={textLabel(key)}
                      hint={changed ? `${key} · ${perOrg ? 'customized' : 'changed'}` : key}
                      placeholder={baseline.texts[key] ?? DEFAULT_TEXTS[key]}
                      maxLength={LIMITS.text + 50}
                      value={value}
                      error={errors[`texts.${key}`]}
                      onChange={(e) => setText(key, e.target.value)}
                    />
                    <span className="site-editor-row-controls">
                      {changed ? <Badge tone="info">{perOrg ? 'Customized' : 'Changed'}</Badge> : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Undo2 size={14} />}
                        disabled={!changed}
                        aria-label={`Reset ${key} to ${perOrg ? 'shared text' : 'default'}`}
                        title={perOrg ? 'Use the shared text' : 'Reset to default'}
                        onClick={() => setText(key, baseline.texts[key] ?? DEFAULT_TEXTS[key])}
                      />
                    </span>
                  </div>
                );
              })}
            </EditorSection>
          );
        })}
      </div>

      <div className="form-actions-bar">
        <div className="row-between">
          <span className={dirty ? 'text-warning small strong' : 'text-subtle small'} role="status" aria-live="polite">
            {dirty ? 'You have unsaved changes' : 'All changes saved'}
          </span>
          <div className="row site-editor-actions">
            <Button
              variant="ghost"
              icon={<RotateCcw size={15} />}
              disabled={saveSubmit.submitting}
              onClick={() => {
                resetSubmit.reset();
                setConfirmingReset(true);
              }}
            >
              {perOrg ? 'Remove customizations' : 'Reset all to defaults'}
            </Button>
            <Button variant="secondary" icon={<Undo2 size={15} />} disabled={!dirty || saveSubmit.submitting} onClick={discard}>
              Discard changes
            </Button>
            <Button variant="primary" icon={<Save size={15} />} loading={saveSubmit.submitting} disabled={!dirty} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingReset}
        title={perOrg ? `Remove customizations for ${orgName ?? 'this organization'}` : 'Reset app content to defaults'}
        message={
          <>
            <FormError message={resetSubmit.error} />
            {perOrg ? (
              <p>
                Drop every customization for {orgName ?? 'this organization'} so it shows the shared content again? This cannot be undone
                {dirty ? ' — your unsaved changes will also be lost' : ''}.
              </p>
            ) : (
              <p>
                Restore the built-in branding, turn every module back on and reset every shared text? Organizations with their own
                customizations keep them. This cannot be undone{dirty ? ' — your unsaved changes will also be lost' : ''}.
              </p>
            )}
          </>
        }
        confirmLabel={perOrg ? 'Remove customizations' : 'Reset all to defaults'}
        busy={resetSubmit.submitting}
        onConfirm={() => void reset()}
        onCancel={() => {
          if (!resetSubmit.submitting) setConfirmingReset(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

interface EditorSectionProps {
  id: string;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  errorCount: number;
  children: ReactNode;
}

/** A collapsible card. Collapsed content is unmounted (the draft lives in the page, so nothing is lost). */
function EditorSection({ id, title, description, open, onToggle, errorCount, children }: EditorSectionProps) {
  const panelId = `app-editor-${id.replace(':', '-')}`;
  return (
    <section className={`card site-editor-section ${open ? 'is-open' : ''}`} aria-labelledby={`${panelId}-title`}>
      <h2 className="site-editor-heading" id={`${panelId}-title`}>
        <button type="button" className="site-editor-toggle" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={onToggle}>
          <ChevronRight size={16} className="site-editor-chevron" aria-hidden="true" />
          <span className="site-editor-heading-text">
            <span className="card-title">{title}</span>
            <span className="card-subtitle">{description}</span>
          </span>
          {errorCount > 0 ? <Badge tone="danger">{errorCount === 1 ? '1 issue' : `${errorCount} issues`}</Badge> : null}
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="card-body stack">
          {children}
        </div>
      ) : null}
    </section>
  );
}
