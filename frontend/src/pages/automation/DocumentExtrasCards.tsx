/** Cards dropped into document pages: custom field values, the customer share link, and approval. */
import { useEffect, useState } from 'react';
import { Copy, Link2, Link2Off, ShieldCheck } from 'lucide-react';

import { approvalsApi, type CustomFieldEntity, customFieldsApi, shareApi } from '@/api/automation';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

/** Custom field values for one record; hidden when the organization has defined no fields for it. */
export function CustomFieldsCard({ entity, entityId }: { entity: CustomFieldEntity; entityId: string }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const fields = useAsync(() => customFieldsApi.list(entity), [entity]);
  const values = useAsync(() => customFieldsApi.values(entity, entityId), [entity, entityId]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const { submitting, error, run } = useSubmit();
  useEffect(() => setDraft(values.data?.values ?? {}), [values.data]);

  const active = (fields.data ?? []).filter((f) => f.isActive);
  if (!active.length) return null;

  const save = async () => {
    const saved = await run(() => customFieldsApi.saveValues(entity, entityId, Object.fromEntries(active.map((f) => [f.key, draft[f.key] ?? '']))));
    if (saved) toast.success(t('automation.fields.valuesSaved'));
  };

  return (
    <Card
      title={t('automation.fields.cardTitle')}
      footer={
        canWrite ? (
          <Button loading={submitting} onClick={save}>
            {t('inventory.save')}
          </Button>
        ) : undefined
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        {active.map((f) => {
          const value = draft[f.key] ?? '';
          const set = (v: string) => setDraft((d) => ({ ...d, [f.key]: v }));
          if (f.fieldType === 'select') {
            return <SelectField key={f.id} label={f.label} required={f.required} value={value} placeholder="—" disabled={!canWrite} options={f.options.map((o) => ({ value: o, label: o }))} onChange={(e) => set(e.target.value)} />;
          }
          if (f.fieldType === 'checkbox') {
            return <CheckboxField key={f.id} label={f.label} checked={value === 'true'} disabled={!canWrite} onChange={(e) => set(e.target.checked ? 'true' : 'false')} />;
          }
          return (
            <TextField
              key={f.id}
              label={f.label}
              required={f.required}
              type={f.fieldType === 'number' ? 'number' : f.fieldType === 'date' ? 'date' : 'text'}
              value={value}
              disabled={!canWrite}
              onChange={(e) => set(e.target.value)}
            />
          );
        })}
      </div>
    </Card>
  );
}

/** Create, copy and revoke the private link a customer opens to view (and answer) the document. */
export function ShareLinkCard({ kind, id, status }: { kind: 'invoice' | 'estimate'; id: string; status: string }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const [link, setLink] = useState<string | null>(null);
  const { submitting, run, errorRef } = useSubmit();
  if (['draft', 'void'].includes(status)) return null;
  const url = link ? `${window.location.origin}${link}` : null;

  const create = async () => {
    const res = await run(() => shareApi.create(kind, id));
    if (res) setLink(res.path);
    else toast.error(errorRef.current ?? t('common.error.generic'));
  };
  const revoke = async () => {
    const ok = await run(() => shareApi.revoke(kind, id));
    if (ok) {
      setLink(null);
      toast.success(t('automation.share.revoked'));
    }
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('automation.share.copied'));
    } catch {
      toast.error(t('automation.share.copyFailed'));
    }
  };

  return (
    <Card title={t('automation.share.title')} subtitle={t(kind === 'invoice' ? 'automation.share.subtitleInvoice' : 'automation.share.subtitleQuote')}>
      {url ? (
        <div className="row wrap">
          <input className="input" readOnly value={url} aria-label={t('automation.share.title')} style={{ flex: 1, minWidth: 260 }} />
          <Button icon={<Copy size={15} />} onClick={copy}>
            {t('automation.share.copy')}
          </Button>
          {canWrite ? (
            <Button variant="danger" icon={<Link2Off size={15} />} disabled={submitting} onClick={revoke}>
              {t('automation.share.revoke')}
            </Button>
          ) : null}
        </div>
      ) : canWrite ? (
        <Button icon={<Link2 size={15} />} loading={submitting} onClick={create}>
          {t('automation.share.create')}
        </Button>
      ) : null}
    </Card>
  );
}

/** On a draft invoice or bill over the approval limit: submit it, and show where it stands. */
interface ApprovalBannerProps {
  kind: 'invoice' | 'bill';
  id: string;
  status: string;
  total: number;
  approvalStatus?: string | null;
  approvalNote?: string | null;
  onChanged: () => void;
}

export function ApprovalBanner({ kind, id, status, total, approvalStatus, approvalNote, onChanged }: ApprovalBannerProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin, canWrite } = useAuth();
  const { submitting, run, errorRef } = useSubmit();
  const settings = useAsync(() => approvalsApi.settings(), []);
  const limit = kind === 'invoice' ? settings.data?.invoiceThreshold : settings.data?.billThreshold;
  const overLimit = limit !== null && limit !== undefined && total >= limit;
  if (!approvalStatus && !(status === 'draft' && overLimit)) return null;
  const act = async (label: string, action: () => Promise<unknown>) => {
    const ok = await run(action);
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(label);
      onChanged();
    }
  };
  return (
    <div className="alert alert-warning row-between">
      <span>
        <ShieldCheck size={15} aria-hidden="true" />{' '}
        {approvalStatus ? (
          <>
            {t('automation.approvals.statusLabel')} <Badge tone={approvalStatus === 'approved' ? 'success' : approvalStatus === 'rejected' ? 'danger' : 'warning'}>{t(`automation.approvals.status.${approvalStatus}`)}</Badge>
            {approvalNote ? ` · ${approvalNote}` : ''}
          </>
        ) : (
          t('automation.approvals.draftHint')
        )}
      </span>
      {status === 'draft' && canWrite ? (
        <span className="row">
          {approvalStatus !== 'pending' && approvalStatus !== 'approved' ? (
            <Button size="sm" disabled={submitting} onClick={() => act(t('automation.approvals.submitted'), () => approvalsApi.submit(kind, id))}>
              {t('automation.approvals.submit')}
            </Button>
          ) : null}
          {isAdmin && approvalStatus === 'pending' ? (
            <>
              <Button size="sm" variant="primary" disabled={submitting} onClick={() => act(t('automation.approvals.approved'), () => approvalsApi.approve(kind, id))}>
                {t('automation.approvals.approve')}
              </Button>
              <Button size="sm" variant="danger" disabled={submitting} onClick={() => act(t('automation.approvals.rejected'), () => approvalsApi.reject(kind, id))}>
                {t('automation.approvals.reject')}
              </Button>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
