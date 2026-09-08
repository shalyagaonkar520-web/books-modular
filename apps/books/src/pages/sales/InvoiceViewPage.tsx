/** Read-only invoice detail with payment history and a print-friendly layout. */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, IndianRupee, Pencil, Printer, Send, Trash2 } from 'lucide-react';

import { customerPaymentsApi, invoicesApi } from '@/api/endpoints';
import type { CustomerPayment } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatPercent, formatQuantity } from '@/utils/format';
import { PAYMENT_MODES, statusLabel, statusTone } from '@/utils/status';

import { RecordPaymentModal, type PaymentInvoiceContext } from './RecordPaymentModal';

type Pending = { kind: 'send' | 'void' } | { kind: 'deletePayment'; payment: CustomerPayment };

const modeLabel = (mode: string): string => PAYMENT_MODES.find((option) => option.value === mode)?.label ?? mode;

export function InvoiceViewPage() {
  const { invoiceId = '' } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { organization } = useAuth();
  const { submitting, error: actionError, run, reset } = useSubmit();

  const [pending, setPending] = useState<Pending | null>(null);
  const [payingOpen, setPayingOpen] = useState(false);

  const invoice = useAsync(() => invoicesApi.get(invoiceId), [invoiceId]);
  const payments = useAsync(() => customerPaymentsApi.list({ invoice_id: invoiceId, page_size: 200 }), [invoiceId]);

  const data = invoice.data;
  const paymentContext = useMemo<PaymentInvoiceContext | undefined>(
    () => (data ? { id: data.id, invoiceNumber: data.invoiceNumber, customerId: data.customerId, balanceDue: data.balanceDue } : undefined),
    [data],
  );

  const refresh = () => {
    invoice.reload();
    payments.reload();
  };

  const runPending = async () => {
    if (!pending || !data) return;
    if (pending.kind === 'deletePayment') {
      const result = await run(() => customerPaymentsApi.remove(pending.payment.id));
      if (result) {
        toast.success(result.message);
        setPending(null);
        refresh();
      }
      return;
    }
    const result = await run(() => invoicesApi.setStatus(data.id, pending.kind === 'send' ? 'sent' : 'void'));
    if (result) {
      toast.success(pending.kind === 'send' ? `Invoice ${data.invoiceNumber} marked as sent` : `Invoice ${data.invoiceNumber} voided`);
      setPending(null);
      refresh();
    }
  };

  const paymentColumns: Array<Column<CustomerPayment>> = [
    { key: 'paymentNumber', header: 'Payment #', render: (row) => <span className="mono">{row.paymentNumber}</span> },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    {
      key: 'mode',
      header: 'Mode',
      render: (row) => (
        <span className="cell-stack">
          <span>{modeLabel(row.mode)}</span>
          <small>{row.bankAccountName}</small>
        </span>
      ),
    },
    { key: 'reference', header: 'Reference', render: (row) => row.reference ?? '—' },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.amount)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <IfCanWrite>
          <span className="row-actions">
            <button
              type="button"
              className="action-btn is-danger"
              aria-label={`Delete payment ${row.paymentNumber}`}
              onClick={() => {
                reset();
                setPending({ kind: 'deletePayment', payment: row });
              }}
            >
              <Trash2 size={15} />
            </button>
          </span>
        </IfCanWrite>
      ),
    },
  ];

  if (invoice.loading) return <LoadingBlock label="Loading invoice…" />;
  if (invoice.error || !data) {
    return (
      <>
        <PageHeader title="Invoice" actions={<Button icon={<ArrowLeft size={15} />} onClick={() => navigate('/invoices')}>Back to invoices</Button>} />
        <ErrorBlock message={invoice.error ?? 'This invoice could not be loaded.'} onRetry={invoice.reload} />
      </>
    );
  }

  const canEdit = data.status === 'draft' || ((data.status === 'sent' || data.status === 'overdue') && data.amountPaid === 0);
  const canPay = ['sent', 'partially_paid', 'overdue'].includes(data.status) && data.balanceDue > 0;
  const paymentRows = payments.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={`Invoice ${data.invoiceNumber}`}
        subtitle={`${data.customerName} · ${formatCurrency(data.total)}`}
        breadcrumb={['Sales', 'Invoices']}
        actions={
          <>
            <Button icon={<ArrowLeft size={15} />} onClick={() => navigate('/invoices')}>
              Back to invoices
            </Button>
            <Button icon={<Printer size={15} />} onClick={() => window.print()}>
              Print
            </Button>
            <IfCanWrite>
              <>
                {canEdit ? (
                  <Button icon={<Pencil size={15} />} onClick={() => navigate(`/invoices/${data.id}/edit`)}>
                    Edit
                  </Button>
                ) : null}
                {data.status === 'draft' ? (
                  <Button
                    icon={<Send size={15} />}
                    onClick={() => {
                      reset();
                      setPending({ kind: 'send' });
                    }}
                  >
                    Mark as sent
                  </Button>
                ) : null}
                {canPay ? (
                  <Button variant="primary" icon={<IndianRupee size={15} />} onClick={() => setPayingOpen(true)}>
                    Record payment
                  </Button>
                ) : null}
                {data.status !== 'void' ? (
                  <Button
                    variant="danger"
                    icon={<Ban size={15} />}
                    onClick={() => {
                      reset();
                      setPending({ kind: 'void' });
                    }}
                  >
                    Void
                  </Button>
                ) : null}
              </>
            </IfCanWrite>
          </>
        }
      />

      <div className="stack printable">
        <Card>
          <div className="grid-2">
            <div className="stack">
              <div>
                <h2 className="card-title">{organization?.name ?? '—'}</h2>
                {organization?.address ? <p className="text-muted small">{organization.address}</p> : null}
                <p className="text-muted small">
                  {[organization?.city, organization?.state, organization?.postalCode].filter(Boolean).join(', ')}
                </p>
                {organization?.gstin ? <p className="text-muted small">GSTIN {organization.gstin}</p> : null}
              </div>
              <div>
                <span className="detail-label">Billed to</span>
                <p className="strong">{data.customerName}</p>
                {data.customerBillingAddress ? <p className="text-muted small">{data.customerBillingAddress}</p> : null}
                {data.customerGstin ? <p className="text-muted small">GSTIN {data.customerGstin}</p> : null}
                {data.customerEmail ? <p className="text-muted small">{data.customerEmail}</p> : null}
              </div>
            </div>
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>Invoice number</dt>
                <dd className="strong">{data.invoiceNumber}</dd>
              </div>
              <div className="detail-item">
                <dt>Status</dt>
                <dd>
                  <Badge tone={statusTone(data.status)}>{statusLabel(data.status)}</Badge>
                </dd>
              </div>
              <div className="detail-item">
                <dt>Invoice date</dt>
                <dd>{formatDate(data.date)}</dd>
              </div>
              <div className="detail-item">
                <dt>Due date</dt>
                <dd>{formatDate(data.dueDate)}</dd>
              </div>
              <div className="detail-item">
                <dt>Reference</dt>
                <dd>{data.reference ?? '—'}</dd>
              </div>
              <div className="detail-item">
                <dt>Balance due</dt>
                <dd className="num strong">{formatCurrency(data.balanceDue)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card title="Line items">
          <div className="table-wrap">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="align-right">
                    Qty
                  </th>
                  <th scope="col" className="align-right">
                    Rate
                  </th>
                  <th scope="col" className="align-right">
                    Tax
                  </th>
                  <th scope="col" className="align-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line, index) => (
                  <tr key={line.id ?? index}>
                    <td className="text-subtle">{index + 1}</td>
                    <td>
                      <span className="cell-stack">
                        <span>{line.description}</span>
                        {line.itemName ? <small>{line.itemName}</small> : null}
                      </span>
                    </td>
                    <td className="align-right num">{formatQuantity(line.quantity)}</td>
                    <td className="align-right num">{formatCurrency(line.rate)}</td>
                    <td className="align-right num">
                      {formatPercent(line.taxRate)}
                      {typeof line.taxAmount === 'number' ? <small className="text-subtle"> ({formatCurrency(line.taxAmount)})</small> : null}
                    </td>
                    <td className="align-right num strong">{formatCurrency(line.amount ?? line.quantity * line.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-section">
            <div className="totals-list">
              <div>
                <span>Subtotal</span>
                <span>{formatCurrency(data.subtotal)}</span>
              </div>
              <div>
                <span>Discount</span>
                <span>{data.discountAmount > 0 ? `- ${formatCurrency(data.discountAmount)}` : formatCurrency(0)}</span>
              </div>
              <div>
                <span>Tax total</span>
                <span>{formatCurrency(data.taxTotal)}</span>
              </div>
              <div className="grand">
                <span>Total</span>
                <span>{formatCurrency(data.total)}</span>
              </div>
              <div>
                <span>Amount paid</span>
                <span className="text-success">{formatCurrency(data.amountPaid)}</span>
              </div>
              <div className="grand">
                <span>Balance due</span>
                <span>{formatCurrency(data.balanceDue)}</span>
              </div>
            </div>
          </div>
        </Card>

        {data.notes || data.terms ? (
          <Card title="Notes and terms">
            <dl className="detail-grid">
              {data.notes ? (
                <div className="detail-item">
                  <dt>Notes</dt>
                  <dd>{data.notes}</dd>
                </div>
              ) : null}
              {data.terms ? (
                <div className="detail-item">
                  <dt>Terms</dt>
                  <dd>{data.terms}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
        ) : null}
      </div>

      <div className="no-print">
        <Card title="Payment history" subtitle={`${formatCurrency(data.amountPaid)} received against this invoice`}>
          {payments.loading ? (
            <SkeletonRows rows={3} columns={6} />
          ) : payments.error ? (
            <ErrorBlock message={payments.error} onRetry={payments.reload} />
          ) : !paymentRows.length ? (
            <EmptyState title="No payments recorded" description="Payments you record against this invoice will appear here." />
          ) : (
            <DataTable columns={paymentColumns} rows={paymentRows} rowKey={(row) => row.id} caption="Payments received for this invoice" />
          )}
        </Card>
      </div>

      <RecordPaymentModal open={payingOpen} invoice={paymentContext} onClose={() => setPayingOpen(false)} onSaved={refresh} />

      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === 'send' ? 'Mark invoice as sent' : pending?.kind === 'void' ? 'Void invoice' : 'Delete payment'}
        confirmLabel={pending?.kind === 'send' ? 'Mark as sent' : pending?.kind === 'void' ? 'Void invoice' : 'Delete payment'}
        tone={pending?.kind === 'send' ? 'primary' : 'danger'}
        busy={submitting}
        onCancel={() => setPending(null)}
        onConfirm={runPending}
        message={
          <>
            <FormError message={actionError} />
            {pending?.kind === 'send' ? (
              <p>Invoice {data.invoiceNumber} will be posted to your books and can no longer be deleted.</p>
            ) : pending?.kind === 'void' ? (
              <p>Voiding invoice {data.invoiceNumber} reverses its ledger entries. Recorded payments must be deleted first.</p>
            ) : pending?.kind === 'deletePayment' ? (
              <p>
                Payment {pending.payment.paymentNumber} of {formatCurrency(pending.payment.amount)} will be deleted and its ledger entries reversed.
              </p>
            ) : null}
          </>
        }
      />
    </>
  );
}
