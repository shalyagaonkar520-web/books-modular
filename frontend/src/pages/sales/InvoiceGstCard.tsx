/** On an issued invoice: e-invoice and e-way bill JSON, and the IRN / e-way bill numbers the portals returned. */
import { useState } from 'react';
import { FileJson, Truck } from 'lucide-react';

import { gstApi } from '@/api/gst';
import type { Invoice } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useDownload } from '@/hooks/useDownload';
import { useSubmit } from '@/hooks/useSubmit';
import { formatDateTime } from '@/utils/format';

const TRANSPORT_MODES = [
  { value: '1', key: 'road' },
  { value: '2', key: 'rail' },
  { value: '3', key: 'air' },
  { value: '4', key: 'ship' },
];

export function InvoiceGstCard({ invoice, onChanged }: { invoice: Invoice; onChanged: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const { download, downloading } = useDownload();
  const { submitting, error, run } = useSubmit();
  const [editing, setEditing] = useState(false);
  const [ewayOpen, setEwayOpen] = useState(false);
  const [irn, setIrn] = useState(invoice.irn ?? '');
  const [ackNo, setAckNo] = useState(invoice.irnAckNo ?? '');
  const [ackDate, setAckDate] = useState(invoice.irnAckDate ? invoice.irnAckDate.slice(0, 16) : '');
  const [ewayNo, setEwayNo] = useState(invoice.ewayBillNo ?? '');
  const [mode, setMode] = useState('1');
  const [distance, setDistance] = useState('0');
  const [vehicle, setVehicle] = useState('');

  if (invoice.status === 'draft' || invoice.status === 'void') return null;

  const save = async () => {
    const saved = await run(() =>
      gstApi.register(invoice.id, { irn: irn.trim() || null, irnAckNo: ackNo.trim() || null, irnAckDate: ackDate ? new Date(ackDate).toISOString() : null, ewayBillNo: ewayNo.trim() || null }),
    );
    if (saved) {
      toast.success(t('invoices.gst.saved'));
      setEditing(false);
      onChanged();
    }
  };

  return (
    <Card
      title={t('invoices.gst.title')}
      subtitle={t('invoices.gst.subtitle')}
      footer={
        <div className="row wrap">
          <Button icon={<FileJson size={15} />} disabled={downloading} onClick={() => void download(() => gstApi.downloadEinvoice(invoice.id, invoice.invoiceNumber))}>
            {t('invoices.gst.einvoiceJson')}
          </Button>
          <Button icon={<Truck size={15} />} onClick={() => setEwayOpen(true)}>
            {t('invoices.gst.ewayJson')}
          </Button>
          {canWrite ? <Button onClick={() => setEditing(true)}>{t('invoices.gst.record')}</Button> : null}
        </div>
      }
    >
      <dl className="detail-list">
        <dt>{t('invoices.gst.irn')}</dt>
        <dd className="mono small">{invoice.irn ?? t('invoices.gst.notRegistered')}</dd>
        {invoice.irnAckNo ? (
          <>
            <dt>{t('invoices.gst.ack')}</dt>
            <dd>
              {invoice.irnAckNo}
              {invoice.irnAckDate ? ` · ${formatDateTime(invoice.irnAckDate)}` : ''}
            </dd>
          </>
        ) : null}
        <dt>{t('invoices.gst.ewayNo')}</dt>
        <dd>{invoice.ewayBillNo ?? '—'}</dd>
      </dl>

      {editing ? (
        <Modal
          open
          title={t('invoices.gst.recordTitle', { number: invoice.invoiceNumber })}
          subtitle={t('invoices.gst.recordSubtitle')}
          onClose={() => setEditing(false)}
          footer={
            <>
              <Button onClick={() => setEditing(false)} disabled={submitting}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" loading={submitting} onClick={save}>
                {t('invoices.gst.save')}
              </Button>
            </>
          }
        >
          <FormError message={error} />
          <TextField label={t('invoices.gst.irn')} value={irn} maxLength={64} hint={t('invoices.gst.irnHint')} onChange={(e) => setIrn(e.target.value.trim())} />
          <div className="form-grid">
            <TextField label={t('invoices.gst.ack')} value={ackNo} onChange={(e) => setAckNo(e.target.value)} />
            <TextField label={t('invoices.gst.ackDate')} type="datetime-local" value={ackDate} onChange={(e) => setAckDate(e.target.value)} />
            <TextField label={t('invoices.gst.ewayNo')} value={ewayNo} maxLength={20} onChange={(e) => setEwayNo(e.target.value)} />
          </div>
        </Modal>
      ) : null}

      {ewayOpen ? (
        <Modal
          open
          title={t('invoices.gst.ewayTitle')}
          subtitle={t('invoices.gst.ewaySubtitle')}
          onClose={() => setEwayOpen(false)}
          footer={
            <>
              <Button onClick={() => setEwayOpen(false)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                disabled={downloading}
                onClick={() =>
                  void download(async () => {
                    await gstApi.downloadEway(invoice.id, invoice.invoiceNumber, { transMode: mode, distance: Number(distance) || 0, vehicleNo: vehicle || undefined });
                    setEwayOpen(false);
                  })
                }
              >
                {t('invoices.gst.download')}
              </Button>
            </>
          }
        >
          <div className="form-grid">
            <SelectField label={t('invoices.gst.mode')} value={mode} options={TRANSPORT_MODES.map((m) => ({ value: m.value, label: t(`invoices.gst.mode.${m.key}`) }))} onChange={(e) => setMode(e.target.value)} />
            <TextField label={t('invoices.gst.distance')} type="number" min="0" max="4000" value={distance} onChange={(e) => setDistance(e.target.value)} />
            <TextField label={t('invoices.gst.vehicle')} value={vehicle} maxLength={15} onChange={(e) => setVehicle(e.target.value.toUpperCase())} />
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
