import { useState } from 'react';
import { BadgeCheck, Banknote, Eye, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useAppContent } from '@/app/AppContentContext';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { payrollApi } from '@/api/endpoints';
import type { PayRun } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { useSubmit } from '@/hooks/useSubmit';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate, formatNumber } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

import { PayRunCreateModal } from './PayRunCreateModal';
import { PayRunDetailModal } from './PayRunDetailModal';
import { PayRunPayModal } from './PayRunPayModal';

export function PayRunsTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin, organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [paying, setPaying] = useState<PayRun | null>(null);
  const [approving, setApproving] = useState<PayRun | null>(null);
  const [deleting, setDeleting] = useState<PayRun | null>(null);
  const action = useSubmit();

  const { data, loading, error, reload } = useAsync(() => payrollApi.payRuns(), []);
  const payRuns = data ?? [];

  const confirmApprove = async () => {
    if (!approving) return;
    const result = await action.run(() => payrollApi.approvePayRun(approving.id));
    if (result) {
      toast.success(t('payroll.payRuns.toast.approved', { period: result.periodLabel }));
      setApproving(null);
      reload();
    } else if (action.errorRef.current) {
      toast.error(action.errorRef.current);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await action.run(() => payrollApi.removePayRun(deleting.id));
    if (result) {
      toast.success(result.message);
      setDeleting(null);
      reload();
    } else if (action.errorRef.current) {
      toast.error(action.errorRef.current);
    }
  };

  const columns: Array<Column<PayRun>> = [
    { key: 'period', header: t('payroll.payRuns.col.period'), render: (row) => <span className="strong">{row.periodLabel}</span> },
    { key: 'status', header: t('payroll.payRuns.col.status'), render: (row) => <Badge tone={statusTone(row.status)}>{statusLabel(row.status, t)}</Badge> },
    { key: 'employees', header: t('payroll.payRuns.col.employees'), align: 'right', render: (row) => <span className="num">{formatNumber(row.employeeCount, 0)}</span> },
    { key: 'gross', header: t('payroll.payRuns.col.gross'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.totalGross, currency)}</span> },
    { key: 'deductions', header: t('payroll.payRuns.col.deductions'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.totalDeductions, currency)}</span> },
    { key: 'net', header: t('payroll.payRuns.col.net'), align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.totalNet, currency)}</span> },
    { key: 'payDate', header: t('payroll.payRuns.col.payDate'), render: (row) => (row.payDate ? formatDate(row.payDate) : <span className="text-muted">—</span>) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '260px',
      render: (row) => (
        <div className="row-actions">
          <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => setDetailId(row.id)}>
            {t('payroll.payRuns.view')}
          </Button>
          {isAdmin && row.status === 'draft' ? (
            <>
              <Button variant="secondary" size="sm" icon={<BadgeCheck size={14} />} onClick={() => setApproving(row)}>
                {t('payroll.payRuns.approve')}
              </Button>
              <button type="button" className="action-btn is-danger" onClick={() => setDeleting(row)} aria-label={t('payroll.payRuns.deleteAria', { period: row.periodLabel })} title={t('payroll.payRuns.delete')}>
                <Trash2 size={15} />
              </button>
            </>
          ) : null}
          {isAdmin && row.status === 'approved' ? (
            <Button variant="primary" size="sm" icon={<Banknote size={14} />} onClick={() => setPaying(row)}>
              {t('payroll.payRuns.recordPayment')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      <Card
        title={t('payroll.payRuns.card.title')}
        subtitle={t('payroll.payRuns.card.subtitle')}
        actions={
          isAdmin ? (
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
              {t('payroll.payRuns.new')}
            </Button>
          ) : null
        }
      >
        {loading ? <LoadingBlock label={t('payroll.payRuns.loading')} /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && payRuns.length === 0 ? (
          <EmptyState
            title={t('payroll.payRuns.empty.title')}
            description={isAdmin ? t('payroll.payRuns.empty.bodyAdmin') : t('payroll.payRuns.empty.bodyReadOnly')}
          />
        ) : null}
        {!loading && !error && payRuns.length > 0 ? (
          <DataTable columns={columns} rows={payRuns} rowKey={(row) => row.id} caption={t('payroll.payRuns.caption')} />
        ) : null}
      </Card>

      {creating ? <PayRunCreateModal onClose={() => setCreating(false)} onCreated={reload} /> : null}
      {detailId ? <PayRunDetailModal payRunId={detailId} onClose={() => setDetailId(null)} /> : null}
      {paying ? <PayRunPayModal payRun={paying} onClose={() => setPaying(null)} onPaid={reload} /> : null}

      <ConfirmDialog
        open={!!approving}
        title={t('payroll.payRuns.approveDialog.title')}
        message={
          approving ? (
            <>
              {t('payroll.payRuns.approveDialog.before')} <strong>{approving.periodLabel}</strong>{' '}
              {t('payroll.payRuns.approveDialog.after', { amount: formatCurrency(approving.totalNet, currency) })}
            </>
          ) : (
            ''
          )
        }
        confirmLabel={t('payroll.payRuns.approve')}
        tone="primary"
        busy={action.submitting}
        onConfirm={confirmApprove}
        onCancel={() => setApproving(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        title={t('payroll.payRuns.deleteDialog.title')}
        message={
          deleting ? (
            <>
              {t('payroll.payRuns.deleteDialog.before')} <strong>{deleting.periodLabel}</strong> {t('payroll.payRuns.deleteDialog.after')}
            </>
          ) : (
            ''
          )
        }
        confirmLabel={t('payroll.payRuns.delete')}
        busy={action.submitting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
