/** Every refund to customers and from vendors, and refunding an unused advance. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Undo2 } from 'lucide-react';

import { advancesApi, type Refund, refundsApi } from '@/api/docFlow';
import { contactsApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { type Column, DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { SelectField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate } from '@/utils/format';
import { paymentModeLabel } from '@/utils/status';

import { RefundModal } from './CreditModals';

const PAGE_SIZE = 25;

export function RefundsPage() {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const [party, setParty] = useState<'' | 'customer' | 'vendor'>('');
  const [page, setPage] = useState(1);
  const [pickOpen, setPickOpen] = useState(false);
  const [advance, setAdvance] = useState<{ partyType: 'customer' | 'vendor'; contactId: string; contactName: string; balance: number } | null>(null);
  const [deleting, setDeleting] = useState<Refund | null>(null);
  const { submitting, run, errorRef } = useSubmit();
  const list = useAsync(() => refundsApi.list({ partyType: party || undefined, page, page_size: PAGE_SIZE }), [party, page]);

  const remove = async () => {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    const ok = await run(() => refundsApi.remove(target.id));
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t('docflow.view.refundDeleted'));
      list.reload();
    }
  };

  const columns: Array<Column<Refund>> = [
    { key: 'date', header: t('docflow.col.date'), render: (r) => formatDate(r.date) },
    { key: 'number', header: t('docflow.col.number'), render: (r) => <strong>{r.refundNumber}</strong> },
    { key: 'contact', header: t('refunds.col.contact'), render: (r) => r.contactName },
    { key: 'party', header: t('refunds.col.direction'), render: (r) => <Badge tone={r.partyType === 'customer' ? 'warning' : 'success'}>{t(`refunds.direction.${r.partyType}`)}</Badge> },
    {
      key: 'source',
      header: t('refunds.col.source'),
      render: (r) =>
        r.creditNoteId ? (
          <Link to={`/credit-notes/${r.creditNoteId}`}>{r.creditNoteNumber}</Link>
        ) : r.vendorCreditId ? (
          <Link to={`/vendor-credits/${r.vendorCreditId}`}>{r.vendorCreditNumber}</Link>
        ) : (
          t('refunds.source.advance')
        ),
    },
    { key: 'mode', header: t('docflow.refund.mode'), render: (r) => paymentModeLabel(r.mode, t) },
    { key: 'account', header: t('docflow.refund.account'), render: (r) => r.bankAccountName },
    { key: 'amount', header: t('docflow.refund.amount'), align: 'right', render: (r) => formatCurrency(r.amount) },
  ];
  if (canWrite) {
    columns.push({
      key: 'del',
      header: '',
      align: 'right',
      render: (r) => (
        <button type="button" className="action-btn is-danger" aria-label={t('docflow.view.deleteRefund')} onClick={() => setDeleting(r)}>
          <Trash2 size={15} />
        </button>
      ),
    });
  }

  const rows = list.data?.items ?? [];
  return (
    <>
      <PageHeader
        title={t('refunds.title')}
        subtitle={t('refunds.subtitle')}
        actions={
          canWrite ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setPickOpen(true)}>
              {t('refunds.refundAdvance')}
            </Button>
          ) : null
        }
      />
      <Card>
        <Tabs
          tabs={[
            { id: '', label: t('docflow.tab.all') },
            { id: 'customer', label: t('refunds.direction.customer') },
            { id: 'vendor', label: t('refunds.direction.vendor') },
          ]}
          active={party}
          onChange={(id) => {
            setParty(id as typeof party);
            setPage(1);
          }}
        />
        {list.error ? (
          <ErrorBlock message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <SkeletonRows rows={5} columns={columns.length} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Undo2 size={28} />} title={t('refunds.empty.title')} description={t('refunds.empty.body')} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={t('refunds.title')} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>

      {pickOpen ? (
        <AdvancePicker
          onClose={() => setPickOpen(false)}
          onPicked={(picked) => {
            setPickOpen(false);
            setAdvance(picked);
          }}
        />
      ) : null}
      <RefundModal
        open={advance !== null}
        advance={advance ?? undefined}
        onClose={() => setAdvance(null)}
        onSaved={() => {
          setAdvance(null);
          list.reload();
        }}
      />
      <ConfirmDialog open={deleting !== null} title={t('docflow.confirm.title')} message={t('docflow.confirm.unrefund')} busy={submitting} onCancel={() => setDeleting(null)} onConfirm={remove} />
    </>
  );
}

function AdvancePicker({
  onClose,
  onPicked,
}: {
  onClose: () => void;
  onPicked: (value: { partyType: 'customer' | 'vendor'; contactId: string; contactName: string; balance: number }) => void;
}) {
  const { t } = useAppContent();
  const [partyType, setPartyType] = useState<'customer' | 'vendor'>('customer');
  const [contactId, setContactId] = useState('');
  const contacts = useAsync((signal) => contactsApi.list({ type: partyType, page_size: 200 }, signal), [partyType]);
  const balance = useAsync(async () => (contactId ? advancesApi.balance(partyType, contactId) : null), [partyType, contactId]);
  const contact = contacts.data?.items.find((c) => c.id === contactId);
  const amount = balance.data?.balance ?? 0;

  return (
    <Modal
      open
      title={t('refunds.refundAdvance')}
      subtitle={t('refunds.pickSubtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!contact || amount <= 0} onClick={() => contact && onPicked({ partyType, contactId, contactName: contact.displayName, balance: amount })}>
            {t('refunds.continue')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <SelectField
          label={t('refunds.col.direction')}
          value={partyType}
          options={[
            { value: 'customer', label: t('refunds.direction.customer') },
            { value: 'vendor', label: t('refunds.direction.vendor') },
          ]}
          onChange={(e) => {
            setPartyType(e.target.value as 'customer' | 'vendor');
            setContactId('');
          }}
        />
        <SelectField
          label={t('refunds.col.contact')}
          value={contactId}
          placeholder={t(`docflow.form.select.${partyType}`)}
          options={(contacts.data?.items ?? []).map((c) => ({ value: c.id, label: c.displayName }))}
          onChange={(e) => setContactId(e.target.value)}
        />
      </div>
      {contactId ? <p className="form-section">{t('refunds.available', { amount: formatCurrency(amount) })}</p> : null}
    </Modal>
  );
}
