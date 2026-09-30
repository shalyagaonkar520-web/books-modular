import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { accountingApi } from '@/api/endpoints';
import type { Account } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
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

export function ChartOfAccountsTab() {
  const { t } = useAppContent();
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

  const typeFilterOptions = [
    { value: '', label: t('accounting.accounts.filter.allTypes') },
    ...ACCOUNT_TYPE_OPTIONS.map((option) => ({ ...option, label: t(option.label) })),
  ];

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
    { key: 'code', header: t('accounting.accounts.col.code'), width: '90px', render: (account) => <span className="code-tag">{account.code}</span> },
    {
      key: 'name',
      header: t('accounting.accounts.col.name'),
      render: (account) => (
        <div className="cell-stack">
          <span className={account.isActive ? undefined : 'text-subtle'}>{account.name}</span>
          {account.description ? <small>{account.description}</small> : null}
        </div>
      ),
    },
    { key: 'type', header: t('accounting.accounts.col.type'), render: (account) => titleCase(account.type) },
    { key: 'subtype', header: t('accounting.accounts.col.subtype'), render: (account) => <span className="text-muted">{account.subtype ? titleCase(account.subtype) : '—'}</span> },
    {
      key: 'flags',
      header: t('accounting.accounts.col.flags'),
      render: (account) => (
        <div className="row">
          {account.isSystem ? <Badge tone="info">{t('accounting.accounts.badge.system')}</Badge> : null}
          {account.isActive ? null : <Badge tone="neutral">{t('accounting.accounts.badge.inactive')}</Badge>}
        </div>
      ),
    },
    { key: 'balance', header: t('accounting.accounts.col.balance'), align: 'right', render: (account) => <span className="num">{formatCurrency(account.balance)}</span> },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            width: '80px',
            render: (account: Account) => (
              <div className="row-actions">
                <button
                  type="button"
                  className="action-btn"
                  aria-label={t('accounting.accounts.editAria', { name: account.name })}
                  onClick={() => setModal({ open: true, account })}
                >
                  <Pencil size={15} />
                </button>
                {account.isSystem ? null : (
                  <button
                    type="button"
                    className="action-btn is-danger"
                    aria-label={t('accounting.accounts.deleteAria', { name: account.name })}
                    onClick={() => setDeleteTarget(account)}
                  >
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
        <FilterSelect label={t('accounting.accounts.filter.type')} value={typeFilter} options={typeFilterOptions} onChange={setTypeFilter} />
        <CheckboxField label={t('accounting.accounts.filter.includeInactive')} checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
        <IfCanWrite>
          <Button variant="primary" size="sm" onClick={() => setModal({ open: true, account: null })}>
            {t('accounting.accounts.newAccount')}
          </Button>
        </IfCanWrite>
      </Toolbar>

      <Card title={t('accounting.accounts.cardTitle')} subtitle={t('accounting.accounts.count', { count: rows.length })}>
        {accounts.loading ? (
          <SkeletonRows rows={8} columns={6} />
        ) : accounts.error ? (
          <ErrorBlock message={accounts.error} onRetry={accounts.reload} />
        ) : !rows.length ? (
          <EmptyState title={t('accounting.accounts.empty.title')} description={t('accounting.accounts.empty.body')} />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(account) => account.id} caption={t('accounting.accounts.tableCaption')} />
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
        title={t('accounting.accounts.delete.title')}
        message={
          <>
            <FormError message={action.error} />
            {deleteTarget ? t('accounting.accounts.delete.body', { code: deleteTarget.code, name: deleteTarget.name }) : ''}
          </>
        }
        confirmLabel={t('accounting.accounts.delete.confirm')}
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
