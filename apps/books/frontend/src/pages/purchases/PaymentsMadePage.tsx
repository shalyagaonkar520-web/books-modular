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
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useDownload } from '@/hooks/useDownload';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, round2, titleCase, todayIso } from '@/utils/format';
import { PAYMENT_MODES, type Translate } from '@/utils/status';

import { RecordVendorPaymentModal } from './RecordVendorPaymentModal';

const PAGE_SIZE = 25;
const MAX_SUMMARY_PAGES = 50;

function modeLabel(mode: string, t: Translate): string {
  const option = PAYMENT_MODES.find((o) => o.value === mode);
  return option ? t(option.labelKey) : titleCase(mode);
}

function monthStart(): string {
  return `${todayIso().slice(0, 8)}01`;
}

export function PaymentsMadePage() {
  const { t } = useAppContent();
  const toast = useToast();
  const { download } = useDownload();
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
      toast.success(t('paymentsMade.toast.deleted', { number: payment.paymentNumber }));
      setPendingDelete(null);
      refreshAll();
    }
  };

  const columns: Array<Column<VendorPayment>> = [
    { key: 'paymentNumber', header: t('paymentsMade.col.paymentNumber'), render: (payment) => <span className="code-tag">{payment.paymentNumber}</span> },
    { key: 'date', header: t('paymentsMade.col.date'), render: (payment) => formatDate(payment.date) },
    {
      key: 'vendorName',
      header: t('paymentsMade.col.vendor'),
      render: (payment) => (
        <div className="cell-stack">
          <span>{payment.vendorName}</span>
          <small>{payment.bankAccountName}</small>
        </div>
      ),
    },
    {
      key: 'billNumber',
      header: t('paymentsMade.col.bill'),
      render: (payment) =>
        payment.billNumber ? <span className="code-tag">{payment.billNumber}</span> : <span className="text-subtle">{t('paymentsMade.advanceToVendor')}</span>,
    },
    { key: 'mode', header: t('paymentsMade.col.mode'), render: (payment) => modeLabel(payment.mode, t) },
    { key: 'reference', header: t('paymentsMade.col.reference'), render: (payment) => payment.reference || <span className="text-subtle">—</span> },
    { key: 'amount', header: t('paymentsMade.col.amount'), align: 'right', render: (payment) => <span className="num strong">{formatCurrency(payment.amount)}</span> },
    {
      key: 'actions',
      header: t('paymentsMade.col.actions'),
      align: 'right',
      render: (payment) => (
        <div className="row-actions">
          <button
            type="button"
            className="action-btn"
            style={{ color: '#ea4335' }}
            aria-label={t('paymentsMade.aria.sendGmail', { number: payment.paymentNumber })}
            title={t('paymentsMade.tip.sendGmail')}
            onClick={() => setMailPayment(payment)}
          >
            <Mail size={15} />
          </button>
          <button
            type="button"
            className="action-btn"
            style={{ color: '#dc2626' }}
            aria-label={t('paymentsMade.aria.downloadPdf', { number: payment.paymentNumber })}
            title={t('paymentsMade.tip.downloadPdf')}
            onClick={() => vendorPaymentsApi.downloadPdf(payment.id, payment.paymentNumber)}
          >
            <FileDown size={15} />
          </button>
          {canWrite ? (
            <button
              type="button"
              className="action-btn is-danger"
              aria-label={t('paymentsMade.aria.delete', { number: payment.paymentNumber })}
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
        title={t('paymentsMade.title')}
        subtitle={t('paymentsMade.subtitle')}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<FileDown size={15} />}
              onClick={() =>
                void download(() => vendorPaymentsApi.exportPdf({
                  vendor_id: vendorId || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                }))
              }
            >
              {t('common.extractPdf')}
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={15} />}
              onClick={() =>
                void download(() => vendorPaymentsApi.exportExcel({
                  vendor_id: vendorId || undefined,
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                }))
              }
            >
              {t('common.extractExcel')}
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setRecording(true)}>
                {t('paymentsMade.record')}
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
            label={t('paymentsMade.stat.totalPaid')}
            value={summary.data ? formatCurrency(summary.data.paid) : '—'}
            sublabel={`${formatDate(startDate)} – ${formatDate(endDate)}`}
          />
          <StatTile label={t('paymentsMade.stat.payments')} value={summary.data ? String(summary.data.count) : '—'} />
          <StatTile
            label={t('paymentsMade.stat.advances')}
            value={summary.data ? formatCurrency(summary.data.advances) : '—'}
            tone="warning"
            sublabel={t('paymentsMade.stat.advancesSub')}
          />
        </div>
      )}

      <Toolbar>
        <FilterSelect
          label={t('paymentsMade.filter.vendor')}
          value={vendorId}
          onChange={changeFilter(setVendorId)}
          options={[{ value: '', label: t('paymentsMade.filter.allVendors') }, ...(vendors.data?.items ?? []).map((vendor) => ({ value: vendor.id, label: vendor.displayName }))]}
        />
        <label className="filter-select">
          <span>{t('paymentsMade.filter.from')}</span>
          <input
            type="date"
            className="input select-sm"
            value={startDate}
            aria-label={t('paymentsMade.filter.fromAria')}
            onChange={(event) => changeFilter(setStartDate)(event.target.value)}
          />
        </label>
        <label className="filter-select">
          <span>{t('paymentsMade.filter.to')}</span>
          <input
            type="date"
            className="input select-sm"
            value={endDate}
            aria-label={t('paymentsMade.filter.toAria')}
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
            title={t('paymentsMade.empty.title')}
            description={t('paymentsMade.empty.body')}
            icon={<Wallet size={28} aria-hidden="true" />}
            action={
              <IfCanWrite>
                <Button variant="primary" icon={<Plus size={15} />} onClick={() => setRecording(true)}>
                  {t('paymentsMade.record')}
                </Button>
              </IfCanWrite>
            }
          />
        ) : (
          <>
            <DataTable columns={columns} rows={list.data.items} rowKey={(payment) => payment.id} caption={t('paymentsMade.table.caption')} />
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
        title={t('paymentsMade.confirm.title')}
        confirmLabel={t('paymentsMade.confirm.button')}
        busy={remove.submitting}
        message={
          <>
            <p>
              {t('paymentsMade.confirm.body', {
                number: pendingDelete?.paymentNumber ?? '',
                amount: formatCurrency(pendingDelete?.amount ?? 0),
                vendor: pendingDelete?.vendorName ?? '',
              })}
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
  const { t } = useAppContent();
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState(() =>
    t('paymentsMade.send.defaultNotes', { number: payment.paymentNumber, amount: formatCurrency(payment.amount), vendor: payment.vendorName }),
  );
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
      title={t('paymentsMade.send.title')}
      subtitle={t('paymentsMade.send.subtitle', { number: payment.paymentNumber, vendor: payment.vendorName, amount: formatCurrency(payment.amount) })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('paymentsMade.send.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} icon={<Mail size={15} />} onClick={handleSend}>
            {t('paymentsMade.send.submit')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField
          label={t('paymentsMade.send.email')}
          type="email"
          required
          placeholder={t('paymentsMade.send.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <CheckboxField
          label={t('paymentsMade.send.attachPdf')}
          checked={attachPdf}
          onChange={(e) => setAttachPdf(e.target.checked)}
        />
      </div>
      <div style={{ marginTop: '12px' }}>
        <TextAreaField
          label={t('paymentsMade.send.notes')}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Modal>
  );
}
