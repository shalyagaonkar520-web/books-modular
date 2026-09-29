import { useState } from 'react';
import { Ban, CheckCircle2, Plus, Trash2 } from 'lucide-react';

import { platformApi, type PlatformAdmin } from '@/api/platform';
import { usePlatformAuth } from '@/auth/PlatformAuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { formatDateTime } from '@/utils/format';

import { AddAdminModal } from './AddAdminModal';

const PAGE_SIZE = 25;

export function AdminsPage() {
  const toast = useToast();
  const { admin: currentAdmin } = usePlatformAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PlatformAdmin | null>(null);
  const toggleSubmit = useSubmit();
  const deleteSubmit = useSubmit();
  const debouncedSearch = useDebounced(search);

  const admins = useAsync(
    (signal) =>
      platformApi.admins.list(
        {
          search: debouncedSearch.trim() || undefined,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
      ),
    [debouncedSearch, page],
  );

  const toggleActive = async (row: PlatformAdmin) => {
    const next = !row.isActive;
    const updated = await toggleSubmit.run(() => platformApi.admins.update(row.id, { isActive: next }));
    if (updated) {
      toast.success(next ? `${row.name} reactivated.` : `${row.name} deactivated.`);
      admins.reload();
    } else if (toggleSubmit.errorRef.current) {
      toast.error(toggleSubmit.errorRef.current);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await deleteSubmit.run(() => platformApi.admins.remove(deleting.id));
    if (result) {
      toast.success(result.message || `${deleting.name} removed.`);
      setDeleting(null);
      admins.reload();
    } else if (deleteSubmit.errorRef.current) {
      toast.error(deleteSubmit.errorRef.current);
    }
  };

  const rows = admins.data?.items ?? [];
  const hasFilters = Boolean(debouncedSearch);

  const columns: Array<Column<PlatformAdmin>> = [
    {
      key: 'name',
      header: 'Admin',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">
            {row.name}
            {currentAdmin?.id === row.id ? (
              <>
                {' '}
                <Badge tone="info">You</Badge>
              </>
            ) : null}
          </span>
          <small>{row.email}</small>
        </div>
      ),
    },
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
      key: 'created',
      header: 'Added',
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '260px',
      render: (row) => {
        const isSelf = currentAdmin?.id === row.id;
        if (isSelf) return <span className="text-muted small">—</span>;
        return (
          <div className="row-actions">
            <Button
              variant="ghost"
              size="sm"
              icon={row.isActive ? <Ban size={14} /> : <CheckCircle2 size={14} />}
              disabled={toggleSubmit.submitting}
              onClick={() => toggleActive(row)}
            >
              {row.isActive ? 'Deactivate' : 'Activate'}
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => setDeleting(row)}>
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Admins"
        subtitle="Manage the operators who can sign in to this console."
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
            Add admin
          </Button>
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
      </Toolbar>

      <div className="card">
        {admins.loading ? (
          <SkeletonRows rows={6} columns={5} />
        ) : admins.error ? (
          <ErrorBlock message={admins.error} onRetry={admins.reload} />
        ) : !rows.length ? (
          <EmptyState
            title={hasFilters ? 'No admins match this search' : 'No admins yet'}
            description={hasFilters ? 'Try a different search.' : 'Add the first super-admin to get started.'}
            action={
              hasFilters ? null : (
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                  Add admin
                </Button>
              )
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} caption="Super-admins" />
            <Pagination page={page} pageSize={admins.data?.pageSize ?? PAGE_SIZE} total={admins.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>

      {creating ? <AddAdminModal onClose={() => setCreating(false)} onCreated={admins.reload} /> : null}

      <ConfirmDialog
        open={!!deleting}
        title="Delete admin"
        message={
          deleting ? (
            <p>
              Remove <strong>{deleting.name}</strong> ({deleting.email}) from the console? They will no longer be able to sign
              in. This cannot be undone.
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
