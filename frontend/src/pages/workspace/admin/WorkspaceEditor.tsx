import { useEffect, useMemo, useState } from 'react';

import { ApiError } from '@/api/client';
import { workspaceAdminApi, type Workspace, type WorkspaceAction, type WorkspaceCatalog, type WorkspacePermissions } from '@/api/workspace';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/Switch';

interface Props {
  open: boolean;
  catalog: WorkspaceCatalog;
  workspace: Workspace | null;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: WorkspacePermissions = { features: {}, financial: false };

/** Create or change a workspace: name, department, and the module x action permission matrix. */
export function WorkspaceEditor({ open, catalog, workspace, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [perms, setPerms] = useState<WorkspacePermissions>(EMPTY);
  const [allowAuto, setAllowAuto] = useState(true);
  const [allowManual, setAllowManual] = useState(true);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(workspace?.name ?? '');
    setDepartment(workspace?.department ?? '');
    setDescription(workspace?.description ?? '');
    setContext(workspace?.config.context ?? '');
    setPerms(workspace ? JSON.parse(JSON.stringify(workspace.permissions)) : { features: {}, financial: false });
    setAllowAuto(workspace?.config.allowAuto ?? true);
    setAllowManual(workspace?.config.allowManual ?? true);
    setActive(workspace?.isActive ?? true);
    setError(null);
  }, [open, workspace]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof catalog.features>();
    catalog.features.forEach((f) => map.set(f.group, [...(map.get(f.group) ?? []), f]));
    return Array.from(map.entries());
  }, [catalog]);

  const has = (key: string, action: WorkspaceAction) => perms.features[key]?.includes(action) ?? false;

  const toggle = (key: string, action: WorkspaceAction) => {
    setPerms((current) => {
      const now = new Set(current.features[key] ?? []);
      if (now.has(action)) {
        now.delete(action);
        // Without View nothing else makes sense.
        if (action === 'view') now.clear();
      } else {
        now.add(action);
        now.add('view');
      }
      const features = { ...current.features };
      if (now.size) features[key] = Array.from(now) as WorkspaceAction[];
      else delete features[key];
      return { ...current, features };
    });
  };

  const applyPreset = (key: string) => {
    const preset = catalog.presets.find((p) => p.key === key);
    if (!preset) return;
    setPerms(JSON.parse(JSON.stringify(preset.permissions)));
    if (!name) setName(preset.name);
    if (!department) setDepartment(preset.department);
    if (!description) setDescription(preset.description);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = { name, department, description, permissions: perms, isActive: active, config: { allow_auto: allowAuto, allow_manual: allowManual, context } } as unknown as Partial<Workspace>;
    try {
      if (workspace) await workspaceAdminApi.updateWorkspace(workspace.id, body);
      else await workspaceAdminApi.createWorkspace(body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the workspace');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={workspace ? `Edit ${workspace.name}` : 'New workspace'}
      subtitle="Everyone in a workspace gets exactly these permissions. Changes apply immediately, in the app and in the AI assistant."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {workspace ? 'Save changes' : 'Create workspace'}
          </Button>
        </>
      }
    >
      <div className="cm-grid">
        {!workspace ? (
          <div>
            <div className="cm-muted" style={{ marginBottom: 6 }}>
              Start from a template
            </div>
            <div className="cm-presets">
              {catalog.presets.map((p) => (
                <Button key={p.key} size="sm" onClick={() => applyPreset(p.key)}>
                  {p.name.replace(' Workspace', '')}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="cm-two">
          <TextField label="Workspace name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={48} />
          <TextField label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} required maxLength={80} />
        </div>
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        <TextAreaField label="Department context for the assistant (optional)" hint="Short, plain guidance such as “We sell wholesale cosmetics; quantities are in cartons.” It never overrides permissions." value={context} onChange={(e) => setContext(e.target.value.slice(0, 300))} rows={2} />

        <div className="table-wrap">
          <table className="cm-matrix">
            <thead>
              <tr>
                <th>Module</th>
                {catalog.actions.map((a) => (
                  <th key={a.key}>{a.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, list]) => (
                <GroupRows key={group} group={group} list={list} actions={catalog.actions} has={has} toggle={toggle} financialOn={perms.financial} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="cm-two">
          <div>
            <Switch checked={perms.financial} onChange={(v) => setPerms((p) => ({ ...p, financial: v }))} label="Financial data" />
            <span style={{ marginLeft: 10 }}>Financial data</span>
            <p className="cm-muted" style={{ margin: '4px 0 0' }}>
              Reports, banking, accounting, GST, payroll, cost prices and margins stay closed without this, whatever is ticked above.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Switch checked={allowAuto} onChange={setAllowAuto} label="Automatic mode" /> Automatic mode (AI chat) available
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Switch checked={allowManual} onChange={setAllowManual} label="Manual mode" /> Manual mode (regular screens) available
            </label>
            {workspace ? (
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Switch checked={active} onChange={setActive} label="Workspace on" /> Workspace is switched on
              </label>
            ) : null}
          </div>
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  );
}

function GroupRows({
  group,
  list,
  actions,
  has,
  toggle,
  financialOn,
}: {
  group: string;
  list: WorkspaceCatalog['features'];
  actions: WorkspaceCatalog['actions'];
  has: (key: string, action: WorkspaceAction) => boolean;
  toggle: (key: string, action: WorkspaceAction) => void;
  financialOn: boolean;
}) {
  return (
    <>
      <tr className="cm-group">
        <td colSpan={actions.length + 1}>{group}</td>
      </tr>
      {list.map((f) => (
        <tr key={f.key}>
          <td>
            {f.label}
            {f.financial ? <span className="cm-fin" title="Needs the Financial data switch">{financialOn ? '$ financial' : '$ locked'}</span> : null}
          </td>
          {actions.map((a) => (
            <td key={a.key}>
              <input type="checkbox" aria-label={`${f.label}: ${a.label}`} checked={has(f.key, a.key)} onChange={() => toggle(f.key, a.key)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
