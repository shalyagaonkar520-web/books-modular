import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';

import { platformApi, type PlatformUser } from '@/api/platform';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useDownload } from '@/hooks/useDownload';
import { useSubmit } from '@/hooks/useSubmit';
import { formatDateTime } from '@/utils/format';

import { CreatePlatformUserModal, EditPlatformUserModal, ResetPlatformUserPasswordModal } from './PlatformUserModals';
import { ImpersonateButton } from './ImpersonateButton';

const PAGE_SIZE = 25;

export function UsersPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [organizationId, setOrganizationId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PlatformUser | null>(null);
  const [resetting, setResetting] = useState<PlatformUser | null>(null);
  const [deleting, setDeleting] = useState<PlatformUser | null>(null);
  const deleteSubmit = useSubmit();
  const { download, downloading } = useDownload();
  const debouncedSearch = useDebounced(search);

  const orgs = useAsync((signal) => platformApi.organizations.list({ page: 1, page_size: 200 }, signal), []);

  const users = useAsync(
    (signal) =>
      platformApi.users.list(
        {
          search: debouncedSearch.trim() || undefined,
          organization_id: organizationId || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
      ),
    [debouncedSearch, organizationId, page],
  );

  const orgOptions = useMemo(
    () => [
      { value: '', label: 'All organizations' },
      ...(orgs.data?.items ?? []).map((org) => ({ value: org.id, label: org.name })),
    ],
    [orgs.data],
  );

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await deleteSubmit.run(() => platformApi.users.remove(deleting.id));
    if (result) {
      toast.success(result.message || `${deleting.name} deleted.`);
      setDeleting(null);
      users.reload();
    } else if (deleteSubmit.errorRef.current) {
      toast.error(deleteSubmit.errorRef.current);
    }
  };

  const rows = users.data?.items ?? [];
  const hasFilters = Boolean(debouncedSearch || organizationId);

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
    { key: 'organization', header: 'Organization', render: (row) => row.organizationName },
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
      width: '420px',
      render: (row) => (
        <div className="row-actions">
          <ImpersonateButton user={row} />
          <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(row)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" icon={<KeyRound size={14} />} onClick={() => setResetting(row)}>
            Reset password
          </Button>
          <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setDeleting(row)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Every user across all organizations."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download size={15} />}
              loading={downloading}
              onClick={() =>
                download(() =>
                  platformApi.users.exportCsv({
                    search: debouncedSearch.trim() || undefined,
                    organization_id: organizationId || undefined,
                  }),
                )
              }
            >
              Export CSV
            </Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
              Create user
            </Button>
          </>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search name or email…"
        />
        <FilterSelect
          label="Organization"
          value={organizationId}
          options={orgOptions}
          onChange={(value) => {
            setOrganizationId(value);
            setPage(1);
          }}
        />
      </Toolbar>

      <div className="card">
        {users.loading ? (
          <SkeletonRows rows={6} columns={6} />
        ) : users.error ? (
          <ErrorBlock message={users.error} onRetry={users.reload} />
        ) : !rows.length ? (
          <EmptyState
            title={hasFilters ? 'No users match these filters' : 'No users yet'}
            description={hasFilters ? 'Try a different search or organization.' : 'Create a user to get started.'}
            action={
              hasFilters ? null : (
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                  Create user
                </Button>
              )
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Users across all organizations" />
            <Pagination page={page} pageSize={users.data?.pageSize ?? PAGE_SIZE} total={users.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>

      {creating ? (
        <CreatePlatformUserModal
          organizations={orgs.data?.items ?? []}
          defaultOrganizationId={organizationId || undefined}
          onClose={() => setCreating(false)}
          onCreated={users.reload}
        />
      ) : null}
      {editing ? (
        <EditPlatformUserModal
          user={editing}
          organizations={orgs.data?.items ?? []}
          onClose={() => setEditing(null)}
          onSaved={users.reload}
        />
      ) : null}
      {resetting ? <ResetPlatformUserPasswordModal user={resetting} onClose={() => setResetting(null)} /> : null}

      <ConfirmDialog
        open={!!deleting}
        title="Delete user"
        message={
          deleting ? (
            <p>
              Delete <strong>{deleting.name}</strong> ({deleting.email}) from {deleting.organizationName}? This cannot be undone.
            </p>
          ) : (
            ''
          )
        }
        confirmLabel="Delete"
        busy={deleteSubmit.submitting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
