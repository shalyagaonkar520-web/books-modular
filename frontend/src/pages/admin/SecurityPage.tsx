/** Security: who is signed in where (sign a device or a user out), and every sign-in attempt. */
import { useState } from 'react';
import { LogIn, LogOut, MonitorSmartphone, ShieldAlert, Users } from 'lucide-react';

import { adminConsoleApi, type LoginEvent, type SignedInSession } from '@/api/adminConsole';
import { useScopedOrgApi } from '@/api/ApiScope';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime } from '@/utils/format';

const PAGE_SIZE = 25;

/** "Mozilla/5.0 (Windows NT 10.0…) Chrome/131…" -> "Chrome on Windows". */
export function deviceName(agent?: string | null): string {
  if (!agent) return 'Unknown device';
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /OPR\//.test(agent)
      ? 'Opera'
      : /Chrome\//.test(agent)
        ? 'Chrome'
        : /Firefox\//.test(agent)
          ? 'Firefox'
          : /Safari\//.test(agent)
            ? 'Safari'
            : 'A browser';
  const os = /Android/.test(agent)
    ? 'Android'
    : /iPhone|iPad/.test(agent)
      ? 'iPhone / iPad'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Mac OS/.test(agent)
          ? 'Mac'
          : /Linux/.test(agent)
            ? 'Linux'
            : 'another system';
  return `${browser} on ${os}`;
}

export function SecurityPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const orgApi = useScopedOrgApi();
  const summary = useAsync((signal) => adminConsoleApi.security.summary(signal), []);
  const sessions = useAsync((signal) => adminConsoleApi.security.sessions(signal), []);
  const users = useAsync(() => orgApi.users(), []);
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);
  const logins = useAsync(
    (signal) => adminConsoleApi.security.logins({ page, page_size: PAGE_SIZE, user_id: userId || undefined, failed_only: failedOnly || undefined }, signal),
    [page, userId, failedOnly],
  );
  const [signingOut, setSigningOut] = useState<{ userId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    summary.reload();
    sessions.reload();
  };
  const revoke = async (row: SignedInSession) => {
    try {
      toast.success((await adminConsoleApi.security.revokeSession(row.id)).message);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };
  const signOutEverywhere = async () => {
    if (!signingOut) return;
    setBusy(true);
    try {
      toast.success((await adminConsoleApi.security.signOutEverywhere(signingOut.userId)).message);
      setSigningOut(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const sessionColumns: Array<Column<SignedInSession>> = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.userName}</span>
          <small>{row.userEmail}</small>
        </div>
      ),
    },
    { key: 'device', header: 'Device', render: (row) => deviceName(row.userAgent) },
    { key: 'ip', header: 'IP address', render: (row) => <span className="mono">{row.ipAddress || '—'}</span> },
    { key: 'since', header: 'Signed in', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => void revoke(row)}>
            Sign out this device
          </Button>
          {row.userId !== me?.id ? (
            <Button variant="danger" size="sm" icon={<LogOut size={14} />} onClick={() => setSigningOut({ userId: row.userId, name: row.userName })}>
              Sign out everywhere
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const loginColumns: Array<Column<LoginEvent>> = [
    { key: 'when', header: 'When', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'user',
      header: 'Account',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.userName ?? row.email}</span>
          {row.userName ? <small>{row.email}</small> : null}
        </div>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (row) => (row.success ? <Badge tone="success">Signed in</Badge> : <Badge tone="danger">{row.reason ?? 'Failed'}</Badge>),
    },
    { key: 'device', header: 'Device', render: (row) => deviceName(row.userAgent) },
    { key: 'ip', header: 'IP address', render: (row) => <span className="mono">{row.ipAddress || '—'}</span> },
  ];

  return (
    <div className="stack">
      {summary.data ? (
        <div className="stat-grid">
          <StatTile label="Sign-ins today" value={String(summary.data.signInsToday)} icon={<LogIn size={16} />} />
          <StatTile
            label="Failed today"
            value={String(summary.data.failedToday)}
            sublabel={`${summary.data.failedLast7Days} in the last 7 days`}
            tone={summary.data.failedToday ? 'negative' : 'neutral'}
            icon={<ShieldAlert size={16} />}
          />
          <StatTile label="Signed-in devices" value={String(summary.data.signedInSessions)} icon={<MonitorSmartphone size={16} />} />
          <StatTile label="People signed in" value={String(summary.data.usersSignedIn)} icon={<Users size={16} />} />
        </div>
      ) : null}

      <Card
        title="Signed in now"
        subtitle="Every device where someone is signed in. Sign out a lost phone, or a person everywhere at once: their open pages stop working straight away."
      >
        {sessions.loading && !sessions.data ? <LoadingBlock /> : null}
        {sessions.error ? <ErrorBlock message={sessions.error} onRetry={sessions.reload} /> : null}
        {sessions.data && sessions.data.length === 0 ? <EmptyState title="Nobody is signed in" description="Devices appear here when people sign in." /> : null}
        {sessions.data && sessions.data.length > 0 ? <DataTable columns={sessionColumns} rows={sessions.data} rowKey={(row) => row.id} /> : null}
      </Card>

      <Card title="Sign-in history" subtitle="Every sign-in to your organization’s accounts, including wrong passwords. Many failed attempts on one account can mean someone is guessing.">
        <div className="form-grid-3">
          <SelectField
            label="Account"
            value={userId}
            options={[{ value: '', label: 'Everyone' }, ...(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))]}
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(1);
            }}
          />
          <CheckboxField
            label="Only failed sign-ins"
            checked={failedOnly}
            onChange={(e) => {
              setFailedOnly(e.target.checked);
              setPage(1);
            }}
          />
        </div>
        {logins.loading && !logins.data ? <LoadingBlock /> : null}
        {logins.error ? <ErrorBlock message={logins.error} onRetry={logins.reload} /> : null}
        {logins.data && logins.data.items.length === 0 ? <EmptyState title="No sign-ins" description="Nothing matches yet." /> : null}
        {logins.data && logins.data.items.length > 0 ? (
          <>
            <DataTable columns={loginColumns} rows={logins.data.items} rowKey={(row) => row.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={logins.data.total} onPageChange={setPage} />
          </>
        ) : null}
      </Card>

      <ConfirmDialog
        open={!!signingOut}
        title="Sign out everywhere"
        message={signingOut ? `Sign ${signingOut.name} out of every device? They have to sign in again to keep working.` : ''}
        confirmLabel="Sign out everywhere"
        busy={busy}
        onConfirm={() => void signOutEverywhere()}
        onCancel={() => setSigningOut(null)}
      />
    </div>
  );
}
