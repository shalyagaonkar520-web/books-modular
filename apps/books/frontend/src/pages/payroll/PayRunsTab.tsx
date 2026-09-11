import { useState } from 'react';
import { BadgeCheck, Banknote, Eye, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/DataTable';
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
      toast.success(`${result.periodLabel} pay run approved.`);
      setApproving(null);
      reload();
    } else if (action.error) {
      toast.error(action.error);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const result = await action.run(() => payrollApi.removePayRun(deleting.id));
    if (result) {
      toast.success(result.message);
      setDeleting(null);
      reload();
    } else if (action.error) {
      toast.error(action.error);
    }
  };

  const columns: Array<Column<PayRun>> = [
    { key: 'period', header: 'Period', render: (row) => <span className="strong">{row.periodLabel}</span> },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge> },
    { key: 'employees', header: 'Employees', align: 'right', render: (row) => <span className="num">{formatNumber(row.employeeCount, 0)}</span> },
    { key: 'gross', header: 'Gross', align: 'right', render: (row) => <span className="num">{formatCurrency(row.totalGross, currency)}</span> },
    { key: 'deductions', header: 'Deductions', align: 'right', render: (row) => <span className="num">{formatCurrency(row.totalDeductions, currency)}</span> },
    { key: 'net', header: 'Net', align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.totalNet, currency)}</span> },
    { key: 'payDate', header: 'Pay date', render: (row) => (row.payDate ? formatDate(row.payDate) : <span className="text-muted">—</span>) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '260px',
      render: (row) => (
        <div className="row-actions">
          <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => setDetailId(row.id)}>
            View
          </Button>
          {isAdmin && row.status === 'draft' ? (
            <>
              <Button variant="secondary" size="sm" icon={<BadgeCheck size={14} />} onClick={() => setApproving(row)}>
                Approve
              </Button>
              <button type="button" className="action-btn is-danger" onClick={() => setDeleting(row)} aria-label={`Delete ${row.periodLabel} pay run`} title="Delete">
                <Trash2 size={15} />
              </button>
            </>
          ) : null}
          {isAdmin && row.status === 'approved' ? (
            <Button variant="primary" size="sm" icon={<Banknote size={14} />} onClick={() => setPaying(row)}>
              Record payment
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="stack">
      <Card
        title="Pay runs"
        subtitle="Draft a pay run, approve it, then record the payment to post it to the ledger"
        actions={
          isAdmin ? (
            <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setCreating(true)}>
              New pay run
            </Button>
          ) : null
        }
      >
        {loading ? <LoadingBlock label="Loading pay runs…" /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && payRuns.length === 0 ? (
          <EmptyState
            title="No pay runs yet"
            description={isAdmin ? 'Create a pay run for a month to generate payslips for every active employee.' : 'An administrator has not created a pay run yet.'}
          />
        ) : null}
        {!loading && !error && payRuns.length > 0 ? (
          <DataTable columns={columns} rows={payRuns} rowKey={(row) => row.id} caption="Monthly pay runs" />
        ) : null}
      </Card>

      {creating ? <PayRunCreateModal onClose={() => setCreating(false)} onCreated={reload} /> : null}
      {detailId ? <PayRunDetailModal payRunId={detailId} onClose={() => setDetailId(null)} /> : null}
      {paying ? <PayRunPayModal payRun={paying} onClose={() => setPaying(null)} onPaid={reload} /> : null}

      <ConfirmDialog
        open={!!approving}
        title="Approve pay run"
        message={
          approving ? (
            <>
              Approve the <strong>{approving.periodLabel}</strong> pay run for {formatCurrency(approving.totalNet, currency)} net? Payslips are
              locked once approved, and you can then record the payment.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Approve"
        tone="primary"
        busy={action.submitting}
        onConfirm={confirmApprove}
        onCancel={() => setApproving(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Delete pay run"
        message={
          deleting ? (
            <>
              The <strong>{deleting.periodLabel}</strong> pay run and its payslips will be deleted. Paid pay runs cannot be deleted.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete"
        busy={action.submitting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
