import { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet, Mail, Plus, Trash2, Wallet } from 'lucide-react';

import { contactsApi, vendorPaymentsApi } from '@/api/endpoints';
import type { VendorPayment } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, round2, titleCase, todayIso } from '@/utils/format';
import { PAYMENT_MODES } from '@/utils/status';

import { RecordVendorPaymentModal } from './RecordVendorPaymentModal';

const PAGE_SIZE = 25;
const MAX_SUMMARY_PAGES = 50;

function modeLabel(mode: string): string {
  return PAYMENT_MODES.find((option) => option.value === mode)?.label ?? titleCase(mode);
}

function monthStart(): string {
  return `${todayIso().slice(0, 8)}01`;
}

export function PaymentsMadePage() {
  const toast = useToast();
  const { canWrite } = useAuth();

  const [vendorId, setVendorId] = useState('');
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(todayIso);
  const [page, setPage] = useState(1);
  const [recording, setRecording] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<VendorPayment | null>(null);
  const [mailPayment, setMailPayment] = useState<VendorPayment | null>(null);
  const remove = useSubmit();

  const vendors = useAsync((signal) => contactsApi.list({ type: 'vendor', page_size: 200 }, signal), []);

  const filters = useMemo(
    () => ({
      vendor_id: vendorId || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    }),
    [vendorId, startDate, endDate],
  );

  const list = useAsync(() => vendorPaymentsApi.list({ ...filters, page, page_size: PAGE_SIZE }), [filters, page]);

  const summary = useAsync(async () => {
    const rows: VendorPayment[] = [];
    let total = 0;
    for (let current = 1; current <= MAX_SUMMARY_PAGES; current += 1) {
      const result = await vendorPaymentsApi.list({ ...filters, page: current, page_size: 200 });
      total = result.total;
      rows.push(...result.items);
      if (result.items.length === 0 || rows.length >= total) break;
    }
    return {
      count: total,
      paid: round2(rows.reduce((sum, row) => sum + row.amount, 0)),
      advances: round2(rows.reduce((sum, row) => sum + (row.billId ? 0 : row.amount), 0)),
    };
  }, [filters]);

  const refreshAll = () => {
    list.reload();
    summary.reload();
  };

  const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const deletePayment = async (payment: VendorPayment) => {
    const result = await remove.run(() => vendorPaymentsApi.remove(payment.id));
    if (result) {
      toast.success(`Payment ${payment.paymentNumber} deleted`);
      setPendingDelete(null);
      refreshAll();
    }
  };

  const columns: Array<Column<VendorPayment>> = [
    { key: 'paymentNumber', header: 'Payment #', render: (payment) => <span className="code-tag">{payment.paymentNumber}</span> },
    { key: 'date', header: 'Date', render: (payment) => formatDate(payment.date) },
    {
      key: 'vendorName',
      header: 'Vendor',
      render: (payment) => (
        <div className="cell-stack">
          <span>{payment.vendorName}</span>
          <small>{payment.bankAccountName}</small>
        </div>
      ),
    },
    {
      key: 'billNumber',
      header: 'Bill',
      render: (payment) =>
        payment.billNumber ? <span className="code-tag">{payment.billNumber}</span> : <span className="text-subtle">Advance to vendor</span>,
    },
    { key: 'mode', header: 'Mode', render: (payment) => modeLabel(payment.mode) },
    { key: 'reference', header: 'Reference', render: (payment) => payment.reference || <span className="text-subtle">—</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (payment) => <span className="num strong">{formatCurrency(payment.amount)}</span> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (payment) => (
        <div className="row-actions">
          <button
            type="button"
            className="action-btn"
            style={{ color: '#ea4335' }}
            aria-label={`Send remittance advice for ${payment.paymentNumber} via Gmail`}
            title="Send remittance advice via Gmail"
            onClick={() => setMailPayment(payment)}
          >
            <Mail size={15} />
          </button>
          <button
            type="button"
            className="action-btn"
            style={{ color: '#dc2626' }}
            aria-label={`Download remittance advice PDF for ${payment.paymentNumber}`}
            title="Download remittance advice PDF"
            onClick={() => vendorPaymentsApi.downloadPdf(payment.id, payment.paymentNumber)}
          >
            <FileDown size={15} />
          </button>
          {canWrite ? (
            <button
              type="button"
              className="action-btn is-danger"
              aria-label={`Delete payment ${payment.paymentNumber}`}
              onClick={() => setPendingDelete(payment)}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments made"
        subtitle="Every payment sent to a vendor, whether against a bill or as an advance."
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<FileDown size={15} />}
              onClick={() =>
                vendorPaymentsApi.exportPdf({
                  vendor_id: vendorId || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                })
              }
            >
              Extract PDF
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={15} />}
              onClick={() =>
                vendorPaymentsApi.exportExcel({
                  vendor_id: vendorId || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                })
              }
            >
              Extract Excel
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setRecording(true)}>
                Record payment
              </Button>
            </IfCanWrite>
          </div>
        }
      />

      {summary.error ? (
        <ErrorBlock message={summary.error} onRetry={summary.reload} />
      ) : (
        <div className="stat-grid">
          <StatTile
            label="Total paid"
            value={summary.data ? formatCurrency(summary.data.paid) : '—'}
            sublabel={`${formatDate(startDate)} – ${formatDate(endDate)}`}
          />
          <StatTile label="Payments" value={summary.data ? String(summary.data.count) : '—'} />
          <StatTile
            label="Advances"
            value={summary.data ? formatCurrency(summary.data.advances) : '—'}
            tone="warning"
            sublabel="Not yet applied to a bill"
          />
        </div>
      )}

      <Toolbar>
        <FilterSelect
          label="Vendor"
          value={vendorId}
          onChange={changeFilter(setVendorId)}
          options={[{ value: '', label: 'All vendors' }, ...(vendors.data?.items ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName }))]}
        />
        <label className="filter-select">
          <span>From</span>
          <input
            type="date"
            className="input select-sm"
            value={startDate}
            aria-label="Payments from date"
            onChange={(event) => changeFilter(setStartDate)(event.target.value)}
          />
        </label>
        <label className="filter-select">
          <span>To</span>
          <input
            type="date"
            className="input select-sm"
            value={endDate}
            aria-label="Payments to date"
            onChange={(event) => changeFilter(setEndDate)(event.target.value)}
          />
        </label>
      </Toolbar>

      <FormError message={remove.error} />

      <div className="card">
        {list.loading ? (
          <SkeletonRows rows={6} columns={8} />
        ) : list.error ? (
          <ErrorBlock message={list.error} onRetry={list.reload} />
        ) : !list.data || list.data.items.length === 0 ? (
          <EmptyState
            title="No payments in this period"
            description="Widen the date range, or record a payment to a vendor."
            icon={<Wallet size={28} aria-hidden="true" />}
            action={
              <IfCanWrite>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setRecording(true)}>
                  Record payment
                </Button>
              </IfCanWrite>
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={list.data.items} rowKey={(payment) => payment.id} caption="Payments made" />
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={setPage} />
          </>
        )}
      </div>

      {recording ? (
        <RecordVendorPaymentModal
          onClose={() => setRecording(false)}
          onSaved={() => {
            setRecording(false);
            refreshAll();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this payment?"
        confirmLabel="Delete payment"
        busy={remove.submitting}
        message={
          <>
            <p>
              Payment {pendingDelete?.paymentNumber} of {formatCurrency(pendingDelete?.amount ?? 0)} to {pendingDelete?.vendorName} will be deleted. The
              journal entry is reversed, the bank transaction removed and any bill balance restored.
            </p>
            <FormError message={remove.error} />
          </>
        }
        onCancel={() => {
          setPendingDelete(null);
          remove.reset();
        }}
        onConfirm={() => {
          if (pendingDelete) void deletePayment(pendingDelete);
        }}
      />

      {mailPayment ? (
        <SendRemittanceModal
          payment={mailPayment}
          onClose={() => setMailPayment(null)}
          onSent={(msg) => {
            toast.success(msg);
            setMailPayment(null);
          }}
        />
      ) : null}
    </>
  );
}

interface SendRemittanceModalProps {
  payment: VendorPayment;
  onClose: () => void;
  onSent: (msg: string) => void;
}

function SendRemittanceModal({ payment, onClose, onSent }: SendRemittanceModalProps) {
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState(`Please find attached remittance advice for payment #${payment.paymentNumber} of ${formatCurrency(payment.amount)} to ${payment.vendorName}.`);
  const [attachPdf, setAttachPdf] = useState(true);
  const { submitting, error, run } = useSubmit();

  const handleSend = async () => {
    if (!email.trim()) return;
    const result = await run(() =>
      vendorPaymentsApi.sendGmail(payment.id, {
        to_email: email.trim(),
        attach_pdf: attachPdf,
        custom_notes: notes.trim() || undefined,
      }),
    );
    if (result) {
      onSent(result.message);
    }
  };

  return (
    <Modal
      open
      size="md"
      title="Send Remittance Advice via Gmail"
      subtitle={`Payment #${payment.paymentNumber} • ${payment.vendorName} (${formatCurrency(payment.amount)})`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={submitting} icon={<Mail size={15} />} onClick={handleSend}>
            Send Remittance Advice
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField
          label="Recipient Email"
          type="email"
          required
          placeholder="vendor@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <CheckboxField
          label="Attach PDF Remittance Advice"
          checked={attachPdf}
          onChange={(e) => setAttachPdf(e.target.checked)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <TextAreaField
          label="Custom Notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
