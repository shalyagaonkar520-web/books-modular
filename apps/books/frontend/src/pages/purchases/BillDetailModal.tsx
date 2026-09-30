import { useState } from 'react';
import { Trash2, Wallet } from 'lucide-react';

import { billsApi, vendorPaymentsApi } from '@/api/endpoints';
import type { VendorPayment } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAppContent } from '@/app/AppContentContext';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { daysBetween, formatCurrency, formatDate, formatPercent, formatQuantity, titleCase, todayIso } from '@/utils/format';
import { PAYMENT_MODES, statusLabel, statusTone } from '@/utils/status';

import type { VendorPaymentBill } from './RecordVendorPaymentModal';

/** Whole days a still-unpaid document is past its due date. */
export function overdueDays(bill: { dueDate: string; status: string }): number {
  if (bill.status !== 'overdue') return 0;
  return Math.max(0, daysBetween(bill.dueDate, todayIso()));
}

interface BillDetailModalProps {
  billId: string;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
  onRecordPayment: (bill: VendorPaymentBill) => void;
}

export function BillDetailModal({ billId, canWrite, onClose, onChanged, onRecordPayment }: BillDetailModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const remove = useSubmit();
  const [pendingPayment, setPendingPayment] = useState<VendorPayment | null>(null);

  const detail = useAsync(async () => {
    const [bill, payments] = await Promise.all([billsApi.get(billId), vendorPaymentsApi.list({ bill_id: billId, page_size: 200 })]);
    return { bill, payments: payments.items };
  }, [billId]);

  const bill = detail.data?.bill ?? null;

  const deletePayment = async (payment: VendorPayment) => {
    const result = await remove.run(() => vendorPaymentsApi.remove(payment.id));
    if (result) {
      toast.success(t('bills.detail.paymentDeleted', { number: payment.paymentNumber }));
      setPendingPayment(null);
      detail.reload();
      onChanged();
    }
  };

  return (
    <Modal
      open
      title={bill ? t('bills.detail.title', { number: bill.billNumber }) : t('bills.detail.titleFallback')}
      subtitle={bill ? `${bill.vendorName} · ${statusLabel(bill.status, t)}` : undefined}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('bills.detail.close')}
          </Button>
          {canWrite && bill && bill.balanceDue > 0 && ['open', 'partially_paid', 'overdue'].includes(bill.status) ? (
            <Button
              variant="primary"
              icon={<Wallet size={15} />}
              onClick={() => onRecordPayment({ id: bill.id, billNumber: bill.billNumber, vendorId: bill.vendorId, vendorName: bill.vendorName, balanceDue: bill.balanceDue })}
            >
              {t('bills.detail.recordPayment')}
            </Button>
          ) : null}
        </>
      }
    >
      {detail.loading ? (
        <LoadingBlock label={t('bills.detail.loading')} />
      ) : detail.error || !bill ? (
        <ErrorBlock message={detail.error ?? t('bills.detail.loadError')} onRetry={detail.reload} />
      ) : (
        <div className="stack">
          <div className="form-section">
            <h3 className="form-section-title">{t('bills.detail.vendor')}</h3>
            <div className="detail-value strong">{bill.vendorName}</div>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">{t('bills.detail.vendorBillNumber')}</span>
                <span className="detail-value">{bill.vendorBillNumber || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t('bills.detail.billDate')}</span>
                <span className="detail-value">{formatDate(bill.date)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t('bills.detail.dueDate')}</span>
                <span className="detail-value">
                  {formatDate(bill.dueDate)}
                  {overdueDays(bill) > 0 ? <span className="text-danger"> · {t('bills.detail.daysOverdue', { days: overdueDays(bill) })}</span> : null}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">{t('bills.detail.status')}</span>
                <span className="detail-value">
                  <Badge tone={statusTone(bill.status)}>{statusLabel(bill.status, t)}</Badge>
                </span>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">{t('bills.detail.lineItems')}</h3>
            <table className="line-items-table">
              <thead>
                <tr>
                  <th>{t('bills.detail.col.description')}</th>
                  <th>{t('bills.detail.col.accountItem')}</th>
                  <th className="align-right">{t('bills.detail.col.qty')}</th>
                  <th className="align-right">{t('bills.detail.col.rate')}</th>
                  <th className="align-right">{t('bills.detail.col.tax')}</th>
                  <th className="align-right">{t('bills.detail.col.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {bill.lines.map((line, index) => (
                  <tr key={line.id ?? index}>
                    <td>{line.description}</td>
                    <td className="text-muted">{line.itemName || line.accountName || '—'}</td>
                    <td className="align-right num">{formatQuantity(line.quantity)}</td>
                    <td className="align-right num">{formatCurrency(line.rate)}</td>
                    <td className="align-right num">{formatPercent(line.taxRate)}</td>
                    <td className="align-right num">{formatCurrency(line.amount ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="totals-list">
            <div>
              <span>{t('bills.detail.subtotal')}</span>
              <span>{formatCurrency(bill.subtotal)}</span>
            </div>
            <div>
              <span>{t('bills.detail.discount')}</span>
              <span>-{formatCurrency(bill.discountAmount)}</span>
            </div>
            <div>
              <span>{t('bills.detail.taxTotal')}</span>
              <span>{formatCurrency(bill.taxTotal)}</span>
            </div>
            <div className="grand">
              <span>{t('bills.detail.total')}</span>
              <span>{formatCurrency(bill.total)}</span>
            </div>
            <div>
              <span>{t('bills.detail.amountPaid')}</span>
              <span>{formatCurrency(bill.amountPaid)}</span>
            </div>
            <div>
              <span className="strong">{t('bills.detail.balanceDue')}</span>
              <span className="strong">{formatCurrency(bill.balanceDue)}</span>
            </div>
          </div>

          {bill.notes ? (
            <div className="form-section">
              <h3 className="form-section-title">{t('bills.detail.notes')}</h3>
              <p className="text-muted">{bill.notes}</p>
            </div>
          ) : null}

          <div className="form-section">
            <h3 className="form-section-title">{t('bills.detail.paymentHistory')}</h3>
            <FormError message={remove.error} />
            {detail.data && detail.data.payments.length === 0 ? (
              <p className="text-subtle small">{t('bills.detail.noPayments')}</p>
            ) : (
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th>{t('bills.detail.col.paymentNumber')}</th>
                    <th>{t('bills.detail.col.date')}</th>
                    <th>{t('bills.detail.col.paidThrough')}</th>
                    <th>{t('bills.detail.col.mode')}</th>
                    <th>{t('bills.detail.col.reference')}</th>
                    <th className="align-right">{t('bills.detail.col.amount')}</th>
                    {canWrite ? <th className="align-right">{t('bills.detail.col.actions')}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {(detail.data?.payments ?? []).map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <span className="code-tag">{payment.paymentNumber}</span>
                      </td>
                      <td>{formatDate(payment.date)}</td>
                      <td>{payment.bankAccountName}</td>
                      <td>{(() => { const option = PAYMENT_MODES.find((o) => o.value === payment.mode); return option ? t(option.labelKey) : titleCase(payment.mode); })()}</td>
                      <td className="text-muted">{payment.reference || '—'}</td>
                      <td className="align-right num">{formatCurrency(payment.amount)}</td>
                      {canWrite ? (
                        <td className="align-right">
                          <button
                            type="button"
                            className="action-btn is-danger"
                            aria-label={t('bills.detail.deletePaymentAria', { number: payment.paymentNumber })}
                            onClick={() => setPendingPayment(payment)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <ConfirmDialog
            open={pendingPayment !== null}
            title={t('bills.detail.confirmTitle')}
            confirmLabel={t('bills.detail.confirmButton')}
            busy={remove.submitting}
            message={
              <>
                <p>
                  {t('bills.detail.confirmBody', {
                    number: pendingPayment?.paymentNumber ?? '',
                    amount: formatCurrency(pendingPayment?.amount ?? 0),
                  })}
                </p>
                <FormError message={remove.error} />
              </>
            }
            onCancel={() => {
              setPendingPayment(null);
              remove.reset();
            }}
            onConfirm={() => {
              if (pendingPayment) void deletePayment(pendingPayment);
            }}
          />
        </div>
      )}
    </Modal>
  );
}
