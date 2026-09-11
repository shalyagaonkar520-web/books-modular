import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { accountingApi } from '@/api/endpoints';
import type { Account } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { CheckboxField } from '@/components/ui/Field';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, titleCase } from '@/utils/format';

import { AccountModal, ACCOUNT_TYPE_OPTIONS } from './AccountModal';

const TYPE_FILTER_OPTIONS = [{ value: '', label: 'All types' }, ...ACCOUNT_TYPE_OPTIONS];

export function ChartOfAccountsTab() {
  const { canWrite } = useAuth();
  const toast = useToast();
  const [typeFilter, setTypeFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; account: Account | null }>({ open: false, account: null });
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const accounts = useAsync(
    () => accountingApi.accounts({ type: typeFilter || undefined, include_inactive: includeInactive }),
    [typeFilter, includeInactive],
  );

  const action = useSubmit();

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await action.run(() => accountingApi.removeAccount(deleteTarget.id));
    if (result) {
      setDeleteTarget(null);
      toast.success(result.message);
      accounts.reload();
    }
  };

  const rows = accounts.data ?? [];

  const columns: Array<Column<Account>> = [
    { key: 'code', header: 'Code', width: '90px', render: (account) => <span className="code-tag">{account.code}</span> },
    {
      key: 'name',
      header: 'Name',
      render: (account) => (
        <div className="cell-stack">
          <span className={account.isActive ? undefined : 'text-subtle'}>{account.name}</span>
          {account.description ? <small>{account.description}</small> : null}
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (account) => titleCase(account.type) },
    { key: 'subtype', header: 'Subtype', render: (account) => <span className="text-muted">{account.subtype ? titleCase(account.subtype) : '—'}</span> },
    {
      key: 'flags',
      header: 'Flags',
      render: (account) => (
        <div className="row">
          {account.isSystem ? <Badge tone="info">System</Badge> : null}
          {account.isActive ? null : <Badge tone="neutral">Inactive</Badge>}
        </div>
      ),
    },
    { key: 'balance', header: 'Balance', align: 'right', render: (account) => <span className="num">{formatCurrency(account.balance)}</span> },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            width: '80px',
            render: (account: Account) => (
              <div className="row-actions">
                <button type="button" className="action-btn" aria-label={`Edit ${account.name}`} onClick={() => setModal({ open: true, account })}>
                  <Pencil size={15} />
                </button>
                {account.isSystem ? null : (
                  <button type="button" className="action-btn is-danger" aria-label={`Delete ${account.name}`} onClick={() => setDeleteTarget(account)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Toolbar>
        <FilterSelect label="Type" value={typeFilter} options={TYPE_FILTER_OPTIONS} onChange={setTypeFilter} />
        <CheckboxField label="Include inactive accounts" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
        <IfCanWrite>
          <Button variant="primary" size="sm" onClick={() => setModal({ open: true, account: null })}>
            New account
          </Button>
        </IfCanWrite>
      </Toolbar>

      <Card title="Chart of accounts" subtitle={`${rows.length} account(s)`}>
        {accounts.loading ? (
          <SkeletonRows rows={8} columns={6} />
        ) : accounts.error ? (
          <ErrorBlock message={accounts.error} onRetry={accounts.reload} />
        ) : !rows.length ? (
          <EmptyState title="No accounts match this filter" description="Clear the type filter or create a new ledger account." />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(account) => account.id} caption="Chart of accounts" />
        )}
      </Card>

      <AccountModal
        open={modal.open}
        account={modal.account}
        onClose={() => setModal({ open: false, account: null })}
        onSaved={(message) => {
          setModal({ open: false, account: null });
          toast.success(message);
          accounts.reload();
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete account"
        message={
          <>
            <FormError message={action.error} />
            {deleteTarget
              ? `Delete ${deleteTarget.code} · ${deleteTarget.name}? If the account already has journal lines it will be deactivated instead.`
              : ''}
          </>
        }
        confirmLabel="Delete"
        busy={action.submitting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setDeleteTarget(null);
          action.reset();
        }}
      />
    </>
  );
}
