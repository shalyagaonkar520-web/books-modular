/** Download an invoice PDF as Original / Duplicate / Triplicate copies, with an optional watermark. */
import { useState } from 'react';
import { FileDown } from 'lucide-react';

import { invoicesApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { CheckboxField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useDownload } from '@/hooks/useDownload';

const COPIES = ['original', 'duplicate', 'triplicate'] as const;

export function InvoiceCopiesModal({ open, onClose, invoiceId, invoiceNumber }: { open: boolean; onClose: () => void; invoiceId: string; invoiceNumber: string }) {
  const { t } = useAppContent();
  const { download, downloading } = useDownload();
  const [copies, setCopies] = useState<string[]>(['original', 'duplicate', 'triplicate']);
  const [watermark, setWatermark] = useState('');

  const toggle = (copy: string, on: boolean) => setCopies((current) => COPIES.filter((c) => (c === copy ? on : current.includes(c))));

  return (
    <Modal
      open={open}
      title={t('invoices.copies.title')}
      subtitle={t('invoices.copies.subtitle')}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            icon={<FileDown size={15} />}
            disabled={downloading || copies.length === 0}
            onClick={() => void download(() => invoicesApi.downloadPdf(invoiceId, invoiceNumber, { copies: copies.join(','), watermark }))}
          >
            {t('invoices.view.downloadPdf')}
          </Button>
        </>
      }
    >
      {COPIES.map((copy) => (
        <CheckboxField key={copy} label={t(`invoices.copies.${copy}`)} checked={copies.includes(copy)} onChange={(e) => toggle(copy, e.target.checked)} />
      ))}
      <TextField
        label={t('invoices.copies.watermark')}
        hint={t('invoices.copies.watermarkHint')}
        maxLength={30}
        value={watermark}
        onChange={(e) => setWatermark(e.target.value)}
      />
    </Modal>
  );
}
