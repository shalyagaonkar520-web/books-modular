/**
 * Organization-level operator actions shared by the org drawer, the
 * organizations list and the dashboard: archive / restore / permanent delete
 * (with their confirms) and "Open in app" (sign in as the org's first active
 * admin and land on a chosen tenant route).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AppWindow,
  BadgeCheck,
  Ban,
  Archive,
  ArchiveRestore,
  Banknote,
  BarChart3,
  Building,
  FileText,
  Landmark,
  LayoutDashboard,
  LogIn,
  Package,
  Receipt,
  RefreshCw,
  Settings,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';

import { ApiError } from '@/api/client';
import { platformApi, type OrgApprovalStatus, type OrgDetail, type PlatformUser } from '@/api/platform';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';

import { useImpersonate } from './useImpersonate';

/** The minimum an action needs to know about an organization. */
export interface OrgTarget {
  id: string;
  name: string;
  isSuspended: boolean;
  isArchived?: boolean;
  deletedAt?: string | null;
  approvalStatus?: OrgApprovalStatus;
}

export function isOrgArchived(org: Pick<OrgTarget, 'isArchived' | 'deletedAt'>): boolean {
  return Boolean(org.isArchived || org.deletedAt);
}

export function isOrgPending(org: Pick<OrgTarget, 'approvalStatus'>): boolean {
  return org.approvalStatus === 'pending';
}

export function isOrgRejected(org: Pick<OrgTarget, 'approvalStatus'>): boolean {
  return org.approvalStatus === 'rejected';
}

/** Why the org cannot be signed into because of its approval state, or null. */
export function approvalBlocker(org: Pick<OrgTarget, 'approvalStatus'>): string | null {
  if (isOrgPending(org)) return 'This organization is awaiting approval. Approve it first.';
  if (isOrgRejected(org)) return 'This organization’s registration was rejected. Approve it first.';
  return null;
}

/** Status badge: Pending / Rejected first, then Archived, Suspended, Active. */
export function OrgStatusBadge({ org }: { org: OrgTarget }) {
  if (isOrgPending(org)) return <Badge tone="warning">Pending approval</Badge>;
  if (isOrgRejected(org)) return <Badge tone="danger">Rejected</Badge>;
  if (isOrgArchived(org)) return <Badge tone="neutral">Archived</Badge>;
  if (org.isSuspended) return <Badge tone="danger">Suspended</Badge>;
  return <Badge tone="success">Active</Badge>;
}

// ---------------------------------------------------------------------------
// Archive / restore / permanent delete
// ---------------------------------------------------------------------------

interface LifecycleCallbacks {
  onArchived?: (org: OrgDetail) => void;
  onRestored?: (org: OrgDetail) => void;
  onDeleted?: (orgId: string) => void;
}

type Pending = { kind: 'archive' | 'restore' | 'delete'; org: OrgTarget } | null;

/**
 * Owns the archive / restore / permanent-delete confirms. Render `dialogs`
 * once (outside any clickable row) and call the `request*` functions.
 */
export function useOrgLifecycle({ onArchived, onRestored, onDeleted }: LifecycleCallbacks = {}) {
  const toast = useToast();
  const submit = useSubmit();
  const [pending, setPending] = useState<Pending>(null);
  const [typedName, setTypedName] = useState('');

  const { reset } = submit;
  const open = useCallback(
    (kind: NonNullable<Pending>['kind'], org: OrgTarget) => {
      reset();
      setTypedName('');
      setPending({ kind, org });
    },
    [reset],
  );

  const cancel = () => {
    if (!submit.submitting) setPending(null);
  };

  const confirm = async () => {
    if (!pending) return;
    const { kind, org } = pending;
    if (kind === 'archive') {
      const updated = await submit.run(() => platformApi.organizations.archive(org.id));
      if (updated) {
        toast.success(`${org.name} was archived. Its users can no longer sign in.`);
        setPending(null);
        onArchived?.(updated);
      }
    } else if (kind === 'restore') {
      const updated = await submit.run(() => platformApi.organizations.restore(org.id));
      if (updated) {
        toast.success(`${org.name} was restored.`);
        setPending(null);
        onRestored?.(updated);
      }
    } else {
      if (typedName !== org.name) return;
      const result = await submit.run(() => platformApi.organizations.remove(org.id));
      if (result) {
        toast.success(result.message || `${org.name} was permanently deleted.`);
        setPending(null);
        onDeleted?.(org.id);
      }
    }
  };

  const nameMatches = pending?.kind === 'delete' && typedName === pending.org.name;

  const dialogs = (
    <>
      <ConfirmDialog
        open={pending?.kind === 'archive'}
        title="Archive organization"
        message={
          pending ? (
            <>
              <FormError message={submit.error} />
              <p>
                Archive <strong>{pending.org.name}</strong>? Every user in it is signed out and can no longer sign in, and it
                disappears from the default organization list.
              </p>
              <p className="text-muted small">
                Nothing is deleted — all invoices, bills, contacts and settings are kept. You can restore it at any time from the
                Archived filter.
              </p>
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Archive organization"
        busy={submit.submitting}
        onConfirm={() => void confirm()}
        onCancel={cancel}
      />

      <ConfirmDialog
        open={pending?.kind === 'restore'}
        title="Restore organization"
        tone="primary"
        message={
          pending ? (
            <>
              <FormError message={submit.error} />
              <p>
                Restore <strong>{pending.org.name}</strong>? Its users will be able to sign in again with their existing
                passwords.
              </p>
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Restore"
        busy={submit.submitting}
        onConfirm={() => void confirm()}
        onCancel={cancel}
      />

      <Modal
        open={pending?.kind === 'delete'}
        title="Permanently delete organization"
        size="sm"
        onClose={cancel}
        footer={
          <>
            <Button variant="secondary" onClick={cancel} disabled={submit.submitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirm()} loading={submit.submitting} disabled={!nameMatches}>
              Delete permanently
            </Button>
          </>
        }
      >
        {pending?.kind === 'delete' ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (nameMatches) void confirm();
            }}
          >
            <FormError message={submit.error} />
            <div className="danger-callout">
              <p>
                This <strong>permanently destroys {pending.org.name}</strong> and <strong>all of its data</strong> — users,
                invoices, bills, payments, contacts, items and settings. This cannot be undone.
              </p>
            </div>
            <p className="text-muted small" style={{ margin: 0 }}>
              If you only want to lock users out, archive the organization instead — it can be restored later.
            </p>
            <TextField
              label={`Type the organization name to confirm: ${pending.org.name}`}
              value={typedName}
              autoComplete="off"
              spellCheck={false}
              hint="The name must match exactly, including capitalization."
              onChange={(event) => setTypedName(event.target.value)}
              autoFocus
            />
          </form>
        ) : null}
      </Modal>
    </>
  );

  return {
    requestArchive: (org: OrgTarget) => open('archive', org),
    requestRestore: (org: OrgTarget) => open('restore', org),
    requestDelete: (org: OrgTarget) => open('delete', org),
    dialogs,
  };
}

// ---------------------------------------------------------------------------
// Approve / reject (organizations awaiting platform approval)
// ---------------------------------------------------------------------------

/** Fired on window after an approval decision so e.g. the nav badge can refresh. */
export const ORG_APPROVAL_CHANGED_EVENT = 'platform:org-approval-changed';

interface ApprovalCallbacks {
  onApproved?: (org: OrgDetail) => void;
  onRejected?: (org: OrgDetail) => void;
}

const REJECT_REASON_MAX = 500;

/**
 * Approve runs straight away (it only grants access); reject opens a modal for
 * an optional reason. Render `dialogs` once, outside any clickable row.
 */
export function useOrgApproval({ onApproved, onRejected }: ApprovalCallbacks = {}) {
  const toast = useToast();
  const approveSubmit = useSubmit();
  const rejectSubmit = useSubmit();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<OrgTarget | null>(null);
  const [reason, setReason] = useState('');

  const notify = () => window.dispatchEvent(new Event(ORG_APPROVAL_CHANGED_EVENT));

  const approve = async (org: OrgTarget) => {
    if (approvingId) return;
    setApprovingId(org.id);
    const updated = await approveSubmit.run(() => platformApi.organizations.approve(org.id));
    setApprovingId(null);
    if (updated) {
      toast.success(`${org.name} was approved. Its users can now sign in.`);
      notify();
      onApproved?.(updated);
    } else if (approveSubmit.errorRef.current) {
      toast.error(approveSubmit.errorRef.current);
    }
  };

  const { reset: resetReject } = rejectSubmit;
  const requestReject = useCallback(
    (org: OrgTarget) => {
      resetReject();
      setReason('');
      setRejecting(org);
    },
    [resetReject],
  );

  const cancelReject = () => {
    if (!rejectSubmit.submitting) setRejecting(null);
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    const org = rejecting;
    const trimmed = reason.trim();
    const updated = await rejectSubmit.run(() => platformApi.organizations.reject(org.id, trimmed ? { reason: trimmed } : {}));
    if (updated) {
      toast.success(`${org.name} was rejected.`);
      setRejecting(null);
      notify();
      onRejected?.(updated);
    }
  };

  const dialogs = (
    <Modal
      open={!!rejecting}
      title="Reject organization"
      size="sm"
      onClose={cancelReject}
      footer={
        <>
          <Button variant="secondary" onClick={cancelReject} disabled={rejectSubmit.submitting}>
            Cancel
          </Button>
          <Button variant="danger" icon={<Ban size={14} />} loading={rejectSubmit.submitting} onClick={() => void confirmReject()}>
            Reject registration
          </Button>
        </>
      }
    >
      {rejecting ? (
        <form
          className="stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void confirmReject();
          }}
        >
          <FormError message={rejectSubmit.error} />
          <p style={{ margin: 0 }}>
            Reject <strong>{rejecting.name}</strong>? Its users will not be able to sign in. You can still approve it later.
          </p>
          <TextAreaField
            label="Reason (optional)"
            rows={3}
            maxLength={REJECT_REASON_MAX}
            value={reason}
            error={rejectSubmit.fieldErrors.reason}
            hint={`Kept with the organization and may be shown to the applicant. ${reason.length}/${REJECT_REASON_MAX}`}
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
        </form>
      ) : null}
    </Modal>
  );

  return { approve, requestReject, approvingId, dialogs };
}

export type OrgApprovalActions = Pick<ReturnType<typeof useOrgApproval>, 'approve' | 'requestReject' | 'approvingId'>;

interface ApprovalButtonsProps {
  org: OrgTarget;
  approval: OrgApprovalActions;
  size?: 'sm' | 'md';
}

/** Inline Approve / Reject for a pending organization (Approve only for a rejected one). */
export function OrgApprovalButtons({ org, approval, size = 'sm' }: ApprovalButtonsProps) {
  if (!isOrgPending(org) && !isOrgRejected(org)) return null;
  const busy = approval.approvingId === org.id;
  return (
    <RowSafe>
      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
        <Button
          variant="primary"
          size={size}
          icon={<BadgeCheck size={14} />}
          loading={busy}
          disabled={Boolean(approval.approvingId) && !busy}
          aria-label={`Approve ${org.name}`}
          onClick={() => void approval.approve(org)}
        >
          Approve
        </Button>
        {isOrgPending(org) ? (
          <Button
            variant="secondary"
            size={size}
            icon={<Ban size={14} />}
            disabled={busy}
            aria-label={`Reject ${org.name}`}
            onClick={() => approval.requestReject(org)}
          >
            Reject
          </Button>
        ) : null}
      </span>
    </RowSafe>
  );
}

// ---------------------------------------------------------------------------
// Open in app
// ---------------------------------------------------------------------------

export interface AppRoute {
  path: string;
  label: string;
  icon: ReactNode;
}

export const APP_ROUTES: AppRoute[] = [
  { path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
  { path: '/invoices', label: 'Invoices', icon: <FileText size={14} /> },
  { path: '/customers', label: 'Customers', icon: <Users size={14} /> },
  { path: '/vendors', label: 'Vendors', icon: <Truck size={14} /> },
  { path: '/items', label: 'Items', icon: <Package size={14} /> },
  { path: '/bills', label: 'Bills', icon: <Receipt size={14} /> },
  { path: '/payments-received', label: 'Payments received', icon: <Banknote size={14} /> },
  { path: '/reports', label: 'Reports', icon: <BarChart3 size={14} /> },
  { path: '/banking', label: 'Banking', icon: <Landmark size={14} /> },
  { path: '/settings', label: 'Organization settings', icon: <Settings size={14} /> },
];

/** The first active administrator, which is who "Open in app" signs in as. */
export function firstActiveAdmin(detail: Pick<OrgDetail, 'admins'> | null | undefined): PlatformUser | null {
  if (!detail) return null;
  return detail.admins.find((user) => user.isActive && user.role === 'admin') ?? null;
}

/** Why "Open in app" cannot be used right now, or null when it can. */
export function openInAppBlocker(org: OrgTarget, detail: Pick<OrgDetail, 'admins'> | null | undefined): string | null {
  const approval = approvalBlocker(org);
  if (approval) return approval;
  if (isOrgArchived(org)) return 'Archived organizations cannot be opened. Restore it first.';
  if (org.isSuspended) return 'Suspended organizations cannot be opened. Unsuspend it first.';
  if (detail && !firstActiveAdmin(detail)) return 'This organization has no active administrator to sign in as.';
  return null;
}

interface AdminState {
  loading: boolean;
  error: string | null;
  /** Detail as last fetched (or as passed in). */
  detail: OrgDetail | null;
}

/**
 * Resolves the admin to sign in as (fetching OrgDetail lazily when the caller
 * does not already have it) and owns the single confirm before signing in.
 */
function useOpenInApp(org: OrgTarget, providedDetail?: OrgDetail | null) {
  const { start, submitting, error } = useImpersonate();
  const [state, setState] = useState<AdminState>({ loading: false, error: null, detail: providedDetail ?? null });
  const [route, setRoute] = useState<AppRoute | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (providedDetail) setState({ loading: false, error: null, detail: providedDetail });
  }, [providedDetail]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const load = useCallback(async (): Promise<OrgDetail | null> => {
    if (providedDetail) return providedDetail;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const detail = await platformApi.organizations.get(org.id, controller.signal);
      setState({ loading: false, error: null, detail });
      return detail;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null;
      const message = err instanceof ApiError ? err.message : 'Could not load the organization.';
      setState((current) => ({ ...current, loading: false, error: message }));
      return null;
    }
  }, [org.id, providedDetail]);

  const admin = firstActiveAdmin(state.detail);
  const staticBlocker = openInAppBlocker(org, null);
  const blocker = openInAppBlocker(org, state.detail);

  const confirmDialog = (
    <ConfirmDialog
      open={!!route && !!admin}
      title="Open organization in app"
      tone="primary"
      message={
        route && admin ? (
          <>
            <FormError message={error} />
            <p>
              You will be signed into <strong>{org.name}</strong> as <strong>{admin.email}</strong> ({admin.name}) and taken to{' '}
              <strong>{route.label}</strong>. Continue?
            </p>
            <p className="text-muted small">Reloading the page ends the impersonated session — there is no refresh cookie.</p>
          </>
        ) : (
          ''
        )
      }
      confirmLabel="Sign in and open"
      busy={submitting}
      onConfirm={() => {
        if (!route || !admin) return;
        void start(admin.id, route.path).then((ok) => {
          if (ok) setRoute(null);
        });
      }}
      onCancel={() => {
        if (!submitting) setRoute(null);
      }}
    />
  );

  return { state, admin, blocker, staticBlocker, load, setRoute, confirmDialog };
}

/** Stops clicks / Enter / Space inside from triggering a clickable table row. */
function RowSafe({ children }: { children: ReactNode }) {
  return (
    <span
      className="action-menu-anchor"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
    >
      {children}
    </span>
  );
}

interface OpenInAppMenuProps {
  org: OrgTarget;
  /** Pass when already loaded (e.g. in the org drawer) to skip the fetch. */
  detail?: OrgDetail | null;
  size?: 'sm' | 'md';
  variant?: 'secondary' | 'ghost';
  iconOnly?: boolean;
}

/** "Open in app ▾" — pick a tenant page, confirm, and land there as the org's admin. */
export function OpenInAppMenu({ org, detail, size = 'sm', variant = 'secondary', iconOnly = false }: OpenInAppMenuProps) {
  const { state, admin, blocker, staticBlocker, load, setRoute, confirmDialog } = useOpenInApp(org, detail);

  let notice: ReactNode = null;
  if (blocker) notice = <span>{blocker}</span>;
  else if (state.loading) notice = <span role="status">Finding an administrator…</span>;
  else if (state.error) notice = <span role="alert">{state.error}</span>;
  else if (admin) notice = <span>Signs in as {admin.email}</span>;

  const unavailable = Boolean(blocker) || state.loading || !admin;
  const items: ActionMenuItem[] = APP_ROUTES.map((route) => ({
    key: route.path,
    label: route.label,
    icon: route.icon,
    disabled: unavailable,
    onSelect: () => setRoute(route),
  }));
  if (state.error && !staticBlocker) {
    items.unshift({ key: 'retry', label: 'Try again', icon: <RefreshCw size={14} />, onSelect: () => void load() });
  }

  return (
    <RowSafe>
      <ActionMenu
        label={iconOnly ? `Open ${org.name} in app` : 'Open in app'}
        heading="Open in app"
        icon={<AppWindow size={14} aria-hidden="true" />}
        iconOnly={iconOnly}
        size={size}
        variant={variant}
        notice={notice}
        items={items}
        onOpen={() => {
          if (!staticBlocker && !state.detail) void load();
        }}
      />
      {confirmDialog}
    </RowSafe>
  );
}

interface OpenInAppButtonProps {
  org: OrgTarget;
  route?: AppRoute;
  label?: string;
}

/** One-click "Open in app" for a fixed route (dashboard by default). */
export function OpenInAppButton({ org, route = APP_ROUTES[0], label = 'Open in app' }: OpenInAppButtonProps) {
  const toast = useToast();
  const { state, staticBlocker, load, setRoute, confirmDialog } = useOpenInApp(org);

  const click = async () => {
    if (staticBlocker) {
      toast.error(staticBlocker);
      return;
    }
    const detail = state.detail ?? (await load());
    if (!detail) {
      toast.error('Could not load the organization. Please try again.');
      return;
    }
    const reason = openInAppBlocker(org, detail);
    if (reason) {
      toast.error(reason);
      return;
    }
    setRoute(route);
  };

  return (
    <RowSafe>
      <Button
        variant="ghost"
        size="sm"
        icon={<LogIn size={14} />}
        loading={state.loading}
        disabled={Boolean(staticBlocker)}
        title={staticBlocker ?? `Sign in to ${org.name} as its administrator`}
        aria-label={`${label}: ${org.name}`}
        onClick={() => void click()}
      >
        {label}
      </Button>
      {confirmDialog}
    </RowSafe>
  );
}

// ---------------------------------------------------------------------------
// Row "More actions" menu (archive / restore / permanent delete)
// ---------------------------------------------------------------------------

interface OrgRowMenuProps {
  org: OrgTarget;
  onView: () => void;
  lifecycle: Pick<ReturnType<typeof useOrgLifecycle>, 'requestArchive' | 'requestRestore' | 'requestDelete'>;
  /** When given, pending / rejected organizations get Approve (and Reject) items. */
  approval?: OrgApprovalActions;
}

export function OrgRowMenu({ org, onView, lifecycle, approval }: OrgRowMenuProps) {
  const archived = isOrgArchived(org);
  const approvalItems: ActionMenuItem[] = [];
  if (approval && (isOrgPending(org) || isOrgRejected(org))) {
    approvalItems.push({
      key: 'approve',
      label: 'Approve',
      icon: <BadgeCheck size={14} />,
      disabled: Boolean(approval.approvingId),
      onSelect: () => void approval.approve(org),
    });
    if (isOrgPending(org)) {
      approvalItems.push({ key: 'reject', label: 'Reject…', icon: <Ban size={14} />, onSelect: () => approval.requestReject(org) });
    }
  }
  const items: ActionMenuItem[] = [
    { key: 'view', label: 'View details', icon: <Building size={14} />, onSelect: onView },
    ...approvalItems,
    archived
      ? { key: 'restore', label: 'Restore', icon: <ArchiveRestore size={14} />, onSelect: () => lifecycle.requestRestore(org) }
      : { key: 'archive', label: 'Delete (archive)', icon: <Archive size={14} />, onSelect: () => lifecycle.requestArchive(org) },
    { key: 'delete', label: 'Permanent delete', icon: <Trash2 size={14} />, danger: true, onSelect: () => lifecycle.requestDelete(org) },
  ];
  return (
    <RowSafe>
      <ActionMenu label={`More actions for ${org.name}`} iconOnly items={items} />
    </RowSafe>
  );
}
