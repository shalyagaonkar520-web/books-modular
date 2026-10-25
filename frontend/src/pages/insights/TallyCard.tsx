/** Settings card: export the books to Tally, or bring Tally ledgers (accounts, customers, vendors) in. */
import { useState } from 'react';
import { FileDown, FileUp } from 'lucide-react';

import { type TallyImportResult, tallyApi } from '@/api/insights';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useSubmit } from '@/hooks/useSubmit';
import { todayIso } from '@/utils/format';

export function TallyCard() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin, can } = useAuth();
  const [start, setStart] = useState(`${todayIso().slice(0, 7)}-01`);
  const [end, setEnd] = useState(todayIso());
  const [result, setResult] = useState<TallyImportResult | null>(null);
  const { submitting, error, run } = useSubmit();
  if (!can('admin', 'viewer')) return null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const res = await run(() => tallyApi.importLedgers(file));
    if (res) {
      setResult(res);
      toast.success(t('tally.imported', { accounts: res.accountsCreated, customers: res.customersCreated, vendors: res.vendorsCreated }));
    }
  };

  return (
    <Card title={t('tally.title')} subtitle={t('tally.subtitle')}>
      <FormError message={error} />
      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <TextField label={t('tally.from')} type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
        <TextField label={t('tally.to')} type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        <Button icon={<FileDown size={15} />} onClick={() => void tallyApi.export(start, end).catch(() => toast.error(t('common.error.download')))}>
          {t('tally.export')}
        </Button>
        {isAdmin ? (
          <label className="btn btn-secondary btn-md">
            <FileUp size={15} aria-hidden="true" /> <span>{submitting ? t('common.loading') : t('tally.import')}</span>
            <input type="file" accept=".xml,application/xml,text/xml" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        ) : null}
      </div>
      <p className="small text-subtle">{t('tally.hint')}</p>
      {result && result.errors.length ? (
        <ul className="plain-list small text-subtle">
          {result.errors.slice(0, 20).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
