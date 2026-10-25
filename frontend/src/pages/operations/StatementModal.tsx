/** Statement of account for a customer or vendor: running balance, PDF download and email. */
import { useState } from 'react';
import { FileDown, Mail } from 'lucide-react';

import { statementsApi } from '@/api/operations';
import type { Contact } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, todayIso } from '@/utils/format';

const firstOfYear = () => `${todayIso().slice(0, 4)}-01-01`;

export function StatementModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const [start, setStart] = useState(firstOfYear());
  const [end, setEnd] = useState(todayIso());
  const data = useAsync(() => statementsApi.get(contact.id, start, end), [contact.id, start, end]);
  const { submitting, error, run } = useSubmit();
  const st = data.data;
  const isCustomer = contact.type === 'customer';

  const send = async () => {
    const res = await run(() => statementsApi.send(contact.id, start, end, {}));
    if (res) toast.success(t('ops.statement.sent', { email: contact.email ?? '' }));
  };

  return (
    <Modal
      open
      size="lg"
      title={t('ops.statement.title', { name: contact.displayName })}
      subtitle={t('ops.statement.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button icon={<FileDown size={15} />} onClick={() => void statementsApi.pdf(contact.id, start, end).catch(() => toast.error(t('common.error.download')))}>
            {t('ops.statement.pdf')}
          </Button>
          {canWrite && contact.email ? (
            <Button variant="primary" icon={<Mail size={15} />} loading={submitting} onClick={send}>
              {t('ops.statement.email')}
            </Button>
          ) : null}
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('ops.statement.from')} type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
        <TextField label={t('ops.statement.to')} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
      </div>
      {data.loading ? <LoadingBlock /> : null}
      {data.error ? <ErrorBlock message={data.error} onRetry={data.reload} /> : null}
      {st ? (
        <>
          <div className="totals-list" style={{ maxWidth: 360, marginLeft: 'auto' }}>
            <div>
              <span>{t('ops.statement.opening')}</span>
              <span>{formatCurrency(st.openingBalance)}</span>
            </div>
            <div>
              <span>{isCustomer ? t('ops.statement.invoiced') : t('ops.statement.billed')}</span>
              <span>{formatCurrency(st.charges)}</span>
            </div>
            <div>
              <span>{isCustomer ? t('ops.statement.received') : t('ops.statement.paid')}</span>
              <span>{formatCurrency(st.receipts)}</span>
            </div>
            <div className="grand">
              <span>{isCustomer ? t('ops.statement.balanceDue') : t('ops.statement.balancePayable')}</span>
              <span>{formatCurrency(st.closingBalance)}</span>
            </div>
          </div>
          <table className="data-table form-section">
            <thead>
              <tr>
                <th>{t('ops.statement.col.date')}</th>
                <th>{t('ops.statement.col.transaction')}</th>
                <th>{t('ops.statement.col.reference')}</th>
                <th className="align-right">{isCustomer ? t('ops.statement.invoiced') : t('ops.statement.billed')}</th>
                <th className="align-right">{isCustomer ? t('ops.statement.received') : t('ops.statement.paid')}</th>
                <th className="align-right">{t('ops.statement.col.balance')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{formatDate(st.startDate)}</td>
                <td colSpan={4}>{t('ops.statement.opening')}</td>
                <td className="align-right">{formatCurrency(st.openingBalance)}</td>
              </tr>
              {st.rows.map((r, i) => (
                <tr key={i}>
                  <td>{formatDate(r.date)}</td>
                  <td>{r.kind}</td>
                  <td>{r.reference}</td>
                  <td className="align-right">{r.debit ? formatCurrency(r.debit) : ''}</td>
                  <td className="align-right">{r.credit ? formatCurrency(r.credit) : ''}</td>
                  <td className="align-right strong">{formatCurrency(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {st.rows.length === 0 ? <p className="small text-subtle">{t('ops.statement.empty')}</p> : null}
        </>
      ) : null}
    </Modal>
  );
}
