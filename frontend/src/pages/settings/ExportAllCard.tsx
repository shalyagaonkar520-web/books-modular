/** Export all books: every record of the organization as one Excel workbook. */
import { useState } from 'react';
import { Download } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

export function ExportAllCard({ download }: { download: (filename: string) => Promise<void> }) {
  const { t } = useAppContent();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await download(`books-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(t('settings.export.done'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={t('settings.export.title')}
      subtitle={t('settings.export.subtitle')}
      actions={
        <Button variant="primary" size="sm" icon={<Download size={15} />} loading={busy} onClick={() => void run()}>
          {t('settings.export.button')}
        </Button>
      }
    >
      <p className="small text-muted">{t('settings.export.note')}</p>
    </Card>
  );
}
