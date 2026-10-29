/** Custom roles (Settings → Users & roles): name a role and click No access / View / Edit for each feature. */
import { useMemo, useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';

import { useScopedOrgApi, type OrgRole, type RoleFeature } from '@/api/ApiScope';
import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import type { AccessLevel } from '@/utils/permissions';

const LEVELS: AccessLevel[] = ['none', 'view', 'edit'];

function summary(role: OrgRole, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const values = Object.values(role.permissions);
  return t('settings.roles.summary', { edit: values.filter((v) => v === 'edit').length, view: values.filter((v) => v === 'view').length });
}

export function RolesSettings({ onChanged }: { onChanged: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const orgApi = useScopedOrgApi();
  const roles = useAsync(() => orgApi.roles(), []);
  const catalog = useAsync(() => orgApi.roleCatalog(), []);
  const [editing, setEditing] = useState<OrgRole | 'new' | null>(null);
  const [deleting, setDeleting] = useState<OrgRole | null>(null);
  const remove = useSubmit();

  const confirmDelete = async () => {
    if (!deleting) return;
    const done = await remove.run(() => orgApi.deleteRole(deleting.id));
    if (done) {
      toast.success(t('settings.roles.deleted', { name: deleting.name }));
      setDeleting(null);
      roles.reload();
      onChanged();
    } else if (remove.errorRef.current) {
      toast.error(remove.errorRef.current);
      setDeleting(null);
    }
  };

  return (
    <Card
      title={t('settings.roles.title')}
      subtitle={t('settings.roles.subtitle')}
      actions={
        <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
          {t('settings.roles.new')}
        </Button>
      }
    >
      <div className="role-builtins">
        {(['admin', 'staff', 'viewer'] as const).map((key) => (
          <div key={key} className="role-builtin">
            <strong>{t(`settings.users.role.${key}`)}</strong>
            <span className="small text-muted">{t(`settings.roles.builtin.${key}`)}</span>
          </div>
        ))}
      </div>
      {roles.loading ? <LoadingBlock /> : null}
      {roles.error ? <ErrorBlock message={roles.error} onRetry={roles.reload} /> : null}
      {!roles.loading && !roles.error && (roles.data ?? []).length === 0 ? (
        <EmptyState icon={<ShieldCheck size={22} />} title={t('settings.roles.empty.title')} description={t('settings.roles.empty.body')} />
      ) : null}
      {(roles.data ?? []).length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('settings.roles.col.name')}</th>
                <th>{t('settings.roles.col.access')}</th>
                <th className="align-right">{t('settings.roles.col.users')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(roles.data ?? []).map((role) => (
                <tr key={role.id}>
                  <td>
                    <button type="button" className="btn-link strong" onClick={() => setEditing(role)}>
                      {role.name}
                    </button>
                    {role.description ? <div className="small text-muted">{role.description}</div> : null}
                  </td>
                  <td>{summary(role, t)}</td>
                  <td className="align-right">
                    <Badge tone={role.userCount ? 'info' : 'neutral'}>{role.userCount}</Badge>
                  </td>
                  <td className="align-right">
                    <div className="row-actions">
                      <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(role)}>
                        {t('settings.roles.edit')}
                      </Button>
                      <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setDeleting(role)}>
                        {t('settings.users.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {editing && catalog.data ? (
        <RoleEditor
          role={editing === 'new' ? null : editing}
          catalog={catalog.data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            roles.reload();
            onChanged();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        title={t('settings.roles.deleteTitle')}
        message={deleting ? t('settings.roles.deleteConfirm', { name: deleting.name }) : ''}
        confirmLabel={t('settings.users.delete')}
        busy={remove.submitting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

function RoleEditor({ role, catalog, onClose, onSaved }: { role: OrgRole | null; catalog: RoleFeature[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const orgApi = useScopedOrgApi();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<Record<string, AccessLevel>>(() =>
    Object.fromEntries(catalog.map((f) => [f.key, role?.permissions[f.key] ?? 'none'])),
  );
  const groups = useMemo(() => {
    const out = new Map<string, RoleFeature[]>();
    catalog.forEach((f) => out.set(f.group, [...(out.get(f.group) ?? []), f]));
    return [...out.entries()];
  }, [catalog]);
  const setAll = (keys: string[], level: AccessLevel) => setPerms((current) => ({ ...current, ...Object.fromEntries(keys.map((k) => [k, level])) }));
  const anyAccess = Object.values(perms).some((v) => v !== 'none');

  const save = async () => {
    const body = { name: name.trim(), description: description.trim() || null, permissions: perms };
    const saved = await run(() => (role ? orgApi.updateRole(role.id, body) : orgApi.createRole(body)));
    if (saved) {
      toast.success(t(role ? 'settings.roles.updated' : 'settings.roles.created', { name: saved.name }));
      onSaved();
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={role ? t('settings.roles.editTitle', { name: role.name }) : t('settings.roles.newTitle')}
      subtitle={t('settings.roles.editorSubtitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={submitting} disabled={name.trim().length < 2 || !anyAccess}>
            {t('settings.roles.save')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <FormError message={error} />
        <div className="form-grid">
          <TextField label={t('settings.roles.name')} placeholder={t('settings.roles.namePlaceholder')} value={name} maxLength={60} required error={fieldErrors.name} onChange={(e) => setName(e.target.value)} />
          <TextField label={t('settings.roles.description')} value={description} maxLength={250} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="row-actions role-quick">
          <span className="small text-muted">{t('settings.roles.setAll')}</span>
          {LEVELS.map((level) => (
            <Button key={level} variant="secondary" size="sm" onClick={() => setAll(Object.keys(perms), level)}>
              {t(`settings.roles.level.${level}`)}
            </Button>
          ))}
        </div>
        {groups.map(([group, features]) => (
          <div key={group} className="role-group">
            <div className="role-group-head">
              <strong>{group}</strong>
              <div className="row-actions">
                {LEVELS.map((level) => (
                  <button key={level} type="button" className="btn-link small" onClick={() => setAll(features.map((f) => f.key), level)}>
                    {t('settings.roles.groupAll', { level: t(`settings.roles.level.${level}`) })}
                  </button>
                ))}
              </div>
            </div>
            {features.map((feature) => (
              <div key={feature.key} className="role-row">
                <span>{feature.label}</span>
                <div className="segmented" role="radiogroup" aria-label={feature.label}>
                  {LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={perms[feature.key] === level}
                      className={`segmented-option is-${level} ${perms[feature.key] === level ? 'is-active' : ''}`}
                      onClick={() => setPerms((current) => ({ ...current, [feature.key]: level }))}
                    >
                      {t(`settings.roles.level.${level}`)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
