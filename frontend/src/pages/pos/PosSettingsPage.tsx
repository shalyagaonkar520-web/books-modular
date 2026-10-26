/** Counter settings (admin): where UPI / card takings go, selling below zero stock, receipt lines. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { bankingApi } from '@/api/endpoints';
import { posApi, type PosSettings } from '@/api/pos';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

export function PosSettingsPage() {
  const { t } = useAppContent();
  const toast = useToast();
  const loaded = useAsync(() => Promise.all([posApi.settings(), bankingApi.accounts()]), []);
  const [form, setForm] = useState<PosSettings | null>(null);
  const { run, submitting, error } = useSubmit();

  useEffect(() => {
    if (loaded.data && !form) setForm(loaded.data[0]);
  }, [loaded.data, form]);

  if (loaded.loading && !loaded.data) return <LoadingBlock />;
  if (loaded.error) return <ErrorBlock message={loaded.error} onRetry={loaded.reload} />;
  if (!form || !loaded.data) return null;

  const accounts = loaded.data[1].filter((acct) => acct.isActive && acct.type !== 'credit_card');
  const save = async () => {
    const saved = await run(() => posApi.saveSettings(form));
    if (saved) {
      setForm(saved);
      toast.success(t('pos.settings.saved'));
    }
  };

  return (
    <div>
      <PageHeader
        title={t('pos.settings.title')}
        actions={
          <Link className="btn btn-secondary btn-sm" to="/pos">
            <span>{t('pos.backToCounter')}</span>
          </Link>
        }
      />
      <Card>
        <div className="stack">
          <FormError message={error} />
          <SelectField
            label={t('pos.settings.bankAccount')}
            hint={t('pos.settings.bankAccountHint', { cash: form.cashAccountName ?? t('pos.settings.noCash') })}
            value={form.bankAccountId ?? ''}
            placeholder={t('pos.settings.sameAsCash')}
            options={accounts.map((acct) => ({ value: acct.id, label: acct.name }))}
            onChange={(event) => setForm({ ...form, bankAccountId: event.target.value || null })}
          />
          <CheckboxField
            label={t('pos.settings.allowNegative')}
            hint={t('pos.settings.allowNegativeHint')}
            checked={form.allowNegativeStock}
            onChange={(event) => setForm({ ...form, allowNegativeStock: event.target.checked })}
          />
          <TextAreaField
            label={t('pos.settings.header')}
            hint={t('pos.settings.headerHint')}
            maxLength={500}
            value={form.receiptHeader ?? ''}
            onChange={(event) => setForm({ ...form, receiptHeader: event.target.value })}
          />
          <TextAreaField
            label={t('pos.settings.footer')}
            hint={t('pos.settings.footerHint')}
            maxLength={500}
            value={form.receiptFooter ?? ''}
            onChange={(event) => setForm({ ...form, receiptFooter: event.target.value })}
          />
          <div>
            <Button variant="primary" loading={submitting} onClick={() => void save()}>
              {t('pos.settings.save')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
