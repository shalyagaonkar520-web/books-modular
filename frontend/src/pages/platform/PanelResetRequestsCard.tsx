import { useState } from 'react';

import { platformApi, type PanelResetRequest } from '@/api/platform';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBlock } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatDateTime } from '@/utils/format';

import { PanelCredentialsModal, type PanelCredentials } from './PanelAdminForms';

/**
 * Organization admins who forgot their admin panel password. Approving issues a
 * new temporary password (shown once, to hand over); the admin then chooses
 * their own at sign-in. Declining leaves the current password as it is.
 */
export function PanelResetRequestsCard() {
  const toast = useToast();
  const requests = useAsync((signal) => platformApi.organizations.panelAdmins.resetRequests(signal), []);
  const approveSubmit = useSubmit();
  const declineSubmit = useSubmit();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<PanelCredentials | null>(null);

  const approve = async (row: PanelResetRequest) => {
    setBusyId(row.admin.id);
    const result = await approveSubmit.run(() => platformApi.organizations.panelAdmins.resetPassword(row.admin.id));
    setBusyId(null);
    if (result) setCredentials({ orgName: row.organizationName, loginId: result.loginId, password: result.password });
    else if (approveSubmit.errorRef.current) toast.error(approveSubmit.errorRef.current);
  };

  const decline = async (row: PanelResetRequest) => {
    setBusyId(row.admin.id);
    const result = await declineSubmit.run(() => platformApi.organizations.panelAdmins.dismissReset(row.admin.id));
    setBusyId(null);
    if (result) {
      toast.success(`Reset request from ${row.admin.email} declined.`);
      requests.reload();
    }
  };

  const rows = requests.data ?? [];
  const columns: Array<Column<PanelResetRequest>> = [
    {
      key: 'org',
      header: 'Organization',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.organizationName}</span>
          {row.organizationCode ? <small>{row.organizationCode}</small> : null}
        </div>
      ),
    },
    { key: 'login', header: 'Admin ID', render: (row) => <span className="mono">{row.admin.email}</span> },
    { key: 'when', header: 'Requested', render: (row) => (row.admin.resetRequestedAt ? formatDateTime(row.admin.resetRequestedAt) : '') },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <Button variant="primary" size="sm" loading={busyId === row.admin.id && approveSubmit.submitting} onClick={() => void approve(row)}>
            Approve and reset
          </Button>
          <Button variant="ghost" size="sm" disabled={busyId === row.admin.id} onClick={() => void decline(row)}>
            Decline
          </Button>
        </div>
      ),
    },
  ];

  // Nothing to show when there are no requests.
  if (!requests.error && !rows.length) return null;

  return (
    <Card
      title="Admin password reset requests"
      subtitle={`${rows.length} organization admin(s) forgot their admin panel password`}
      className="card-attention"
    >
      {requests.error ? (
        <ErrorBlock message={requests.error} onRetry={requests.reload} />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(row) => row.admin.id} caption="Admin password reset requests" />
      )}
      {credentials ? (
        <PanelCredentialsModal
          credentials={credentials}
          onClose={() => {
            setCredentials(null);
            requests.reload();
          }}
        />
      ) : null}
    </Card>
  );
}
