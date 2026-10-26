/** Currencies the organization invoices or buys in, and their exchange rates. */
import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { currenciesApi } from '@/api/advancedAccounting';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatDateTime, parseNumber } from '@/utils/format';

export function CurrencySettings() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const list = useAsync(() => currenciesApi.list(), []);
  const catalog = useAsync(() => currenciesApi.catalog(), []);
  const { submitting, error, run } = useSubmit();
  const [code, setCode] = useState('');
  const [rate, setRate] = useState('');
  const [rates, setRates] = useState<Record<string, string>>({});
  const base = list.data?.find((c) => c.isBase)?.code ?? 'INR';

  const save = async (currency: string, value: string) => {
    const saved = await run(() => currenciesApi.save(currency, { exchangeRate: parseNumber(value) }));
    if (saved) {
      toast.success(t('settings.currency.saved', { code: saved.code }));
      setCode('');
      setRate('');
      list.reload();
    }
  };
  const remove = async (currency: string) => {
    const ok = await run(() => currenciesApi.remove(currency));
    if (ok) {
      toast.success(t('settings.currency.removed', { code: currency }));
      list.reload();
    }
  };

  const used = new Set((list.data ?? []).map((c) => c.code));
  return (
    <Card title={t('settings.currency.title')} subtitle={t('settings.currency.subtitle', { base })}>
      <FormError message={error} />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('settings.currency.code')}</th>
              <th>{t('settings.currency.name')}</th>
              <th className="align-right">{t('settings.currency.rate', { base })}</th>
              <th>{t('settings.currency.updated')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((c) => (
              <tr key={c.code}>
                <td>
                  <strong>{c.code}</strong> {c.symbol}
                </td>
                <td>{c.name}</td>
                <td className="align-right">
                  {c.isBase || !isAdmin ? (
                    c.exchangeRate
                  ) : (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <input
                        className="input num"
                        style={{ maxWidth: 140 }}
                        type="number"
                        min="0"
                        step="0.000001"
                        aria-label={t('settings.currency.rate', { base })}
                        value={rates[c.code] ?? String(c.exchangeRate ?? '')}
                        onChange={(e) => setRates((r) => ({ ...r, [c.code]: e.target.value }))}
                      />
                      <Button size="sm" disabled={submitting || !rates[c.code]} onClick={() => save(c.code, rates[c.code])}>
                        {t('settings.currency.update')}
                      </Button>
                    </div>
                  )}
                </td>
                <td className="small">{c.isBase ? t('settings.currency.base') : c.updatedAt ? formatDateTime(c.updatedAt) : '—'}</td>
                <td className="align-right">
                  {!c.isBase && isAdmin ? (
                    <button type="button" className="action-btn is-danger" aria-label={t('settings.currency.remove')} onClick={() => remove(c.code)}>
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isAdmin ? (
        <div className="row wrap form-section">
          <SelectField
            label={t('settings.currency.add')}
            value={code}
            placeholder={t('settings.currency.pick')}
            options={(catalog.data ?? []).filter((c) => !used.has(c.code)).map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
            onChange={(e) => setCode(e.target.value)}
          />
          <TextField label={t('settings.currency.rate', { base })} type="number" min="0" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} />
          <Button variant="primary" disabled={!code || !rate || submitting} onClick={() => save(code, rate)}>
            {t('settings.currency.addButton')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
