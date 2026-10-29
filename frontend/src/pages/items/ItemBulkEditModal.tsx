/** One change to many items at once: GST rate, HSN/SAC, unit, or prices up / down by a percentage. */
import { useEffect, useState } from 'react';

import { itemsApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { parseNumber } from '@/utils/format';

const GST_RATES = ['0', '0.25', '3', '5', '12', '18', '28', '40'];

export function ItemBulkEditModal({ ids, open, onClose, onSaved }: { ids: string[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const [taxRate, setTaxRate] = useState('');
  const [hsnSac, setHsnSac] = useState('');
  const [unit, setUnit] = useState('');
  const [pricePercent, setPricePercent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTaxRate('');
    setHsnSac('');
    setUnit('');
    setPricePercent('');
    setError(null);
  }, [open]);

  const nothing = !taxRate && !hsnSac.trim() && !unit.trim() && !pricePercent.trim();

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await itemsApi.bulkUpdate({
        ids,
        taxRate: taxRate ? Number(taxRate) : undefined,
        hsnSac: hsnSac.trim() || undefined,
        unit: unit.trim() || undefined,
        priceChangePercent: pricePercent.trim() ? parseNumber(pricePercent) : undefined,
      });
      toast.success(res.message);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('items.bulkEdit.title', { count: ids.length })}
      subtitle={t('items.bulkEdit.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} disabled={nothing || saving} onClick={() => void save()}>
            {t('items.bulkEdit.apply')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <SelectField
          label={t('items.bulkEdit.taxRate')}
          value={taxRate}
          placeholder={t('items.bulkEdit.unchanged')}
          options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))}
          onChange={(e) => setTaxRate(e.target.value)}
        />
        <TextField label={t('items.bulkEdit.hsnSac')} placeholder={t('items.bulkEdit.unchanged')} maxLength={20} value={hsnSac} onChange={(e) => setHsnSac(e.target.value)} />
        <TextField label={t('items.bulkEdit.unit')} placeholder={t('items.bulkEdit.unchanged')} maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} />
        <TextField
          label={t('items.bulkEdit.pricePercent')}
          hint={t('items.bulkEdit.pricePercentHint')}
          type="number"
          min="-90"
          max="1000"
          step="0.01"
          placeholder={t('items.bulkEdit.unchanged')}
          value={pricePercent}
          onChange={(e) => setPricePercent(e.target.value)}
        />
      </div>
      <FormError message={error} />
    </Modal>
  );
}
