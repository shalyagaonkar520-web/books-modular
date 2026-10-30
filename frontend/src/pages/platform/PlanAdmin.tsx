/**
 * Super admin: set any organization's plan by users (plan, users, price, cycle,
 * paid-until date), edit the plan prices and payment details, and answer
 * organizations' requests.
 */
import { useEffect, useState } from 'react';
import { CreditCard, Save } from 'lucide-react';

import type { PlanCatalog, PlanKey } from '@/api/plans';
import { platformClient } from '@/api/platformClient';
import { RequestsBoard, type RequestsApi, type SupportTicket } from '@/components/support/RequestsBoard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';

const PLAN_OPTIONS = [
  { value: 'u100', label: 'Up to 100 users' },
  { value: 'u500', label: 'Up to 500 users' },
  { value: 'u1000', label: 'Up to 1000 users' },
  { value: 'custom', label: 'Custom' },
];

export function SetPlanDialog({
  org,
  onClose,
  onSaved,
}: {
  org: { id: string; name: string; planKey?: string | null; maxUsers?: number | null; planEndsAt?: string | null; monthlyPrice?: number | null; billingCycle?: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const defaultEnd = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  };
  const [planKey, setPlanKey] = useState<PlanKey>((org.planKey as PlanKey) ?? 'u100');
  const [users, setUsers] = useState(String(org.maxUsers ?? 100));
  const [price, setPrice] = useState(org.monthlyPrice !== null && org.monthlyPrice !== undefined ? String(org.monthlyPrice) : '');
  const [cycle, setCycle] = useState(org.billingCycle === 'yearly' ? 'yearly' : 'monthly');
  const [ends, setEnds] = useState(org.planEndsAt ? org.planEndsAt.slice(0, 10) : defaultEnd());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const preset = { u100: '100', u500: '500', u1000: '1000' }[planKey as 'u100'];
    if (preset) setUsers(preset);
  }, [planKey]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await platformClient.put(`/platform/organizations/${org.id}/plan`, {
        planKey,
        maxUsers: Number(users) || null,
        billingCycle: cycle,
        monthlyPrice: price === '' ? null : Number(price),
        planEndsAt: ends ? new Date(`${ends}T23:59:59`).toISOString() : null,
      });
      toast.success(`Plan for ${org.name} saved.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Set plan · ${org.name}`}
      subtitle="Active at once. Users are capped at the number below; the app locks after the paid-until date until renewed."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save plan
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <FormError message={error} />
        <SelectField label="Plan" value={planKey} options={PLAN_OPTIONS} onChange={(e) => setPlanKey(e.target.value as PlanKey)} />
        <TextField label="Users allowed" type="number" min="1" max="100000" value={users} onChange={(e) => setUsers(e.target.value)} />
        <SelectField
          label="Billing"
          value={cycle}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
          onChange={(e) => setCycle(e.target.value)}
        />
        <TextField label="Price per month (₹)" type="number" min="0" value={price} hint="Leave empty for the catalogue price of the features." onChange={(e) => setPrice(e.target.value)} />
        <TextField label="Paid until" type="date" value={ends} hint="Empty = no end date." onChange={(e) => setEnds(e.target.value)} />
      </div>
    </Modal>
  );
}

export function PlansSettingsCard() {
  const toast = useToast();
  const loaded = useAsync(() => platformClient.get<PlanCatalog>('/platform/plans'), []);
  const [draft, setDraft] = useState<PlanCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (loaded.data) setDraft(loaded.data);
  }, [loaded.data]);

  if (loaded.loading && !draft) return <LoadingBlock />;
  if (loaded.error || !draft) return <ErrorBlock message={loaded.error ?? ''} onRetry={loaded.reload} />;

  const setTier = (index: number, field: 'label' | 'users' | 'monthly' | 'storageGb', value: string) =>
    setDraft({ ...draft, tiers: draft.tiers.map((t, i) => (i === index ? { ...t, [field]: field === 'label' ? value : Number(value) } : t)) });

  const save = async () => {
    setBusy(true);
    try {
      const { features: _features, ...body } = draft;
      void _features;
      setDraft(await platformClient.put<PlanCatalog>('/platform/plans', body));
      toast.success('Plans and payment details saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Plans by users & payment details"
      subtitle="What organizations see when they choose a plan, and where they pay."
      actions={
        <Button variant="primary" size="sm" icon={<Save size={15} />} loading={busy} onClick={() => void save()}>
          Save
        </Button>
      }
    >
      <div className="stack">
        {draft.tiers.map((tier, i) => (
          <div key={tier.key} className="form-grid-3">
            <TextField label={`Plan ${i + 1} name`} value={tier.label} onChange={(e) => setTier(i, 'label', e.target.value)} />
            <TextField label="Users" type="number" min="1" value={String(tier.users)} onChange={(e) => setTier(i, 'users', e.target.value)} />
            <TextField label="Price per month (₹)" type="number" min="0" value={String(tier.monthly)} onChange={(e) => setTier(i, 'monthly', e.target.value)} />
            <TextField label="Storage (GB)" type="number" min="1" value={String(tier.storageGb)} onChange={(e) => setTier(i, 'storageGb', e.target.value)} />
          </div>
        ))}
        <div className="form-grid-3">
          <TextField label="Custom: ₹ per 100 users over the top plan" type="number" min="0" value={String(draft.per100Over)} onChange={(e) => setDraft({ ...draft, per100Over: Number(e.target.value) })} />
          <TextField label="Custom: lowest price per month (₹)" type="number" min="0" value={String(draft.customMinimum)} onChange={(e) => setDraft({ ...draft, customMinimum: Number(e.target.value) })} />
          <TextField label="Yearly = this many months" type="number" min="1" max="12" value={String(draft.yearlyMonths)} onChange={(e) => setDraft({ ...draft, yearlyMonths: Number(e.target.value) })} />
        </div>
        <div className="form-grid">
          <TextField label="Your UPI ID" placeholder="e.g. rooman@okicici" value={draft.payment.upiId} onChange={(e) => setDraft({ ...draft, payment: { ...draft.payment, upiId: e.target.value } })} />
          <TextField label="Payee name" value={draft.payment.payeeName} onChange={(e) => setDraft({ ...draft, payment: { ...draft.payment, payeeName: e.target.value } })} />
        </div>
        <TextAreaField label="Bank details (shown as written)" rows={3} value={draft.payment.bankDetails} onChange={(e) => setDraft({ ...draft, payment: { ...draft.payment, bankDetails: e.target.value } })} />
        <TextField label="Note under the payment details" value={draft.payment.note} onChange={(e) => setDraft({ ...draft, payment: { ...draft.payment, note: e.target.value } })} />
      </div>
    </Card>
  );
}

const platformRequestsApi: RequestsApi = {
  list: (status) => platformClient.get<SupportTicket[]>('/platform/requests', status ? { status } : undefined),
  get: (id) => platformClient.get<SupportTicket>(`/platform/requests/${id}`),
  reply: (id, message) => platformClient.post<SupportTicket>(`/platform/requests/${id}/messages`, { message }),
  setStatus: (id, status) => platformClient.post<SupportTicket>(`/platform/requests/${id}/status`, { status }),
};

export function PlatformRequestsPage() {
  return (
    <div className="stack">
      <PageHeader title="Requests" subtitle="Support requests from every organization's users: issues, questions about changes, more users, plans. Answer here; they see your reply in Support and by email." />
      <RequestsBoard api={platformRequestsApi} side="platform" />
    </div>
  );
}

export function SetPlanButton(props: Parameters<typeof SetPlanDialog>[0]['org'] & { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { onSaved, ...org } = props;
  return (
    <>
      <Button variant="secondary" size="sm" icon={<CreditCard size={14} />} onClick={() => setOpen(true)}>
        Set plan & users
      </Button>
      {open ? <SetPlanDialog org={org} onClose={() => setOpen(false)} onSaved={onSaved} /> : null}
    </>
  );
}
