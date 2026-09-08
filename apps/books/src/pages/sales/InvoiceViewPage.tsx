import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CreditCard, FileDown, FileSpreadsheet, IndianRupee, Mail, Pencil, Printer, Send, Trash2 } from 'lucide-react';

import { customerPaymentsApi, invoicesApi } from '@/api/endpoints';
import type { CustomerPayment, Invoice } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, LoadingBlock, SkeletonRows } from '@/components/ui/Feedback';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatPercent, formatQuantity } from '@/utils/format';
import { PAYMENT_MODES, statusLabel, statusTone } from '@/utils/status';

import { RecordPaymentModal, type PaymentInvoiceContext } from './RecordPaymentModal';
import { PayOnlineModal } from './PayOnlineModal';

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
  const [payOnlineOpen, setPayOnlineOpen] = useState(false);
  const [mailModalOpen, setMailModalOpen] = useState(false);

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
  const canPay = data.status !== 'void' && data.balanceDue > 0;
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
            <Button
              variant="secondary"
              icon={<FileDown size={15} style={{ color: '#dc2626' }} />}
              onClick={() => invoicesApi.downloadPdf(data.id, data.invoiceNumber)}
            >
              Download PDF
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={15} style={{ color: '#15803d' }} />}
              onClick={() => invoicesApi.downloadExcel(data.id, data.invoiceNumber)}
            >
              Download Excel
            </Button>
            <Button
              variant="secondary"
              icon={<Mail size={15} style={{ color: '#ea4335' }} />}
              onClick={() => setMailModalOpen(true)}
            >
              Send via Gmail
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
                  <>
                    <Button
                      variant="primary"
                      icon={<CreditCard size={15} />}
                      onClick={() => setPayOnlineOpen(true)}
                      style={{ backgroundColor: '#16a34a', borderColor: '#16a34a', color: '#ffffff' }}
                    >
                      Pay Online
                    </Button>
                    <Button variant="secondary" icon={<IndianRupee size={15} />} onClick={() => setPayingOpen(true)}>
                      Record payment
                    </Button>
                  </>
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

      {data ? (
        <PayOnlineModal
          open={payOnlineOpen}
          onClose={() => setPayOnlineOpen(false)}
          invoice={data}
          onPaymentSuccess={refresh}
        />
      ) : null}

      {mailModalOpen ? (
        <SendInvoiceDetailGmailModal
          invoice={data}
          onClose={() => setMailModalOpen(false)}
          onSent={(message) => {
            toast.success(message);
            setMailModalOpen(false);
            refresh();
          }}
        />
      ) : null}

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

interface SendInvoiceDetailGmailModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSent: (message: string) => void;
}

function SendInvoiceDetailGmailModal({ invoice, onClose, onSent }: SendInvoiceDetailGmailModalProps) {
  const [email, setEmail] = useState(invoice.customerEmail ?? '');
  const [sendAsOverdue, setSendAsOverdue] = useState(invoice.status === 'overdue');
  const [attachPdf, setAttachPdf] = useState(true);
  const [customNotes, setCustomNotes] = useState('');
  const { submitting, error, run } = useSubmit();

  async function handleSend() {
    if (!email.trim()) return;
    const result = await run(() =>
      invoicesApi.sendGmail(invoice.id, {
        to_email: email.trim(),
        send_as_overdue: sendAsOverdue,
        attach_pdf: attachPdf,
        custom_notes: customNotes.trim() || undefined,
      })
    );
    if (result) {
      onSent(
        sendAsOverdue
          ? `Overdue Payment Reminder for ${invoice.invoiceNumber} emailed to ${email.trim()} via Gmail SMTP`
          : `Tax Invoice ${invoice.invoiceNumber} emailed to ${email.trim()} via Gmail SMTP`
      );
    }
  }

  const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(
    sendAsOverdue
      ? `Payment Reminder: Invoice ${invoice.invoiceNumber} is Overdue - Rooman Technologies`
      : `Tax Invoice ${invoice.invoiceNumber} from Rooman Technologies`
  )}&body=${encodeURIComponent(
    `Dear ${invoice.customerName},\n\n${
      sendAsOverdue
        ? `This is an urgent reminder regarding overdue invoice ${invoice.invoiceNumber}. Outstanding balance: ${formatCurrency(invoice.balanceDue)}.`
        : `Please find details of Tax Invoice ${invoice.invoiceNumber}.\nAmount: ${formatCurrency(invoice.total)}\nDue Date: ${formatDate(invoice.dueDate)}.`
    }\n\nWarm regards,\nRooman Technologies Accounts Desk`
  )}`;

  return (
    <Modal
      open
      size="md"
      title={`Gmail Send Options: ${invoice.invoiceNumber}`}
      subtitle={`Customer: ${invoice.customerName} · Total: ${formatCurrency(invoice.total)}`}
      onClose={onClose}
      footer={
        <>
          <a
            href={gmailWebUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-md"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Send size={14} />
            <span>Open in Gmail Web</span>
          </a>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!email.trim()}
            icon={<Mail size={15} />}
            style={sendAsOverdue ? { backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' } : undefined}
            onClick={handleSend}
          >
            {sendAsOverdue ? 'Send Overdue Reminder' : 'Send Tax Invoice'}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="stack" style={{ gap: '14px' }}>
        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>
            Email Mode:
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="detailEmailMode"
                checked={!sendAsOverdue}
                onChange={() => setSendAsOverdue(false)}
              />
              <span>Standard Tax Invoice Dispatch</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer', color: '#b91c1c', fontWeight: 600 }}>
              <input
                type="radio"
                name="detailEmailMode"
                checked={sendAsOverdue}
                onChange={() => setSendAsOverdue(true)}
              />
              <span>Overdue Payment Reminder</span>
            </label>
          </div>
        </div>

        <div className="form-grid">
          <TextField
            label="Customer"
            value={invoice.customerName}
            disabled
          />
          <TextField
            label="Recipient Email (Gmail)"
            type="email"
            required
            placeholder="e.g. customer@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Invoice Total"
            value={formatCurrency(invoice.total)}
            disabled
          />
          <TextField
            label={sendAsOverdue ? 'Balance Due (Overdue)' : 'Due Date'}
            value={sendAsOverdue ? formatCurrency(invoice.balanceDue) : formatDate(invoice.dueDate)}
            disabled
          />
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', cursor: 'pointer', padding: '4px 0' }}>
          <input
            type="checkbox"
            checked={attachPdf}
            onChange={(e) => setAttachPdf(e.target.checked)}
          />
          <span style={{ fontWeight: 500 }}>Attach generated official GST Tax Invoice PDF to email</span>
        </label>

        <TextAreaField
          label="Custom Note / Remittance Instructions (Optional)"
          value={customNotes}
          placeholder="e.g. Kindly share transaction UTR once processed..."
          rows={2}
          onChange={(e) => setCustomNotes(e.target.value)}
        />
      </div>
      <p className="small text-muted" style={{ marginTop: '12px' }}>
        Dispatched automatically via authenticated Gmail SMTP server (shalya@rooman.com).
      </p>
    </Modal>
  );
}
