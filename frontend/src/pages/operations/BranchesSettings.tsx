/** Settings card: branches / locations used to split the profit and loss. */
import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { type Branch, branchesApi } from '@/api/operations';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { CheckboxField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

export function BranchesSettings() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const list = useAsync(() => branchesApi.list(true), []);
  const [editing, setEditing] = useState<Partial<Branch> | null>(null);
  const { run, errorRef } = useSubmit();

  const remove = async (branch: Branch) => {
    const res = await run(() => branchesApi.remove(branch.id));
    if (res) {
      toast.success(res.message);
      list.reload();
    } else toast.error(errorRef.current ?? t('common.error.generic'));
  };

  return (
    <Card
      title={t('ops.branches.title')}
      subtitle={t('ops.branches.subtitle')}
      actions={
        isAdmin ? (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setEditing({ isActive: true })}>
            {t('ops.branches.add')}
          </Button>
        ) : null
      }
    >
      {(list.data ?? []).length === 0 ? (
        <p className="small text-subtle">{t('ops.branches.empty')}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('ops.branches.name')}</th>
              <th>{t('ops.branches.code')}</th>
              <th>GSTIN</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((b) => (
              <tr key={b.id}>
                <td>
                  {b.name} {b.isActive ? null : <Badge>{t('ops.branches.inactive')}</Badge>}
                </td>
                <td>{b.code ?? '—'}</td>
                <td>{b.gstin ?? '—'}</td>
                <td className="align-right">
                  {isAdmin ? (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" variant="ghost" icon={<Pencil size={13} />} aria-label={t('ops.branches.edit')} onClick={() => setEditing(b)} />
                      <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} aria-label={t('ops.branches.delete')} onClick={() => remove(b)} />
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing ? (
        <BranchModal
          branch={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function BranchModal({ branch, onClose, onSaved }: { branch: Partial<Branch>; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const [form, setForm] = useState({
    name: branch.name ?? '',
    code: branch.code ?? '',
    gstin: branch.gstin ?? '',
    address: branch.address ?? '',
    isActive: branch.isActive ?? true,
  });
  const { submitting, error, run } = useSubmit();
  const save = async () => {
    const body = { name: form.name.trim(), code: form.code.trim() || null, gstin: form.gstin.trim().toUpperCase() || null, address: form.address.trim() || null, isActive: form.isActive };
    const saved = await run(() => (branch.id ? branchesApi.update(branch.id, body) : branchesApi.create(body)));
    if (saved) onSaved();
  };
  return (
    <Modal
      open
      title={branch.id ? t('ops.branches.edit') : t('ops.branches.add')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={submitting} disabled={!form.name.trim()} onClick={save}>
            {t('ops.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('ops.branches.name')} value={form.name} required maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label={t('ops.branches.code')} value={form.code} maxLength={20} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <TextField label="GSTIN" value={form.gstin} maxLength={15} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
        <TextField label={t('ops.branches.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </div>
      <CheckboxField label={t('ops.branches.active')} checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
    </Modal>
  );
}
