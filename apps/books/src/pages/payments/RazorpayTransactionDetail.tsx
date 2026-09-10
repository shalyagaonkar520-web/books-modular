import { useCallback, useState } from 'react';
import { AlertTriangle, Check, Link2 } from 'lucide-react';

import {
  razorpaySyncApi,
  type CategoryOption,
  type InvoiceMatchResult,
  type TransactionDetail,
} from '@/api/razorpay';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';

import { categoryTone, reconciliationTone, statusToneFor } from './razorpayStatus';

interface Props {
  paymentId: string;
  categories: CategoryOption[];
  onClose: () => void;
  onChanged: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{children ?? '—'}</span>
    </div>
  );
}

export function RazorpayTransactionDetail({ paymentId, categories, onClose, onChanged }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload, setData } = useAsync<TransactionDetail>(
    () => razorpaySyncApi.getTransaction(paymentId),
    [paymentId],
  );
  const matches = useAsync<InvoiceMatchResult>(
    () => razorpaySyncApi.getInvoiceMatches(paymentId),
    [paymentId],
  );

  const acceptCategory = useCallback(async () => {
    if (!data) return;
    setBusy(true);
    try {
      const updated = await razorpaySyncApi.setCategory(data.id, data.category, true);
      setData({ ...data, ...updated });
      toast.success(`Category confirmed as ${updated.category_label}.`);
      onChanged();
    } catch {
      toast.error('Could not update the category.');
    } finally {
      setBusy(false);
    }
  }, [data, onChanged, setData, toast]);

  const changeCategory = useCallback(
    async (category: string) => {
      if (!data) return;
      setBusy(true);
      try {
        const updated = await razorpaySyncApi.setCategory(data.id, category);
        setData({ ...data, ...updated });
        toast.success(`Category set to ${updated.category_label}.`);
        onChanged();
      } catch {
        toast.error('Could not update the category.');
      } finally {
        setBusy(false);
      }
    },
    [data, onChanged, setData, toast],
  );

  const confirmMatch = useCallback(
    async (invoiceId: string, invoiceNumber: string) => {
      if (!data) return;
      setBusy(true);
      try {
        const result = await razorpaySyncApi.matchInvoice(data.id, invoiceId);
        toast.success(`${result.message}. Invoice is now ${result.invoice_status}.`);
        const refreshed = await razorpaySyncApi.getTransaction(data.id);
        setData(refreshed);
        matches.reload();
        onChanged();
      } catch (err) {
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : `Could not book this payment against ${invoiceNumber}.`,
        );
      } finally {
        setBusy(false);
      }
    },
    [data, matches, onChanged, setData, toast],
  );

  const body = () => {
    if (loading) return <LoadingBlock label="Loading transaction…" />;
    if (error || !data) return <ErrorBlock message={error ?? 'Could not load this transaction.'} onRetry={reload} />;

    const confidencePercent =
      data.category_confidence != null ? `${Math.round(data.category_confidence * 100)}%` : '—';

    const refundColumns: Array<Column<TransactionDetail['refunds'][number]>> = [
      { key: 'id', header: 'Refund ID', render: (row) => <span className="mono">{row.razorpay_refund_id}</span> },
      { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
      { key: 'date', header: 'Refund date', render: (row) => formatDate(row.refund_date) },
      { key: 'status', header: 'Status', render: (row) => <Badge tone={statusToneFor(row.status)}>{row.status}</Badge> },
      { key: 'reason', header: 'Reason', render: (row) => row.reason },
    ];

    return (
      <div className="stack">
        <section className="form-section">
          <h3 className="form-section-title">Payment</h3>
          <div className="detail-grid">
            <Row label="Payment ID"><span className="mono">{data.razorpay_payment_id}</span></Row>
            <Row label="Order ID"><span className="mono">{data.razorpay_order_id ?? '—'}</span></Row>
            <Row label="Razorpay invoice ID"><span className="mono">{data.razorpay_invoice_id ?? '—'}</span></Row>
            <Row label="Status"><Badge tone={statusToneFor(data.payment_status)}>{data.payment_status}</Badge></Row>
            <Row label="Customer">{data.customer_name ?? '—'}</Row>
            <Row label="Email">{data.customer_email ?? '—'}</Row>
            <Row label="Contact">{data.customer_contact ?? '—'}</Row>
            <Row label="Description">{data.description ?? '—'}</Row>
            <Row label="Payment method">
              {data.method_detail ?? data.payment_method}
            </Row>
            <Row label="Created">{formatDateTime(data.created_at)}</Row>
            <Row label="Captured">{data.captured_at ? formatDateTime(data.captured_at) : 'Not captured'}</Row>
            <Row label="Last synced">{data.last_synced_at ? formatDateTime(data.last_synced_at) : '—'}</Row>
          </div>
        </section>

        <section className="form-section">
          <h3 className="form-section-title">Amounts</h3>
          <div className="detail-grid">
            <Row label="Amount"><span className="num">{formatCurrency(data.amount, data.currency)}</span></Row>
            <Row label="Gateway fee"><span className="num">{formatCurrency(data.razorpay_fee)}</span></Row>
            <Row label="Tax on fee (GST)"><span className="num">{formatCurrency(data.tax_on_fee)}</span></Row>
            <Row label="Refunded"><span className="num">{formatCurrency(data.refund_amount)}</span></Row>
            <Row label="Net amount"><strong className="num">{formatCurrency(data.net_amount)}</strong></Row>
          </div>
        </section>

        <section className="form-section">
          <h3 className="form-section-title">Category</h3>
          <div className="detail-grid">
            <Row label="Category"><Badge tone={categoryTone(data.category)}>{data.category_label}</Badge></Row>
            <Row label="Decided by">{data.category_source ?? '—'}</Row>
            <Row label="Confidence">{confidencePercent}</Row>
            <Row label="State">
              <Badge tone={data.category_status === 'accepted' ? 'success' : 'warning'}>
                {data.category_status === 'accepted' ? 'Accepted' : 'Suggested'}
              </Badge>
            </Row>
            <Row label="Ledger account">
              {data.ledger_account_name
                ? `${data.ledger_account_code} — ${data.ledger_account_name}`
                : 'Not assigned'}
            </Row>
          </div>

          {data.category_status === 'suggested' ? (
            <div className="row">
              <Button variant="primary" icon={<Check size={14} />} onClick={acceptCategory} loading={busy}>
                Accept
              </Button>
              <label className="filter-select">
                <span>Change category</span>
                <select
                  className="select select-sm"
                  value={data.category}
                  onChange={(event) => changeCategory(event.target.value)}
                  disabled={busy}
                >
                  {categories.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <label className="filter-select">
              <span>Change category</span>
              <select
                className="select select-sm"
                value={data.category}
                onChange={(event) => changeCategory(event.target.value)}
                disabled={busy}
              >
                {categories.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="form-section">
          <h3 className="form-section-title">Invoice &amp; reconciliation</h3>
          <div className="detail-grid">
            <Row label="Linked invoice">{data.invoice_number ?? 'Not linked'}</Row>
            <Row label="Reconciliation">
              <Badge tone={reconciliationTone(data.reconciliation_status)}>
                {data.reconciliation_status.replace(/_/g, ' ')}
              </Badge>
            </Row>
          </div>

          {!data.invoice_id ? (
            matches.loading ? (
              <LoadingBlock label="Looking for matching invoices…" />
            ) : matches.data ? (
              <>
                {matches.data.ambiguous ? (
                  <div className="notification notification-warning" role="status">
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>{matches.data.reason}</span>
                  </div>
                ) : null}
                {matches.data.candidates.length ? (
                  <ul className="plain-list">
                    {matches.data.candidates.map((candidate) => (
                      <li key={candidate.invoice_id} className="row-between">
                        <div className="cell-stack">
                          <strong>
                            {candidate.invoice_number} · {formatCurrency(candidate.balance_due)} due
                          </strong>
                          <span className="small">
                            {candidate.customer_name} · {Math.round(candidate.confidence * 100)}% confidence ·{' '}
                            {candidate.reasons.join('; ')}
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Link2 size={14} />}
                          loading={busy}
                          onClick={() => confirmMatch(candidate.invoice_id, candidate.invoice_number)}
                        >
                          Match &amp; book
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small">{matches.data.reason}</p>
                )}
              </>
            ) : null
          ) : null}
        </section>

        {data.accounting_entries.length ? (
          <section className="form-section">
            <h3 className="form-section-title">Accounting entry</h3>
            {data.accounting_entries.map((entry) => (
              <div key={entry.id} className="stack">
                <p className="small">
                  {entry.entry_number} · {formatDate(entry.date)} · {formatCurrency(entry.total)}
                </p>
                <DataTable
                  columns={[
                    { key: 'description', header: 'Line', render: (line) => line.description ?? '—' },
                    { key: 'debit', header: 'Debit', align: 'right', render: (line) => (line.debit ? formatCurrency(line.debit) : '—') },
                    { key: 'credit', header: 'Credit', align: 'right', render: (line) => (line.credit ? formatCurrency(line.credit) : '—') },
                  ]}
                  rows={entry.lines}
                  rowKey={(line) => `${entry.id}-${line.account_id}-${line.debit}-${line.credit}`}
                  caption={`Journal lines for ${entry.entry_number}`}
                />
              </div>
            ))}
          </section>
        ) : null}

        {data.refunds.length ? (
          <section className="form-section">
            <h3 className="form-section-title">Refunds</h3>
            <DataTable
              columns={refundColumns}
              rows={data.refunds}
              rowKey={(row) => row.id}
              caption="Refunds against this payment"
            />
          </section>
        ) : null}

        <section className="form-section">
          <h3 className="form-section-title">Razorpay reference</h3>
          <p className="small">
            The gateway payload kept for audit and debugging. Card numbers, CVVs and one-time passwords are
            never stored.
          </p>
          <pre className="code-tag" style={{ overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {data.raw_reference ? JSON.stringify(data.raw_reference, null, 2) : 'No stored reference'}
          </pre>
        </section>
      </div>
    );
  };

  return (
    <Modal
      open
      size="xl"
      title="Transaction detail"
      subtitle={data ? data.razorpay_payment_id : undefined}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {body()}
    </Modal>
  );
}
