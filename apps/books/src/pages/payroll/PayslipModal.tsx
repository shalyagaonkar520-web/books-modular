import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Payslip } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { formatCurrency, formatDate, formatQuantity } from '@/utils/format';

interface PayslipModalProps {
  payslip: Payslip;
  periodLabel: string;
  payDate?: string | null;
  onClose: () => void;
}

export function PayslipModal({ payslip, periodLabel, payDate, onClose }: PayslipModalProps) {
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const money = (value: number) => formatCurrency(value, currency);

  return (
    <Modal
      open
      size="lg"
      title={`Payslip · ${payslip.employeeName}`}
      subtitle={periodLabel}
      onClose={onClose}
      footer={
        <div className="row no-print">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()}>
            Print payslip
          </Button>
        </div>
      }
    >
      <div className="printable stack">
        <div className="row-between">
          <div className="cell-stack">
            <span className="strong">{organization?.legalName || organization?.name || 'Payslip'}</span>
            {organization?.address ? <small>{organization.address}</small> : null}
            <small>{[organization?.city, organization?.state, organization?.postalCode].filter(Boolean).join(', ')}</small>
            {organization?.gstin ? <small>GSTIN {organization.gstin}</small> : null}
          </div>
          <div className="cell-stack">
            <span className="strong">Payslip for {periodLabel}</span>
            <small>{payDate ? `Paid on ${formatDate(payDate)}` : 'Not yet paid'}</small>
          </div>
        </div>

        <dl className="detail-grid">
          <div className="detail-item">
            <dt className="detail-label">Employee</dt>
            <dd className="detail-value">{payslip.employeeName}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Employee code</dt>
            <dd className="detail-value mono">{payslip.employeeCode}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Designation</dt>
            <dd className="detail-value">{payslip.designation ?? '—'}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Department</dt>
            <dd className="detail-value">{payslip.department ?? '—'}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">PAN</dt>
            <dd className="detail-value mono">{payslip.pan ?? '—'}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">Bank account</dt>
            <dd className="detail-value mono">{payslip.bankAccountNumberMasked ?? '—'}</dd>
          </div>
        </dl>

        <div className="grid-2">
          <section className="stack">
            <h3 className="form-section-title">Earnings</h3>
            <div className="totals-list">
              <div>
                <span>Basic salary</span>
                <span className="num">{money(payslip.basicSalary)}</span>
              </div>
              <div>
                <span>House rent allowance</span>
                <span className="num">{money(payslip.hra)}</span>
              </div>
              <div>
                <span>Other allowances</span>
                <span className="num">{money(payslip.otherAllowances)}</span>
              </div>
              {payslip.lossOfPayAmount > 0 ? (
                <div>
                  <span>Loss of pay ({formatQuantity(payslip.lossOfPayDays)} days)</span>
                  <span className="num text-danger">-{money(payslip.lossOfPayAmount)}</span>
                </div>
              ) : null}
              <div className="grand">
                <span>Gross pay</span>
                <span className="num">{money(payslip.gross)}</span>
              </div>
            </div>
          </section>

          <section className="stack">
            <h3 className="form-section-title">Deductions</h3>
            <div className="totals-list">
              <div>
                <span>Provident fund (employee)</span>
                <span className="num">{money(payslip.pfEmployee)}</span>
              </div>
              <div>
                <span>Professional tax</span>
                <span className="num">{money(payslip.professionalTax)}</span>
              </div>
              <div>
                <span>TDS</span>
                <span className="num">{money(payslip.tds)}</span>
              </div>
              <div className="grand">
                <span>Total deductions</span>
                <span className="num">{money(payslip.totalDeductions)}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="totals-list">
          <div className="grand">
            <span>Net pay</span>
            <span className="num text-success">{money(payslip.netPay)}</span>
          </div>
        </div>
        <p className="text-subtle small">This is a computer-generated payslip and does not require a signature.</p>
      </div>
    </Modal>
  );
}
