import { useState } from 'react';
import { FileText } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { payrollApi } from '@/api/endpoints';
import type { Payslip } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate, formatQuantity } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

import { PayslipModal } from './PayslipModal';

interface PayRunDetailModalProps {
  payRunId: string;
  onClose: () => void;
}

export function PayRunDetailModal({ payRunId, onClose }: PayRunDetailModalProps) {
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const [openSlip, setOpenSlip] = useState<Payslip | null>(null);
  const { data, loading, error, reload } = useAsync(() => payrollApi.payRun(payRunId), [payRunId]);

  const columns: Array<Column<Payslip>> = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="cell-stack">
          <span className="strong">{row.employeeName}</span>
          <small>
            {row.employeeCode}
            {row.designation ? ` · ${row.designation}` : ''}
          </small>
        </div>
      ),
    },
    { key: 'gross', header: 'Gross', align: 'right', render: (row) => <span className="num">{formatCurrency(row.gross, currency)}</span> },
    { key: 'pf', header: 'PF', align: 'right', render: (row) => <span className="num">{formatCurrency(row.pfEmployee, currency)}</span> },
    { key: 'pt', header: 'Prof. tax', align: 'right', render: (row) => <span className="num">{formatCurrency(row.professionalTax, currency)}</span> },
    { key: 'tds', header: 'TDS', align: 'right', render: (row) => <span className="num">{formatCurrency(row.tds, currency)}</span> },
    {
      key: 'lop',
      header: 'Loss of pay',
      align: 'right',
      render: (row) =>
        row.lossOfPayDays > 0 ? (
          <span className="num text-warning">
            {formatQuantity(row.lossOfPayDays)} d · {formatCurrency(row.lossOfPayAmount, currency)}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'deductions', header: 'Deductions', align: 'right', render: (row) => <span className="num">{formatCurrency(row.totalDeductions, currency)}</span> },
    { key: 'net', header: 'Net pay', align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.netPay, currency)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '130px',
      render: (row) => (
        <Button variant="link" size="sm" icon={<FileText size={14} />} onClick={() => setOpenSlip(row)}>
          View payslip
        </Button>
      ),
    },
  ];

  const totals = (data?.payslips ?? []).reduce(
    (sum, slip) => ({
      gross: sum.gross + slip.gross,
      pf: sum.pf + slip.pfEmployee,
      pt: sum.pt + slip.professionalTax,
      tds: sum.tds + slip.tds,
      lop: sum.lop + slip.lossOfPayAmount,
      deductions: sum.deductions + slip.totalDeductions,
      net: sum.net + slip.netPay,
    }),
    { gross: 0, pf: 0, pt: 0, tds: 0, lop: 0, deductions: 0, net: 0 },
  );

  return (
    <>
      <Modal
        open
        size="xl"
        title={data ? `Pay run · ${data.periodLabel}` : 'Pay run'}
        subtitle={data ? `${data.employeeCount} employees${data.payDate ? ` · paid on ${formatDate(data.payDate)}` : ''}` : undefined}
        onClose={onClose}
        footer={
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        }
      >
        {loading ? <LoadingBlock label="Loading payslips…" /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && data ? (
          <div className="stack">
            <div className="row-between">
              <Badge tone={statusTone(data.status)}>{statusLabel(data.status)}</Badge>
              <span className="text-muted small">Created {formatDate(data.createdAt)}</span>
            </div>
            {data.payslips.length === 0 ? (
              <EmptyState title="This pay run has no payslips" description="Delete it and create a new pay run for the period." />
            ) : (
              <DataTable
                columns={columns}
                rows={data.payslips}
                rowKey={(row) => row.id}
                caption="Payslips in this pay run"
                footer={
                  <tr>
                    <td>Total</td>
                    <td className="align-right num">{formatCurrency(totals.gross, currency)}</td>
                    <td className="align-right num">{formatCurrency(totals.pf, currency)}</td>
                    <td className="align-right num">{formatCurrency(totals.pt, currency)}</td>
                    <td className="align-right num">{formatCurrency(totals.tds, currency)}</td>
                    <td className="align-right num">{formatCurrency(totals.lop, currency)}</td>
                    <td className="align-right num">{formatCurrency(totals.deductions, currency)}</td>
                    <td className="align-right num">{formatCurrency(totals.net, currency)}</td>
                    <td />
                  </tr>
                }
              />
            )}
          </div>
        ) : null}
      </Modal>

      {openSlip && data ? (
        <PayslipModal payslip={openSlip} periodLabel={data.periodLabel} payDate={data.payDate} onClose={() => setOpenSlip(null)} />
      ) : null}
    </>
  );
}
