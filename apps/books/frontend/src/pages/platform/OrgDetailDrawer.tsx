import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Ban,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Hourglass,
  KeyRound,
  Paintbrush,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  platformApi,
  type OrgDetail,
  type OrgPanelAdminItem,
  type OrgSummary,
  type PlatformAudit,
  type PlatformInvoice,
  type PlatformUser,
  type UpdateOrganizationBody,
} from '@/api/platform';
import { type ModulePricing } from '@/api/modulePricing';
import { daysUntil, trialRemaining } from '@/api/subscription';
import { ModuleBadges } from '@/components/modules/ModulePicker';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useModulePricing } from '@/hooks/useModulePricing';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatDateTime, formatPercent, titleCase } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

import { ImpersonateButton } from './ImpersonateButton';
import {
  CreatePanelAdminModal,
  PanelCredentialsModal,
  PanelLoginUrl,
  SetPanelPasswordModal,
  type PanelCredentials,
} from './PanelAdminForms';
import {
  OpenInAppMenu,
  OrgApprovalButtons,
  OrgStatusBadge,
  approvalBlocker,
  initialModules,
  isOrgArchived,
  isOrgPending,
  isOrgRejected,
  useOrgApproval,
  useOrgLifecycle,
} from './orgActions';
import { SubscriptionStatusBadge, planPriceLabel, usePlanDecisions } from './subscriptionActions';
import {
  CreatePlatformUserModal,
  EditPlatformUserModal,
  ResetPlatformUserPasswordModal,
} from './PlatformUserModals';

const TAB_PAGE_SIZE = 10;

const MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label, index) => ({
  value: String(index + 1),
  label,
}));

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface OrgDetailDrawerProps {
  orgId: string;
  onClose: () => void;
  /** Called after any change that should refresh the parent list. */
  onChanged: () => void;
}

type TabId = 'overview' | 'settings' | 'users' | 'panel' | 'invoices' | 'activity';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'Settings' },
  { id: 'users', label: 'Users' },
  { id: 'panel', label: 'Admin panel logins' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'activity', label: 'Activity' },
];

export function OrgDetailDrawer({ orgId, onClose, onChanged }: OrgDetailDrawerProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync((signal) => platformApi.organizations.get(orgId, signal), [orgId]);
  const suspendSubmit = useSubmit();
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');
  const catalog = useModulePricing();

  const lifecycle = useOrgLifecycle({
    onArchived: (updated) => {
      setData(updated);
      onChanged();
    },
    onRestored: (updated) => {
      setData(updated);
      onChanged();
    },
    onDeleted: () => {
      onChanged();
      onClose();
    },
  });

  const approval = useOrgApproval({
    onApproved: (updated) => {
      setData(updated);
      onChanged();
    },
    onRejected: (updated) => {
      setData(updated);
      onChanged();
    },
  });

  const decisions = usePlanDecisions({
    onChanged: () => {
      // Decision endpoints may answer with less than a full OrgDetail: re-read it.
      void platformApi.organizations.get(orgId).then(setData, () => undefined);
      onChanged();
    },
  });

  const toggleSuspend = async (org: OrgDetail) => {
    const next = !org.isSuspended;
    const updated = await suspendSubmit.run(() =>
      platformApi.organizations.update(org.id, {
        isSuspended: next,
        suspendedReason: next ? 'Suspended by platform admin' : undefined,
      }),
    );
    if (updated) {
      setData(updated);
      setConfirmingSuspend(false);
      toast.success(next ? `${org.name} is now suspended.` : `${org.name} is active again.`);
      onChanged();
    } else if (suspendSubmit.errorRef.current) {
      toast.error(suspendSubmit.errorRef.current);
    }
  };

  const archived = data ? isOrgArchived(data) : false;

  return (
    <Modal
      open
      title={data?.name ?? 'Organization'}
      subtitle={data ? `Created ${formatDate(data.createdAt)}` : undefined}
      size="lg"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading && !data ? <LoadingBlock label="Loading organization…" /> : null}
      {!loading && error && !data ? <ErrorBlock message={error} onRetry={reload} /> : null}
      {data ? (
        <div className="stack">
          <div className="row-between">
            <div className="row">
              <OrgStatusBadge org={data} />
              {archived ? (
                <span className="text-muted small">
                  Archived{data.deletedAt ? ` ${formatDateTime(data.deletedAt)}` : ''} · users cannot sign in
                </span>
              ) : data.isSuspended && data.suspendedReason ? (
                <span className="text-muted small">
                  {data.suspendedReason}
                  {data.suspendedAt ? ` · ${formatDateTime(data.suspendedAt)}` : ''}
                </span>
              ) : null}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button
                variant="secondary"
                size="sm"
                icon={<Paintbrush size={14} />}
                title="Edit branding, modules and texts for this organization only"
                onClick={() => navigate(`/platform/app-content?org=${encodeURIComponent(data.id)}`)}
              >
                Customize app
              </Button>
              <OpenInAppMenu org={data} detail={data} size="sm" />
            </div>
          </div>

          <ApprovalBanner data={data} approval={approval} />

          <Tabs tabs={TABS} active={tab} onChange={(id) => setTab(id as TabId)} />

          {tab === 'overview' ? (
            <>
              <SubscriptionSection
                data={data}
                catalog={catalog}
                manageable={!isOrgPending(data) && !isOrgRejected(data) && !archived}
                decisions={decisions}
              />
              <OverviewTab data={data} viewAsBlocker={approvalBlocker(data)} />
              <DangerZone
                data={data}
                suspending={suspendSubmit.submitting}
                onToggleSuspend={() => (data.isSuspended ? void toggleSuspend(data) : setConfirmingSuspend(true))}
                onArchive={() => lifecycle.requestArchive(data)}
                onRestore={() => lifecycle.requestRestore(data)}
                onDelete={() => lifecycle.requestDelete(data)}
              />
            </>
          ) : null}
          {tab === 'settings' ? (
            <OrgSettingsTab
              key={data.id}
              data={data}
              onSaved={(updated) => {
                setData(updated);
                onChanged();
              }}
            />
          ) : null}
          {tab === 'users' ? (
            <OrgUsersTab
              orgId={orgId}
              orgName={data.name}
              onChanged={() => {
                // Refresh counts / the admins list without blanking the drawer.
                void platformApi.organizations.get(orgId).then(setData, () => undefined);
                onChanged();
              }}
            />
          ) : null}
          {tab === 'panel' ? <PanelAdminsTab orgId={orgId} orgName={data.name} adminEmail={data.adminEmail} admins={data.admins} /> : null}
          {tab === 'invoices' ? <OrgInvoicesTab orgId={orgId} currency={data.currency} /> : null}
          {tab === 'activity' ? <OrgActivityTab orgId={orgId} /> : null}

          <ConfirmDialog
            open={confirmingSuspend}
            title="Suspend organization"
            message={
              <>
                <FormError message={suspendSubmit.error} />
                <p>
                  Suspend <strong>{data.name}</strong>? Its users are blocked from signing in until you unsuspend it. No data is
                  changed.
                </p>
              </>
            }
            confirmLabel="Suspend"
            busy={suspendSubmit.submitting}
            onConfirm={() => void toggleSuspend(data)}
            onCancel={() => setConfirmingSuspend(false)}
          />
          {decisions.dialogs}
          {lifecycle.dialogs}
          {approval.dialogs}
        </div>
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Approval banner
// ---------------------------------------------------------------------------

function ApprovalBanner({ data, approval }: { data: OrgDetail; approval: ReturnType<typeof useOrgApproval> }) {
  const pending = isOrgPending(data);
  if (!pending && !isOrgRejected(data)) return null;
  return (
    <div
      className={pending ? 'approval-callout is-pending' : 'approval-callout is-rejected'}
      role="status"
    >
      <div className="approval-callout-text">
        {pending ? <Clock size={16} aria-hidden="true" /> : <Ban size={16} aria-hidden="true" />}
        <div>
          <strong>{pending ? 'Awaiting approval' : 'Registration rejected'}</strong>
          <p>
            {pending
              ? `Registered ${formatDateTime(data.createdAt)}${data.adminEmail ? ` by ${data.adminEmail}` : ''}. Its users cannot sign in until you approve it.`
              : data.rejectionReason
                ? `Reason: ${data.rejectionReason}`
                : 'No reason was recorded. Its users cannot sign in.'}
          </p>
        </div>
      </div>
      <OrgApprovalButtons org={data} approval={approval} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscription (trial, plan, plan request)
// ---------------------------------------------------------------------------

interface SubscriptionSectionProps {
  data: OrgDetail;
  catalog: ModulePricing;
  /** False while the organization awaits approval, was rejected, or is archived. */
  manageable: boolean;
  decisions: ReturnType<typeof usePlanDecisions>;
}

function SubscriptionSection({ data, catalog, manageable, decisions }: SubscriptionSectionProps) {
  const status = data.subscriptionStatus ?? null;
  const plan = data.plan ?? null;
  const request = data.pendingRequest ?? null;
  const target = { id: data.id, name: data.name, trialEndsAt: data.trialEndsAt };
  // Legacy payloads: the modules the organization has, else every module.
  const current = plan?.modules ?? data.requestedModules ?? null;
  const daysLeft = daysUntil(data.trialEndsAt);

  let summary: string;
  if (isOrgPending(data) || isOrgRejected(data)) {
    summary = 'The free trial with every module starts when you approve this organization.';
  } else if (status === 'trial') {
    summary = `Free trial with every module · ${trialRemaining(daysLeft)}${data.trialEndsAt ? ` · ends ${formatDate(data.trialEndsAt)}` : ''}`;
  } else if (status === 'expired') {
    summary = `No active plan, so the app is locked for its users${data.trialEndsAt ? ` · trial ended ${formatDate(data.trialEndsAt)}` : ''}`;
  } else if (status === 'active' && plan) {
    summary = `${plan.modules.length} module${plan.modules.length === 1 ? '' : 's'} · ${planPriceLabel(plan, catalog)}`;
  } else if (status === 'active') {
    summary = 'Active plan';
  } else {
    summary = current ? `${current.length} module${current.length === 1 ? '' : 's'}` : 'All modules';
  }

  return (
    <section className="card" style={{ padding: '12px 14px' }} aria-labelledby="org-subscription-title">
      <div className="stack" style={{ gap: 10 }}>
        <div className="row-between">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="row" style={{ gap: 8 }}>
              <h3 className="card-subtitle" id="org-subscription-title" style={{ margin: 0 }}>
                Subscription
              </h3>
              <SubscriptionStatusBadge status={status} />
            </span>
            <span className="text-muted small" data-testid="org-subscription-summary">
              {summary}
            </span>
          </div>
          {manageable ? (
            <div className="row" style={{ gap: 8 }}>
              {status !== 'active' ? (
                <Button variant="secondary" size="sm" icon={<CalendarPlus size={14} />} onClick={() => decisions.requestExtendTrial(target)}>
                  Extend trial
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil size={14} />}
                onClick={() =>
                  decisions.requestChangePlan(target, {
                    modules: initialModules(current, catalog),
                    billingCycle: plan?.billingCycle ?? 'monthly',
                  })
                }
              >
                Change plan
              </Button>
            </div>
          ) : null}
        </div>

        {status === 'active' && plan?.modules.length ? <ModuleBadges catalog={catalog} value={plan.modules} /> : null}
        {!status && current?.length ? <ModuleBadges catalog={catalog} value={current} /> : null}
        {data.subscriptionNote ? (
          <p className="text-muted small" style={{ margin: 0 }}>
            {data.subscriptionNote}
          </p>
        ) : null}

        {request ? (
          <div className="subscription-note is-pending" role="group" aria-label="Plan request">
            <Hourglass size={16} aria-hidden="true" />
            <div className="stack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
              <div className="row-between">
                <span>
                  <strong>Plan request</strong>
                  <span className="text-muted small">
                    {request.requestedAt ? ` · ${formatDateTime(request.requestedAt)}` : ''} · {planPriceLabel(request, catalog)}
                  </span>
                </span>
                {manageable ? (
                  <span className="row" style={{ gap: 6 }}>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<BadgeCheck size={14} />}
                      onClick={() => decisions.requestAccept(target, { modules: request.modules, billingCycle: request.billingCycle })}
                    >
                      Accept
                    </Button>
                    <Button variant="secondary" size="sm" icon={<Ban size={14} />} onClick={() => decisions.requestReject(target)}>
                      Reject
                    </Button>
                  </span>
                ) : null}
              </div>
              <ModuleBadges catalog={catalog} value={request.modules} />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ data, viewAsBlocker }: { data: OrgDetail; viewAsBlocker: string | null }) {
  const adminColumns: Array<Column<PlatformUser>> = [
    {
      key: 'name',
      header: 'Administrator',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          <small>{row.email}</small>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (row) => <Badge tone="info">{row.role}</Badge> },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : <span className="text-muted">Never</span>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <ImpersonateButton user={row} disabledReason={viewAsBlocker} />
        </div>
      ),
    },
  ];

  const fiscalMonth = data.fiscalYearStartMonth ? MONTH_NAMES[data.fiscalYearStartMonth - 1] : undefined;

  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile label="Users" value={String(data.userCount)} />
        <StatTile label="Invoices" value={String(data.invoiceCount)} />
        <StatTile label="Bills" value={String(data.billCount)} />
        <StatTile label="Contacts" value={String(data.contactCount)} />
        <StatTile label="Invoiced" value={formatCurrency(data.invoicedAmount, data.currency)} />
        <StatTile label="Collected" value={formatCurrency(data.collectedAmount, data.currency)} tone="positive" />
        <StatTile
          label="Outstanding"
          value={formatCurrency(data.outstandingReceivables, data.currency)}
          tone={data.outstandingReceivables > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <dl className="detail-grid">
        <div className="detail-item">
          <dt>Legal name</dt>
          <dd>{data.legalName ?? '—'}</dd>
        </div>
        <div className="detail-item">
          <dt>GSTIN</dt>
          <dd>{data.gstin ?? '—'}</dd>
        </div>
        <div className="detail-item">
          <dt>Email</dt>
          <dd>{data.email ?? '—'}</dd>
        </div>
        <div className="detail-item">
          <dt>Phone</dt>
          <dd>{data.phone ?? '—'}</dd>
        </div>
        <div className="detail-item">
          <dt>Country</dt>
          <dd>{data.country}</dd>
        </div>
        <div className="detail-item">
          <dt>Currency</dt>
          <dd>{data.currency || '—'}</dd>
        </div>
        <div className="detail-item">
          <dt>Fiscal year starts</dt>
          <dd>{fiscalMonth ?? '—'}</dd>
        </div>
        <div className="detail-item">
          <dt>Default tax rate</dt>
          <dd>{typeof data.defaultTaxRate === 'number' ? formatPercent(data.defaultTaxRate) : '—'}</dd>
        </div>
        <div className="detail-item">
          <dt>Default payment terms</dt>
          <dd>{typeof data.defaultPaymentTermsDays === 'number' ? `${data.defaultPaymentTermsDays} days` : '—'}</dd>
        </div>
        <div className="detail-item">
          <dt>Last login</dt>
          <dd>{data.lastLoginAt ? formatDateTime(data.lastLoginAt) : 'Never'}</dd>
        </div>
        {data.approvedAt ? (
          <div className="detail-item">
            <dt>Approved</dt>
            <dd>{formatDateTime(data.approvedAt)}</dd>
          </div>
        ) : null}
      </dl>

      <div>
        <h3 className="card-subtitle" style={{ margin: '4px 0 8px' }}>Administrators</h3>
        {data.admins.length === 0 ? (
          <p className="text-muted small">No administrators on this organization.</p>
        ) : (
          <DataTable columns={adminColumns} rows={data.admins} rowKey={(row) => row.id} caption="Organization administrators" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

interface DangerZoneProps {
  data: OrgDetail;
  suspending: boolean;
  onToggleSuspend: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

function DangerZone({ data, suspending, onToggleSuspend, onArchive, onRestore, onDelete }: DangerZoneProps) {
  const archived = isOrgArchived(data);
  return (
    <section className="danger-zone" aria-labelledby="org-danger-zone-title">
      <h3 className="danger-zone-title" id="org-danger-zone-title">
        Danger zone
      </h3>

      {!archived ? (
        <div className="danger-zone-row">
          <div>
            <strong>{data.isSuspended ? 'Unsuspend organization' : 'Suspend organization'}</strong>
            <p>
              {data.isSuspended
                ? 'Let this organization’s users sign in again.'
                : 'Temporarily block every user from signing in. No data changes.'}
            </p>
          </div>
          <Button
            variant={data.isSuspended ? 'primary' : 'secondary'}
            size="sm"
            icon={data.isSuspended ? <CheckCircle2 size={14} /> : <Ban size={14} />}
            loading={suspending}
            onClick={onToggleSuspend}
          >
            {data.isSuspended ? 'Unsuspend' : 'Suspend'}
          </Button>
        </div>
      ) : null}

      <div className="danger-zone-row">
        {archived ? (
          <>
            <div>
              <strong>Restore organization</strong>
              <p>Bring this organization back. Its users can sign in again and all data is exactly as it was.</p>
            </div>
            <Button variant="primary" size="sm" icon={<ArchiveRestore size={14} />} onClick={onRestore}>
              Restore
            </Button>
          </>
        ) : (
          <>
            <div>
              <strong>Delete (archive)</strong>
              <p>Lock every user out and hide it from the list. All data is kept and this can be undone.</p>
            </div>
            <Button variant="secondary" size="sm" icon={<Archive size={14} />} onClick={onArchive}>
              Delete (archive)
            </Button>
          </>
        )}
      </div>

      <div className="danger-zone-row">
        <div>
          <strong>Permanently delete</strong>
          <p>Destroy this organization and all of its data forever. This cannot be undone.</p>
        </div>
        <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={onDelete}>
          Permanent delete
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

interface SettingsForm {
  name: string;
  legalName: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  currency: string;
  fiscalYearStartMonth: string;
  defaultTaxRate: string;
  defaultPaymentTermsDays: string;
  invoiceTerms: string;
  invoiceNotes: string;
}

function toSettingsForm(org: OrgDetail): SettingsForm {
  return {
    name: org.name,
    legalName: org.legalName ?? '',
    gstin: org.gstin ?? '',
    pan: org.pan ?? '',
    email: org.email ?? '',
    phone: org.phone ?? '',
    address: org.address ?? '',
    city: org.city ?? '',
    state: org.state ?? '',
    postalCode: org.postalCode ?? '',
    country: org.country ?? 'India',
    currency: org.currency ?? '',
    fiscalYearStartMonth: String(org.fiscalYearStartMonth ?? 4),
    defaultTaxRate: typeof org.defaultTaxRate === 'number' ? String(org.defaultTaxRate) : '',
    defaultPaymentTermsDays: typeof org.defaultPaymentTermsDays === 'number' ? String(org.defaultPaymentTermsDays) : '',
    invoiceTerms: org.invoiceTerms ?? '',
    invoiceNotes: org.invoiceNotes ?? '',
  };
}

/** Client-side checks mirroring the API contract; the server stays authoritative. */
function validateSettings(form: SettingsForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.name.trim().length < 2) errors.name = 'Enter at least 2 characters.';
  if (form.currency.trim() && !/^[A-Z]{3}$/.test(form.currency.trim())) errors.currency = 'Use a 3-letter code, e.g. INR.';
  if (form.defaultTaxRate.trim()) {
    const rate = Number(form.defaultTaxRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) errors.defaultTaxRate = 'Enter a percentage between 0 and 100.';
  }
  if (form.defaultPaymentTermsDays.trim()) {
    const days = Number(form.defaultPaymentTermsDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) errors.defaultPaymentTermsDays = 'Enter whole days between 0 and 365.';
  }
  return errors;
}

function OrgSettingsTab({ data, onSaved }: { data: OrgDetail; onSaved: (updated: OrgDetail) => void }) {
  const toast = useToast();
  const { submitting, error, fieldErrors, run } = useSubmit();
  const [form, setForm] = useState<SettingsForm>(() => toSettingsForm(data));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const set = (key: keyof SettingsForm) => (event: { target: { value: string } }) => {
    const value = key === 'currency' || key === 'gstin' ? event.target.value.toUpperCase() : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const errorFor = (key: keyof SettingsForm) => localErrors[key] ?? fieldErrors[key];

  const save = async () => {
    const errors = validateSettings(form);
    setLocalErrors(errors);
    if (Object.keys(errors).length) return;

    const body: UpdateOrganizationBody = {
      name: form.name.trim(),
      legalName: form.legalName.trim() || null,
      gstin: form.gstin.trim() || null,
      pan: form.pan.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      postalCode: form.postalCode.trim() || null,
      fiscalYearStartMonth: Number(form.fiscalYearStartMonth),
      invoiceTerms: form.invoiceTerms.trim() || null,
      invoiceNotes: form.invoiceNotes.trim() || null,
    };
    if (form.country.trim()) body.country = form.country.trim();
    if (form.currency.trim()) body.currency = form.currency.trim();
    if (form.defaultTaxRate.trim()) body.defaultTaxRate = Number(form.defaultTaxRate);
    if (form.defaultPaymentTermsDays.trim()) body.defaultPaymentTermsDays = Number(form.defaultPaymentTermsDays);

    const updated = await run(() => platformApi.organizations.update(data.id, body));
    if (updated) {
      setForm(toSettingsForm(updated));
      toast.success(`${updated.name} settings saved.`);
      onSaved(updated);
    }
  };

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <FormError message={error} />

      <div className="form-grid">
        <TextField label="Display name" value={form.name} required maxLength={200} error={errorFor('name')} onChange={set('name')} />
        <TextField label="Legal name" value={form.legalName} error={errorFor('legalName')} onChange={set('legalName')} />
        <TextField label="GSTIN" value={form.gstin} maxLength={15} error={errorFor('gstin')} hint="15 characters" onChange={set('gstin')} />
        <TextField label="PAN" value={form.pan} maxLength={10} error={errorFor('pan')} hint="10 characters" onChange={set('pan')} />
        <TextField label="Email" type="email" value={form.email} error={errorFor('email')} onChange={set('email')} />
        <TextField label="Phone" type="tel" value={form.phone} error={errorFor('phone')} onChange={set('phone')} />
        <TextField label="Country" value={form.country} maxLength={100} error={errorFor('country')} onChange={set('country')} />
        <TextField label="City" value={form.city} maxLength={100} error={errorFor('city')} onChange={set('city')} />
        <TextField label="State" value={form.state} maxLength={100} error={errorFor('state')} onChange={set('state')} />
        <TextField label="Postal code" value={form.postalCode} maxLength={20} error={errorFor('postalCode')} onChange={set('postalCode')} />
        <TextField
          label="Currency"
          value={form.currency}
          maxLength={3}
          autoCapitalize="characters"
          error={errorFor('currency')}
          hint="3-letter ISO code, e.g. INR"
          onChange={set('currency')}
        />
        <SelectField
          label="Fiscal year starts in"
          value={form.fiscalYearStartMonth}
          options={MONTH_OPTIONS}
          error={errorFor('fiscalYearStartMonth')}
          onChange={set('fiscalYearStartMonth')}
        />
        <TextField
          label="Default tax rate (%)"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.01"
          value={form.defaultTaxRate}
          error={errorFor('defaultTaxRate')}
          hint="Pre-filled on new items and document lines"
          onChange={set('defaultTaxRate')}
        />
        <TextField
          label="Default payment terms (days)"
          type="number"
          inputMode="numeric"
          min={0}
          max={365}
          step={1}
          value={form.defaultPaymentTermsDays}
          error={errorFor('defaultPaymentTermsDays')}
          hint="Pre-filled on new customers and vendors"
          onChange={set('defaultPaymentTermsDays')}
        />
      </div>

      <TextAreaField label="Address" value={form.address} rows={2} error={errorFor('address')} onChange={set('address')} />
      <TextAreaField label="Default invoice terms" value={form.invoiceTerms} rows={3} error={errorFor('invoiceTerms')} onChange={set('invoiceTerms')} />
      <TextAreaField label="Default invoice notes" value={form.invoiceNotes} rows={3} error={errorFor('invoiceNotes')} onChange={set('invoiceNotes')} />

      <div className="row-between">
        <span className="text-muted small">Changes apply to this organization immediately.</span>
        <div className="row">
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={() => {
              setForm(toSettingsForm(data));
              setLocalErrors({});
            }}
          >
            Reset
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            Save settings
          </Button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------

function OrgUsersTab({ orgId, orgName, onChanged }: { orgId: string; orgName: string; onChanged: () => void }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<PlatformUser | null>(null);
  const [deleting, setDeleting] = useState<PlatformUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleSubmit = useSubmit();
  const deleteSubmit = useSubmit();
  const users = useAsync(
    (signal) => platformApi.organizations.users(orgId, { page, page_size: TAB_PAGE_SIZE }, signal),
    [orgId, page],
  );

  const rows = users.data?.items ?? [];

  const refresh = () => {
    users.reload();
    onChanged();
  };

  const toggleActive = async (user: PlatformUser) => {
    setTogglingId(user.id);
    const updated = await toggleSubmit.run(() => platformApi.users.update(user.id, { isActive: !user.isActive }));
    setTogglingId(null);
    if (updated) {
      toast.success(updated.isActive ? `${updated.name} can sign in again.` : `${updated.name} was deactivated.`);
      refresh();
    } else if (toggleSubmit.errorRef.current) {
      toast.error(toggleSubmit.errorRef.current);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await deleteSubmit.run(() => platformApi.users.remove(deleting.id));
    if (result) {
      toast.success(result.message || `${deleting.name} deleted.`);
      setDeleting(null);
      // Step back a page if this removed the last row on it.
      if (rows.length === 1 && page > 1) setPage(page - 1);
      refresh();
    }
  };

  const columns: Array<Column<PlatformUser>> = [
    { key: 'name', header: 'Name', render: (row) => <span className="strong">{row.name}</span> },
    { key: 'email', header: 'Email', render: (row) => <span style={{ wordBreak: 'break-all' }}>{row.email}</span> },
    { key: 'role', header: 'Role', render: (row) => <Badge tone="info">{row.role}</Badge> },
    {
      key: 'status',
      header: 'Active',
      render: (row) => (row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : <span className="text-muted">Never</span>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          {row.isActive ? <ImpersonateButton user={{ ...row, organizationName: row.organizationName || orgName }} /> : null}
          <ActionMenu
            label={`More actions for ${row.name}`}
            iconOnly
            disabled={togglingId === row.id}
            items={[
              { key: 'edit', label: 'Edit user', icon: <Pencil size={14} />, onSelect: () => setEditing(row) },
              { key: 'reset', label: 'Reset password', icon: <KeyRound size={14} />, onSelect: () => setResetting(row) },
              row.isActive
                ? { key: 'deactivate', label: 'Deactivate', icon: <UserX size={14} />, onSelect: () => void toggleActive(row) }
                : { key: 'activate', label: 'Activate', icon: <UserCheck size={14} />, onSelect: () => void toggleActive(row) },
              {
                key: 'delete',
                label: 'Delete user',
                icon: <Trash2 size={14} />,
                danger: true,
                onSelect: () => {
                  deleteSubmit.reset();
                  setDeleting(row);
                },
              },
            ]}
          />
        </div>
      ),
    },
  ];

  let body;
  if (users.loading && !users.data) body = <SkeletonRows rows={5} columns={6} />;
  else if (users.error && !users.data) body = <ErrorBlock message={users.error} onRetry={users.reload} />;
  else if (!rows.length) body = <EmptyState title="No users" description="This organization has no users yet." />;
  else
    body = (
      <>
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={`Users of ${orgName}`} />
        <Pagination page={page} pageSize={users.data?.pageSize ?? TAB_PAGE_SIZE} total={users.data?.total ?? 0} onPageChange={setPage} />
      </>
    );

  return (
    <div aria-busy={users.loading}>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <span className="text-muted small">
          {users.data?.total ?? rows.length} user{(users.data?.total ?? rows.length) === 1 ? '' : 's'}
        </span>
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
          Add user
        </Button>
      </div>

      {body}

      {editing ? (
        <EditPlatformUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}

      {adding ? (
        <CreatePlatformUserModal
          defaultOrganizationId={orgId}
          organizations={[{ id: orgId, name: orgName } as OrgSummary]}
          onClose={() => setAdding(false)}
          onCreated={refresh}
        />
      ) : null}

      {resetting ? (
        <ResetPlatformUserPasswordModal user={{ ...resetting, organizationName: resetting.organizationName || orgName }} onClose={() => setResetting(null)} />
      ) : null}

      <ConfirmDialog
        open={!!deleting}
        title="Delete user"
        message={
          deleting ? (
            <>
              <FormError message={deleteSubmit.error} />
              <p>
                Delete <strong>{deleting.name}</strong> ({deleting.email}) from {orgName}? This cannot be undone.
              </p>
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete user"
        busy={deleteSubmit.submitting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin panel logins tab
// ---------------------------------------------------------------------------

interface PanelAdminsTabProps {
  orgId: string;
  orgName: string;
  adminEmail?: string | null;
  admins: PlatformUser[];
}

function PanelAdminsTab({ orgId, orgName, adminEmail, admins }: PanelAdminsTabProps) {
  const toast = useToast();
  const list = useAsync((signal) => platformApi.organizations.panelAdmins.list(orgId, signal), [orgId]);
  const [adding, setAdding] = useState(false);
  const [settingPassword, setSettingPassword] = useState<OrgPanelAdminItem | null>(null);
  const [deleting, setDeleting] = useState<OrgPanelAdminItem | null>(null);
  const [credentials, setCredentials] = useState<PanelCredentials | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleSubmit = useSubmit();
  const deleteSubmit = useSubmit();

  const rows = list.data ?? [];
  // Prefill the first login from the organization's registrant; later ones start blank.
  const registrant = admins.find((user) => user.email.toLowerCase() === adminEmail?.toLowerCase()) ?? admins[0];
  const initial = rows.length === 0 ? { name: registrant?.name ?? '', email: adminEmail ?? registrant?.email ?? '' } : undefined;

  const toggleActive = async (admin: OrgPanelAdminItem) => {
    setTogglingId(admin.id);
    const updated = await toggleSubmit.run(() => platformApi.organizations.panelAdmins.update(admin.id, { isActive: !admin.isActive }));
    setTogglingId(null);
    if (updated) {
      toast.success(updated.isActive ? `${updated.email} can sign in to the admin panel again.` : `${updated.email} was disabled.`);
      list.reload();
    } else if (toggleSubmit.errorRef.current) {
      toast.error(toggleSubmit.errorRef.current);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await deleteSubmit.run(() => platformApi.organizations.panelAdmins.remove(deleting.id));
    if (result !== null) {
      toast.success(result?.message || `${deleting.email} was deleted.`);
      setDeleting(null);
      list.reload();
    }
  };

  const columns: Array<Column<OrgPanelAdminItem>> = [
    {
      key: 'name',
      header: 'Login',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.name}</span>
          <small style={{ wordBreak: 'break-all' }}>{row.email}</small>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Disabled</Badge>),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : <span className="text-muted">Never</span>),
    },
    {
      key: 'created',
      header: 'Created',
      render: (row) => (
        <div className="cell-stack">
          <span>{formatDate(row.createdAt)}</span>
          {row.createdBy ? <small>by {row.createdBy}</small> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <ActionMenu
          label={`More actions for ${row.email}`}
          iconOnly
          disabled={togglingId === row.id}
          items={[
            { key: 'password', label: 'Set new password', icon: <KeyRound size={14} />, onSelect: () => setSettingPassword(row) },
            row.isActive
              ? { key: 'disable', label: 'Disable', icon: <UserX size={14} />, onSelect: () => void toggleActive(row) }
              : { key: 'enable', label: 'Enable', icon: <UserCheck size={14} />, onSelect: () => void toggleActive(row) },
            {
              key: 'delete',
              label: 'Delete login',
              icon: <Trash2 size={14} />,
              danger: true,
              onSelect: () => {
                deleteSubmit.reset();
                setDeleting(row);
              },
            },
          ]}
        />
      ),
    },
  ];

  let body;
  if (list.loading && !list.data) body = <SkeletonRows rows={3} columns={5} />;
  else if (list.error && !list.data) body = <ErrorBlock message={list.error} onRetry={list.reload} />;
  else if (!rows.length)
    body = (
      <EmptyState
        title="No admin panel logins"
        description={`Add a login so ${orgName} can manage its users, settings and app content in its admin panel.`}
      />
    );
  else body = <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption={`Admin panel logins of ${orgName}`} />;

  return (
    <div className="stack" aria-busy={list.loading}>
      <div className="row-between">
        <PanelLoginUrl />
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
          Add login
        </Button>
      </div>
      <p className="text-muted small" style={{ margin: 0 }}>
        These logins open only the organization admin panel. They are separate from the organization's app users.
      </p>

      {body}

      {adding ? (
        <CreatePanelAdminModal
          orgId={orgId}
          orgName={orgName}
          initial={initial}
          onClose={() => setAdding(false)}
          onCreated={(_created, created) => {
            setAdding(false);
            setCredentials(created);
            list.reload();
          }}
        />
      ) : null}

      {settingPassword ? (
        <SetPanelPasswordModal
          admin={settingPassword}
          orgName={orgName}
          onClose={() => setSettingPassword(null)}
          onSaved={(saved) => {
            setSettingPassword(null);
            setCredentials(saved);
          }}
        />
      ) : null}

      {credentials ? <PanelCredentialsModal credentials={credentials} onClose={() => setCredentials(null)} /> : null}

      <ConfirmDialog
        open={!!deleting}
        title="Delete admin panel login"
        message={
          deleting ? (
            <>
              <FormError message={deleteSubmit.error} />
              <p>
                Delete the admin panel login <strong>{deleting.email}</strong> ({deleting.name})? They can no longer sign in to
                {` ${orgName}`}'s admin panel. This cannot be undone.
              </p>
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete login"
        busy={deleteSubmit.submitting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoices tab
// ---------------------------------------------------------------------------

function OrgInvoicesTab({ orgId, currency }: { orgId: string; currency: string }) {
  const [page, setPage] = useState(1);
  const invoices = useAsync(
    (signal) => platformApi.organizations.invoices(orgId, { page, page_size: TAB_PAGE_SIZE }, signal),
    [orgId, page],
  );

  const rows = invoices.data?.items ?? [];

  const columns: Array<Column<PlatformInvoice>> = [
    {
      key: 'number',
      header: 'Invoice',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.number}</span>
          <small>{row.customerName}</small>
        </div>
      ),
    },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'due', header: 'Due', render: (row) => formatDate(row.dueDate) },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge> },
    { key: 'total', header: 'Total', align: 'right', render: (row) => <span className="num">{formatCurrency(row.total, currency)}</span> },
    { key: 'paid', header: 'Paid', align: 'right', render: (row) => <span className="num">{formatCurrency(row.amountPaid, currency)}</span> },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (row) => (
        <span className={`num ${row.balanceDue > 0 ? 'text-warning' : ''}`}>{formatCurrency(row.balanceDue, currency)}</span>
      ),
    },
  ];

  if (invoices.loading) return <SkeletonRows rows={5} columns={7} />;
  if (invoices.error) return <ErrorBlock message={invoices.error} onRetry={invoices.reload} />;
  if (!rows.length) return <EmptyState title="No invoices" description="This organization has not raised any invoices yet." />;

  return (
    <>
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Organization invoices" />
      <Pagination page={page} pageSize={invoices.data?.pageSize ?? TAB_PAGE_SIZE} total={invoices.data?.total ?? 0} onPageChange={setPage} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Activity tab
// ---------------------------------------------------------------------------

function OrgActivityTab({ orgId }: { orgId: string }) {
  const [page, setPage] = useState(1);
  const logs = useAsync(
    (signal) => platformApi.auditLogs({ organization_id: orgId, page, page_size: TAB_PAGE_SIZE }, signal),
    [orgId, page],
  );

  const rows = logs.data?.items ?? [];

  const columns: Array<Column<PlatformAudit>> = [
    { key: 'when', header: 'When', width: '180px', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{titleCase(row.action)}</span>
          <Badge tone="neutral">{titleCase(row.entityType)}</Badge>
        </div>
      ),
    },
    { key: 'summary', header: 'Details', render: (row) => row.summary ?? <span className="text-muted">—</span> },
    { key: 'user', header: 'User', render: (row) => row.userName ?? <span className="text-muted">System</span> },
  ];

  if (logs.loading) return <SkeletonRows rows={6} columns={4} />;
  if (logs.error) return <ErrorBlock message={logs.error} onRetry={logs.reload} />;
  if (!rows.length) return <EmptyState title="No activity" description="No recorded activity for this organization yet." />;

  return (
    <>
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Organization activity" />
      <Pagination page={page} pageSize={logs.data?.pageSize ?? TAB_PAGE_SIZE} total={logs.data?.total ?? 0} onPageChange={setPage} />
    </>
  );
}
