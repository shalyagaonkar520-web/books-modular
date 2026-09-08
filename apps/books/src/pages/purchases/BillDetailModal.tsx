import { useState } from 'react';
import { Trash2, Wallet } from 'lucide-react';

import { billsApi, vendorPaymentsApi } from '@/api/endpoints';
import type { VendorPayment } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
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
      toast.success(`Payment ${payment.paymentNumber} deleted`);
      setPendingPayment(null);
      detail.reload();
      onChanged();
    }
  };

  return (
    <Modal
      open
      title={bill ? `Bill ${bill.billNumber}` : 'Bill'}
      subtitle={bill ? `${bill.vendorName} · ${statusLabel(bill.status)}` : undefined}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canWrite && bill && bill.balanceDue > 0 && ['open', 'partially_paid', 'overdue'].includes(bill.status) ? (
            <Button
              variant="primary"
              icon={<Wallet size={15} />}
              onClick={() => onRecordPayment({ id: bill.id, billNumber: bill.billNumber, vendorId: bill.vendorId, vendorName: bill.vendorName, balanceDue: bill.balanceDue })}
            >
              Record payment
            </Button>
          ) : null}
        </>
      }
    >
      {detail.loading ? (
        <LoadingBlock label="Loading bill…" />
      ) : detail.error || !bill ? (
        <ErrorBlock message={detail.error ?? 'This bill could not be loaded.'} onRetry={detail.reload} />
      ) : (
        <div className="stack">
          <div className="form-section">
            <h3 className="form-section-title">Vendor</h3>
            <div className="detail-value strong">{bill.vendorName}</div>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Vendor bill number</span>
                <span className="detail-value">{bill.vendorBillNumber || '—'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Bill date</span>
                <span className="detail-value">{formatDate(bill.date)}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Due date</span>
                <span className="detail-value">
                  {formatDate(bill.dueDate)}
                  {overdueDays(bill) > 0 ? <span className="text-danger"> · {overdueDays(bill)} days overdue</span> : null}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  <Badge tone={statusTone(bill.status)}>{statusLabel(bill.status)}</Badge>
                </span>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">Line items</h3>
            <table className="line-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Account / item</th>
                  <th className="align-right">Qty</th>
                  <th className="align-right">Rate</th>
                  <th className="align-right">Tax</th>
                  <th className="align-right">Amount</th>
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
              <span>Subtotal</span>
              <span>{formatCurrency(bill.subtotal)}</span>
            </div>
            <div>
              <span>Discount</span>
              <span>-{formatCurrency(bill.discountAmount)}</span>
            </div>
            <div>
              <span>Tax total</span>
              <span>{formatCurrency(bill.taxTotal)}</span>
            </div>
            <div className="grand">
              <span>Total</span>
              <span>{formatCurrency(bill.total)}</span>
            </div>
            <div>
              <span>Amount paid</span>
              <span>{formatCurrency(bill.amountPaid)}</span>
            </div>
            <div>
              <span className="strong">Balance due</span>
              <span className="strong">{formatCurrency(bill.balanceDue)}</span>
            </div>
          </div>

          {bill.notes ? (
            <div className="form-section">
              <h3 className="form-section-title">Notes</h3>
              <p className="text-muted">{bill.notes}</p>
            </div>
          ) : null}

          <div className="form-section">
            <h3 className="form-section-title">Payment history</h3>
            <FormError message={remove.error} />
            {detail.data && detail.data.payments.length === 0 ? (
              <p className="text-subtle small">No payments recorded against this bill yet.</p>
            ) : (
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th>Payment #</th>
                    <th>Date</th>
                    <th>Paid through</th>
                    <th>Mode</th>
                    <th>Reference</th>
                    <th className="align-right">Amount</th>
                    {canWrite ? <th className="align-right">Actions</th> : null}
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
                      <td>{PAYMENT_MODES.find((option) => option.value === payment.mode)?.label ?? titleCase(payment.mode)}</td>
                      <td className="text-muted">{payment.reference || '—'}</td>
                      <td className="align-right num">{formatCurrency(payment.amount)}</td>
                      {canWrite ? (
                        <td className="align-right">
                          <button
                            type="button"
                            className="action-btn is-danger"
                            aria-label={`Delete payment ${payment.paymentNumber}`}
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
            title="Delete this payment?"
            confirmLabel="Delete payment"
            busy={remove.submitting}
            message={
              <>
                <p>
                  Payment {pendingPayment?.paymentNumber} of {formatCurrency(pendingPayment?.amount ?? 0)} will be deleted, the bank transaction removed and
                  the bill balance restored.
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
