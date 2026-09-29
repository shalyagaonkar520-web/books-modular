import { useState } from 'react';
import { Ban, CheckCircle2, Trash2 } from 'lucide-react';

import {
  platformApi,
  type OrgDetail,
  type PlatformAudit,
  type PlatformInvoice,
  type PlatformUser,
} from '@/api/platform';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Tabs } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatDateTime, titleCase } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

import { ImpersonateButton } from './ImpersonateButton';

const TAB_PAGE_SIZE = 10;

interface OrgDetailDrawerProps {
  orgId: string;
  onClose: () => void;
  /** Called after any change that should refresh the parent list. */
  onChanged: () => void;
}

type TabId = 'overview' | 'users' | 'invoices' | 'activity';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'activity', label: 'Activity' },
];

export function OrgDetailDrawer({ orgId, onClose, onChanged }: OrgDetailDrawerProps) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync((signal) => platformApi.organizations.get(orgId, signal), [orgId]);
  const suspendSubmit = useSubmit();
  const deleteSubmit = useSubmit();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tab, setTab] = useState<TabId>('overview');

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
      toast.success(next ? `${org.name} is now suspended.` : `${org.name} is active again.`);
      onChanged();
    } else if (suspendSubmit.errorRef.current) {
      toast.error(suspendSubmit.errorRef.current);
    }
  };

  const confirmDelete = async (org: OrgDetail) => {
    const result = await deleteSubmit.run(() => platformApi.organizations.remove(org.id));
    if (result) {
      toast.success(result.message || `${org.name} deleted.`);
      setConfirmingDelete(false);
      onChanged();
      onClose();
    } else if (deleteSubmit.errorRef.current) {
      toast.error(deleteSubmit.errorRef.current);
    }
  };

  return (
    <Modal
      open
      title={data?.name ?? 'Organization'}
      subtitle={data ? `Created ${formatDate(data.createdAt)}` : undefined}
      size="lg"
      onClose={onClose}
      footer={
        data ? (
          <>
            <Button
              variant="danger"
              icon={<Trash2 size={15} />}
              onClick={() => setConfirmingDelete(true)}
              disabled={suspendSubmit.submitting || deleteSubmit.submitting}
            >
              Delete
            </Button>
            <Button
              variant={data.isSuspended ? 'primary' : 'secondary'}
              icon={data.isSuspended ? <CheckCircle2 size={15} /> : <Ban size={15} />}
              loading={suspendSubmit.submitting}
              onClick={() => toggleSuspend(data)}
            >
              {data.isSuspended ? 'Unsuspend' : 'Suspend'}
            </Button>
          </>
        ) : null
      }
    >
      {loading ? <LoadingBlock label="Loading organization…" /> : null}
      {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
      {!loading && data ? (
        <div className="stack">
          <FormError message={suspendSubmit.error ?? deleteSubmit.error} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {data.isSuspended ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>}
            {data.isSuspended && data.suspendedReason ? (
              <span className="text-muted small">
                {data.suspendedReason}
                {data.suspendedAt ? ` · ${formatDateTime(data.suspendedAt)}` : ''}
              </span>
            ) : null}
          </div>

          <Tabs tabs={TABS} active={tab} onChange={(id) => setTab(id as TabId)} />

          {tab === 'overview' ? <OverviewTab data={data} /> : null}
          {tab === 'users' ? <OrgUsersTab orgId={orgId} /> : null}
          {tab === 'invoices' ? <OrgInvoicesTab orgId={orgId} currency={data.currency} /> : null}
          {tab === 'activity' ? <OrgActivityTab orgId={orgId} /> : null}

          <ConfirmDialog
            open={confirmingDelete}
            title="Delete organization"
            message={
              <>
                <FormError message={deleteSubmit.error} />
                <p>
                  This permanently deletes <strong>{data.name}</strong> and all of its data. This cannot be undone.
                </p>
              </>
            }
            confirmLabel="Delete permanently"
            busy={deleteSubmit.submitting}
            onConfirm={() => confirmDelete(data)}
            onCancel={() => setConfirmingDelete(false)}
          />
        </div>
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ data }: { data: OrgDetail }) {
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
          <ImpersonateButton user={row} />
        </div>
      ),
    },
  ];

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
          <dd>{data.currency}</dd>
        </div>
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
// Users tab
// ---------------------------------------------------------------------------

function OrgUsersTab({ orgId }: { orgId: string }) {
  const [page, setPage] = useState(1);
  const users = useAsync(
    (signal) => platformApi.organizations.users(orgId, { page, page_size: TAB_PAGE_SIZE }, signal),
    [orgId, page],
  );

  const rows = users.data?.items ?? [];

  const columns: Array<Column<PlatformUser>> = [
    {
      key: 'name',
      header: 'Name',
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
      align: 'right',
      render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : <span className="text-muted">Never</span>),
    },
  ];

  if (users.loading) return <SkeletonRows rows={5} columns={4} />;
  if (users.error) return <ErrorBlock message={users.error} onRetry={users.reload} />;
  if (!rows.length) return <EmptyState title="No users" description="This organization has no users yet." />;

  return (
    <>
      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Organization users" />
      <Pagination page={page} pageSize={users.data?.pageSize ?? TAB_PAGE_SIZE} total={users.data?.total ?? 0} onPageChange={setPage} />
    </>
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
