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
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatPercent, formatQuantity } from '@/utils/format';
import { paymentModeLabel, type Translate, statusLabel, statusTone } from '@/utils/status';

import { PayOnlineModal } from './PayOnlineModal';
import { RecordPaymentModal, type PaymentInvoiceContext } from './RecordPaymentModal';

type Pending = { kind: 'send' | 'void' } | { kind: 'deletePayment'; payment: CustomerPayment };

const modeLabel = (mode: string, t: Translate): string => paymentModeLabel(mode, t);

export function InvoiceViewPage() {
  const { t } = useAppContent();
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
      toast.success(
        pending.kind === 'send'
          ? t('invoices.toast.markedSent', { number: data.invoiceNumber })
          : t('invoices.toast.voided', { number: data.invoiceNumber }),
      );
      setPending(null);
      refresh();
    }
  };

  const paymentColumns: Array<Column<CustomerPayment>> = [
    { key: 'paymentNumber', header: t('invoices.view.payments.col.number'), render: (row) => <span className="mono">{row.paymentNumber}</span> },
    { key: 'date', header: t('invoices.view.payments.col.date'), render: (row) => formatDate(row.date) },
    {
      key: 'mode',
      header: t('invoices.view.payments.col.mode'),
      render: (row) => (
        <span className="cell-stack">
          <span>{modeLabel(row.mode, t)}</span>
          <small>{row.bankAccountName}</small>
        </span>
      ),
    },
    { key: 'reference', header: t('invoices.view.payments.col.reference'), render: (row) => row.reference ?? '—' },
    { key: 'amount', header: t('invoices.view.payments.col.amount'), align: 'right', render: (row) => <span className="num strong">{formatCurrency(row.amount)}</span> },
    {
      key: 'actions',
      header: t('invoices.view.payments.col.actions'),
      align: 'right',
      render: (row) => (
        <IfCanWrite>
          <span className="row-actions">
            <button
              type="button"
              className="action-btn is-danger"
              aria-label={t('invoices.view.payments.deleteAria', { number: row.paymentNumber })}
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

  if (invoice.loading) return <LoadingBlock label={t('invoices.view.loading')} />;
  if (invoice.error || !data) {
    return (
      <>
        <PageHeader title={t('invoices.view.errorTitle')} actions={<Button icon={<ArrowLeft size={15} />} onClick={() => navigate('/invoices')}>{t('invoices.view.back')}</Button>} />
        <ErrorBlock message={invoice.error ?? t('invoices.view.loadError')} onRetry={invoice.reload} />
      </>
    );
  }

  const canEdit = data.status === 'draft' || ((data.status === 'sent' || data.status === 'overdue') && data.amountPaid === 0);
  const canPay = data.status !== 'void' && data.balanceDue > 0;
  const paymentRows = payments.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t('invoices.view.title', { number: data.invoiceNumber })}
        subtitle={t('invoices.view.subtitle', { customer: data.customerName, total: formatCurrency(data.total) })}
        breadcrumb={[t('invoices.view.breadcrumb.sales'), t('invoices.view.breadcrumb.invoices')]}
        actions={
          <>
            <Button icon={<ArrowLeft size={15} />} onClick={() => navigate('/invoices')}>
              {t('invoices.view.back')}
            </Button>
            <Button icon={<Printer size={15} />} onClick={() => window.print()}>
              {t('invoices.view.print')}
            </Button>
            <Button
              variant="secondary"
              icon={<FileDown size={15} style={{ color: '#dc2626' }} />}
              onClick={() => invoicesApi.downloadPdf(data.id, data.invoiceNumber)}
            >
              {t('invoices.view.downloadPdf')}
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={15} style={{ color: '#15803d' }} />}
              onClick={() => invoicesApi.downloadExcel(data.id, data.invoiceNumber)}
            >
              {t('invoices.view.downloadExcel')}
            </Button>
            <Button
              variant="secondary"
              icon={<Mail size={15} style={{ color: '#ea4335' }} />}
              onClick={() => setMailModalOpen(true)}
            >
              {t('invoices.view.sendGmail')}
            </Button>
            <IfCanWrite>
              <>
                {canEdit ? (
                  <Button icon={<Pencil size={15} />} onClick={() => navigate(`/invoices/${data.id}/edit`)}>
                    {t('invoices.view.edit')}
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
                    {t('invoices.view.markSent')}
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
                      {t('invoices.view.payOnline')}
                    </Button>
                    <Button variant="secondary" icon={<IndianRupee size={15} />} onClick={() => setPayingOpen(true)}>
                      {t('invoices.view.recordPayment')}
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
                    {t('invoices.view.void')}
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
                {organization?.gstin ? <p className="text-muted small">{t('invoices.view.gstin', { gstin: organization.gstin })}</p> : null}
              </div>
              <div>
                <span className="detail-label">{t('invoices.view.billedTo')}</span>
                <p className="strong">{data.customerName}</p>
                {data.customerBillingAddress ? <p className="text-muted small">{data.customerBillingAddress}</p> : null}
                {data.customerGstin ? <p className="text-muted small">{t('invoices.view.gstin', { gstin: data.customerGstin })}</p> : null}
                {data.customerEmail ? <p className="text-muted small">{data.customerEmail}</p> : null}
              </div>
            </div>
            <dl className="detail-grid">
              <div className="detail-item">
                <dt>{t('invoices.view.invoiceNumber')}</dt>
                <dd className="strong">{data.invoiceNumber}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('invoices.view.status')}</dt>
                <dd>
                  <Badge tone={statusTone(data.status)}>{statusLabel(data.status, t)}</Badge>
                </dd>
              </div>
              <div className="detail-item">
                <dt>{t('invoices.view.invoiceDate')}</dt>
                <dd>{formatDate(data.date)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('invoices.view.dueDate')}</dt>
                <dd>{formatDate(data.dueDate)}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('invoices.view.reference')}</dt>
                <dd>{data.reference ?? '—'}</dd>
              </div>
              <div className="detail-item">
                <dt>{t('invoices.view.balanceDue')}</dt>
                <dd className="num strong">{formatCurrency(data.balanceDue)}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card title={t('invoices.view.section.lines')}>
          <div className="table-wrap">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{t('invoices.view.lines.col.description')}</th>
                  <th scope="col" className="align-right">
                    {t('invoices.view.lines.col.qty')}
                  </th>
                  <th scope="col" className="align-right">
                    {t('invoices.view.lines.col.rate')}
                  </th>
                  <th scope="col" className="align-right">
                    {t('invoices.view.lines.col.tax')}
                  </th>
                  <th scope="col" className="align-right">
                    {t('invoices.view.lines.col.amount')}
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
                <span>{t('invoices.view.totals.subtotal')}</span>
                <span>{formatCurrency(data.subtotal)}</span>
              </div>
              <div>
                <span>{t('invoices.view.totals.discount')}</span>
                <span>{data.discountAmount > 0 ? `- ${formatCurrency(data.discountAmount)}` : formatCurrency(0)}</span>
              </div>
              <div>
                <span>{t('invoices.view.totals.tax')}</span>
                <span>{formatCurrency(data.taxTotal)}</span>
              </div>
              <div className="grand">
                <span>{t('invoices.view.totals.total')}</span>
                <span>{formatCurrency(data.total)}</span>
              </div>
              <div>
                <span>{t('invoices.view.totals.paid')}</span>
                <span className="text-success">{formatCurrency(data.amountPaid)}</span>
              </div>
              <div className="grand">
                <span>{t('invoices.view.totals.balanceDue')}</span>
                <span>{formatCurrency(data.balanceDue)}</span>
              </div>
            </div>
          </div>
        </Card>

        {data.notes || data.terms ? (
          <Card title={t('invoices.view.section.notes')}>
            <dl className="detail-grid">
              {data.notes ? (
                <div className="detail-item">
                  <dt>{t('invoices.view.notes')}</dt>
                  <dd>{data.notes}</dd>
                </div>
              ) : null}
              {data.terms ? (
                <div className="detail-item">
                  <dt>{t('invoices.view.terms')}</dt>
                  <dd>{data.terms}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
        ) : null}
      </div>

      <div className="no-print">
        <Card title={t('invoices.view.section.payments')} subtitle={t('invoices.view.paymentsSubtitle', { amount: formatCurrency(data.amountPaid) })}>
          {payments.loading ? (
            <SkeletonRows rows={3} columns={6} />
          ) : payments.error ? (
            <ErrorBlock message={payments.error} onRetry={payments.reload} />
          ) : !paymentRows.length ? (
            <EmptyState title={t('invoices.view.payments.emptyTitle')} description={t('invoices.view.payments.emptyBody')} />
          ) : (
            <DataTable columns={paymentColumns} rows={paymentRows} rowKey={(row) => row.id} caption={t('invoices.view.payments.caption')} />
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
        title={pending?.kind === 'send' ? t('invoices.confirm.sendTitle') : pending?.kind === 'void' ? t('invoices.confirm.voidTitle') : t('invoices.view.deletePayment.title')}
        confirmLabel={pending?.kind === 'send' ? t('invoices.confirm.sendConfirm') : pending?.kind === 'void' ? t('invoices.confirm.voidConfirm') : t('invoices.view.deletePayment.confirm')}
        tone={pending?.kind === 'send' ? 'primary' : 'danger'}
        busy={submitting}
        onCancel={() => setPending(null)}
        onConfirm={runPending}
        message={
          <>
            <FormError message={actionError} />
            {pending?.kind === 'send' ? (
              <p>{t('invoices.confirm.sendBody', { number: data.invoiceNumber })}</p>
            ) : pending?.kind === 'void' ? (
              <p>{t('invoices.confirm.voidBody', { number: data.invoiceNumber })}</p>
            ) : pending?.kind === 'deletePayment' ? (
              <p>
                {t('invoices.view.deletePayment.body', { number: pending.payment.paymentNumber, amount: formatCurrency(pending.payment.amount) })}
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
  const { t } = useAppContent();
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
          ? t('invoices.gmail.emailedOverdue', { number: invoice.invoiceNumber, email: email.trim() })
          : t('invoices.gmail.emailedTax', { number: invoice.invoiceNumber, email: email.trim() })
      );
    }
  }


  return (
    <Modal
      open
      size="md"
      title={t('invoices.gmail.title', { number: invoice.invoiceNumber })}
      subtitle={t('invoices.gmail.subtitle', { customer: invoice.customerName, total: formatCurrency(invoice.total) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('invoices.gmail.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!email.trim()}
            icon={<Mail size={15} />}
            style={sendAsOverdue ? { backgroundColor: '#dc2626', borderColor: '#dc2626', color: '#ffffff' } : undefined}
            onClick={handleSend}
          >
            {sendAsOverdue ? t('invoices.gmail.sendOverdue') : t('invoices.gmail.sendTax')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="stack" style={{ gap: '14px' }}>
        <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>
            {t('invoices.gmail.mode')}
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="detailEmailMode"
                checked={!sendAsOverdue}
                onChange={() => setSendAsOverdue(false)}
              />
              <span>{t('invoices.gmail.modeStandard')}</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', cursor: 'pointer', color: '#b91c1c', fontWeight: 600 }}>
              <input
                type="radio"
                name="detailEmailMode"
                checked={sendAsOverdue}
                onChange={() => setSendAsOverdue(true)}
              />
              <span>{t('invoices.gmail.modeOverdue')}</span>
            </label>
          </div>
        </div>

        <div className="form-grid">
          <TextField
            label={t('invoices.gmail.customer')}
            value={invoice.customerName}
            disabled
          />
          <TextField
            label={t('invoices.gmail.email')}
            type="email"
            required
            placeholder={t('invoices.gmail.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label={t('invoices.gmail.total')}
            value={formatCurrency(invoice.total)}
            disabled
          />
          <TextField
            label={sendAsOverdue ? t('invoices.gmail.balanceOverdue') : t('invoices.gmail.dueDate')}
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
          <span style={{ fontWeight: 500 }}>{t('invoices.gmail.attachPdf')}</span>
        </label>

        <TextAreaField
          label={t('invoices.gmail.notes')}
          value={customNotes}
          placeholder={t('invoices.gmail.notesPlaceholder')}
          rows={2}
          onChange={(e) => setCustomNotes(e.target.value)}
        />
      </div>
      <p className="small text-muted" style={{ marginTop: '12px' }}>
        {t('invoices.gmail.footer')}
      </p>
    </Modal>
  );
}
