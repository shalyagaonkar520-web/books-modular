import { useState } from 'react';
import { FileText } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { useAppContent } from '@/app/AppContentContext';
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
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const [openSlip, setOpenSlip] = useState<Payslip | null>(null);
  const { data, loading, error, reload } = useAsync(() => payrollApi.payRun(payRunId), [payRunId]);

  const columns: Array<Column<Payslip>> = [
    {
      key: 'employee',
      header: t('payroll.payRunDetail.col.employee'),
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
    { key: 'gross', header: t('payroll.payRunDetail.col.gross'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.gross, currency)}</span> },
    { key: 'pf', header: t('payroll.payRunDetail.col.pf'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.pfEmployee, currency)}</span> },
    { key: 'pt', header: t('payroll.payRunDetail.col.pt'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.professionalTax, currency)}</span> },
    { key: 'tds', header: t('payroll.payRunDetail.col.tds'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.tds, currency)}</span> },
    {
      key: 'lop',
      header: t('payroll.payRunDetail.col.lop'),
      align: 'right',
      render: (row) =>
        row.lossOfPayDays > 0 ? (
          <span className="num text-warning">
            {t('payroll.payRunDetail.lopValue', { days: formatQuantity(row.lossOfPayDays), amount: formatCurrency(row.lossOfPayAmount, currency) })}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: 'deductions', header: t('payroll.payRunDetail.col.deductions'), align: 'right', render: (row) => <span className="num">{formatCurrency(row.totalDeductions, currency)}</span> },
    { key: 'net', header: t('payroll.payRunDetail.col.net'), align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.netPay, currency)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '130px',
      render: (row) => (
        <Button variant="link" size="sm" icon={<FileText size={14} />} onClick={() => setOpenSlip(row)}>
          {t('payroll.payRunDetail.viewPayslip')}
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
        title={data ? t('payroll.payRunDetail.title', { period: data.periodLabel }) : t('payroll.payRunDetail.titleFallback')}
        subtitle={data ? `${t('payroll.payRunDetail.employees', { count: data.employeeCount })}${data.payDate ? ' ' + t('payroll.payRunDetail.paidOn', { date: formatDate(data.payDate) }) : ''}` : undefined}
        onClose={onClose}
        footer={
          <Button variant="secondary" onClick={onClose}>
            {t('payroll.payRunDetail.close')}
          </Button>
        }
      >
        {loading ? <LoadingBlock label={t('payroll.payRunDetail.loading')} /> : null}
        {!loading && error ? <ErrorBlock message={error} onRetry={reload} /> : null}
        {!loading && !error && data ? (
          <div className="stack">
            <div className="row-between">
              <Badge tone={statusTone(data.status)}>{statusLabel(data.status, t)}</Badge>
              <span className="text-muted small">{t('payroll.payRunDetail.created', { date: formatDate(data.createdAt) })}</span>
            </div>
            {data.payslips.length === 0 ? (
              <EmptyState title={t('payroll.payRunDetail.empty.title')} description={t('payroll.payRunDetail.empty.body')} />
            ) : (
              <DataTable
                columns={columns}
                rows={data.payslips}
                rowKey={(row) => row.id}
                caption={t('payroll.payRunDetail.caption')}
                footer={
                  <tr>
                    <td>{t('payroll.payRunDetail.total')}</td>
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
