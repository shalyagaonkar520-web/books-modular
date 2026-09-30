import { Printer } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
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
  const { t } = useAppContent();
  const { organization } = useAuth();
  const currency = organization?.currency ?? 'INR';
  const money = (value: number) => formatCurrency(value, currency);

  return (
    <Modal
      open
      size="lg"
      title={t('payroll.payslip.title', { name: payslip.employeeName })}
      subtitle={periodLabel}
      onClose={onClose}
      footer={
        <div className="row no-print">
          <Button variant="secondary" onClick={onClose}>
            {t('payroll.payslip.close')}
          </Button>
          <Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()}>
            {t('payroll.payslip.print')}
          </Button>
        </div>
      }
    >
      <div className="printable stack">
        <div className="row-between">
          <div className="cell-stack">
            <span className="strong">{organization?.legalName || organization?.name || t('payroll.payslip.fallbackHeading')}</span>
            {organization?.address ? <small>{organization.address}</small> : null}
            <small>{[organization?.city, organization?.state, organization?.postalCode].filter(Boolean).join(', ')}</small>
            {organization?.gstin ? <small>{t('payroll.payslip.gstin', { gstin: organization.gstin })}</small> : null}
          </div>
          <div className="cell-stack">
            <span className="strong">{t('payroll.payslip.for', { period: periodLabel })}</span>
            <small>{payDate ? t('payroll.payslip.paidOn', { date: formatDate(payDate) }) : t('payroll.payslip.notPaid')}</small>
          </div>
        </div>

        <dl className="detail-grid">
          <div className="detail-item">
            <dt className="detail-label">{t('payroll.payslip.employee')}</dt>
            <dd className="detail-value">{payslip.employeeName}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{t('payroll.payslip.employeeCode')}</dt>
            <dd className="detail-value mono">{payslip.employeeCode}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{t('payroll.payslip.designation')}</dt>
            <dd className="detail-value">{payslip.designation ?? '—'}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{t('payroll.payslip.department')}</dt>
            <dd className="detail-value">{payslip.department ?? '—'}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{t('payroll.payslip.pan')}</dt>
            <dd className="detail-value mono">{payslip.pan ?? '—'}</dd>
          </div>
          <div className="detail-item">
            <dt className="detail-label">{t('payroll.payslip.bankAccount')}</dt>
            <dd className="detail-value mono">{payslip.bankAccountNumberMasked ?? '—'}</dd>
          </div>
        </dl>

        <div className="grid-2">
          <section className="stack">
            <h3 className="form-section-title">{t('payroll.payslip.earnings')}</h3>
            <div className="totals-list">
              <div>
                <span>{t('payroll.payslip.basic')}</span>
                <span className="num">{money(payslip.basicSalary)}</span>
              </div>
              <div>
                <span>{t('payroll.payslip.hra')}</span>
                <span className="num">{money(payslip.hra)}</span>
              </div>
              <div>
                <span>{t('payroll.payslip.otherAllowances')}</span>
                <span className="num">{money(payslip.otherAllowances)}</span>
              </div>
              {payslip.lossOfPayAmount > 0 ? (
                <div>
                  <span>{t('payroll.payslip.lop', { days: formatQuantity(payslip.lossOfPayDays) })}</span>
                  <span className="num text-danger">-{money(payslip.lossOfPayAmount)}</span>
                </div>
              ) : null}
              <div className="grand">
                <span>{t('payroll.payslip.gross')}</span>
                <span className="num">{money(payslip.gross)}</span>
              </div>
            </div>
          </section>

          <section className="stack">
            <h3 className="form-section-title">{t('payroll.payslip.deductions')}</h3>
            <div className="totals-list">
              <div>
                <span>{t('payroll.payslip.pf')}</span>
                <span className="num">{money(payslip.pfEmployee)}</span>
              </div>
              <div>
                <span>{t('payroll.payslip.professionalTax')}</span>
                <span className="num">{money(payslip.professionalTax)}</span>
              </div>
              <div>
                <span>{t('payroll.payslip.tds')}</span>
                <span className="num">{money(payslip.tds)}</span>
              </div>
              <div className="grand">
                <span>{t('payroll.payslip.totalDeductions')}</span>
                <span className="num">{money(payslip.totalDeductions)}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="totals-list">
          <div className="grand">
            <span>{t('payroll.payslip.net')}</span>
            <span className="num text-success">{money(payslip.netPay)}</span>
          </div>
        </div>
        <p className="text-subtle small">{t('payroll.payslip.footer')}</p>
      </div>
    </Modal>
  );
}
