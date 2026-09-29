import { useState } from 'react';
import { Ban, CheckCircle2, Trash2 } from 'lucide-react';

import { platformApi, type OrgDetail } from '@/api/platform';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';

import type { PlatformUser } from '@/api/platform';

interface OrgDetailDrawerProps {
  orgId: string;
  onClose: () => void;
  /** Called after any change that should refresh the parent list. */
  onChanged: () => void;
}

export function OrgDetailDrawer({ orgId, onClose, onChanged }: OrgDetailDrawerProps) {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync((signal) => platformApi.organizations.get(orgId, signal), [orgId]);
  const suspendSubmit = useSubmit();
  const deleteSubmit = useSubmit();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    { key: 'lastLogin', header: 'Last login', align: 'right', render: (row) => (row.lastLoginAt ? formatDateTime(row.lastLoginAt) : <span className="text-muted">Never</span>) },
  ];

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
