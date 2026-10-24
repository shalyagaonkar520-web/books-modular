/** Line editor shared by quotes, orders, credits and recurring profiles; totals mirror the server. */
import { Plus, Trash2 } from 'lucide-react';

import type { DocumentLine, Item } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatQuantity, parseNumber, round2, round3 } from '@/utils/format';
import { taxRatesWith } from '@/utils/status';

export interface LineDraft {
  key: string;
  itemId: string;
  /** The line's posting account, carried through so editing keeps it. */
  accountId: string;
  description: string;
  quantity: string;
  rate: string;
  taxRate: string;
}

let lineCounter = 0;

export const newLine = (taxRate = '0'): LineDraft => ({
  key: `dl-${++lineCounter}`,
  itemId: '',
  accountId: '',
  description: '',
  quantity: '1',
  rate: '0',
  taxRate,
});

export const linesFrom = (lines: DocumentLine[], fallbackTax = '0'): LineDraft[] =>
  lines.length
    ? lines.map((line) => ({
        key: line.id ?? `dl-${++lineCounter}`,
        itemId: line.itemId ?? '',
        accountId: line.accountId ?? '',
        description: line.description,
        quantity: String(line.quantity),
        rate: String(line.rate),
        taxRate: String(line.taxRate),
      }))
    : [newLine(fallbackTax)];

// The backend rounds quantity to 3dp and rate to 2dp before multiplying.
export const lineAmount = (line: LineDraft): number => round2(round3(parseNumber(line.quantity)) * round2(parseNumber(line.rate)));
export const lineTax = (line: LineDraft): number => round2((lineAmount(line) * parseNumber(line.taxRate)) / 100);

export function lineTotals(lines: LineDraft[], discountAmount: string) {
  const subtotal = round2(lines.reduce((sum, line) => sum + lineAmount(line), 0));
  const discount = round2(parseNumber(discountAmount));
  // GST is charged after the discount, spread across the lines by value (as the server does).
  const grossTax = lines.reduce((sum, line) => sum + lineTax(line), 0);
  const taxTotal = subtotal > 0 ? round2(grossTax * (1 - discount / subtotal)) : 0;
  return { subtotal, discount, taxTotal, total: round2(subtotal - discount + taxTotal) };
}

export const linesPayload = (lines: LineDraft[]) =>
  lines.map((line) => ({
    itemId: line.itemId || null,
    accountId: line.accountId || null,
    description: line.description.trim(),
    quantity: parseNumber(line.quantity),
    rate: round2(parseNumber(line.rate)),
    taxRate: parseNumber(line.taxRate),
  }));

/** First problem with the lines as a text key, or null. */
export function linesError(lines: LineDraft[]): string | null {
  if (!lines.length) return 'docflow.form.needLine';
  if (lines.some((line) => !line.description.trim())) return 'docflow.form.needDescription';
  if (lines.some((line) => parseNumber(line.quantity) <= 0)) return 'docflow.form.needQuantity';
  return null;
}

interface Props {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  items: Item[];
  itemsLoading?: boolean;
  /** Customers are charged the selling price, vendors the cost price. */
  party: 'customer' | 'vendor';
  defaultTaxRate?: number;
}

export function LineItemsEditor({ lines, onChange, items, itemsLoading, party, defaultTaxRate }: Props) {
  const { t } = useAppContent();
  const update = (key: string, patch: Partial<LineDraft>) => onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const chooseItem = (key: string, itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      update(key, { itemId: '' });
      return;
    }
    const customer = party === 'customer';
    update(key, {
      itemId,
      description: (customer ? item.salesDescription : item.purchaseDescription) || item.description || item.name,
      rate: String(customer ? item.sellingPrice : item.costPrice),
      taxRate: String(item.taxRate),
    });
  };

  return (
    <>
      <div className="table-wrap">
        <table className="line-items-table">
          <thead>
            <tr>
              <th scope="col">{t('docflow.lines.item')}</th>
              <th scope="col">{t('docflow.lines.description')}</th>
              <th scope="col">{t('docflow.lines.qty')}</th>
              <th scope="col">{t('docflow.lines.rate')}</th>
              <th scope="col">{t('docflow.lines.tax')}</th>
              <th scope="col">{t('docflow.lines.amount')}</th>
              <th scope="col">
                <span className="sr-only">{t('docflow.lines.remove')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const item = items.find((entry) => entry.id === line.itemId);
              const n = index + 1;
              return (
                <tr key={line.key}>
                  <td>
                    <select
                      className="select"
                      aria-label={t('docflow.lines.itemAria', { n })}
                      value={line.itemId}
                      disabled={itemsLoading}
                      onChange={(event) => chooseItem(line.key, event.target.value)}
                    >
                      <option value="">{t('docflow.lines.custom')}</option>
                      {items.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                    {item?.trackInventory ? (
                      <small className={item.stockOnHand > 0 ? 'text-subtle' : 'text-danger'}>
                        {t('docflow.lines.inStock', { quantity: formatQuantity(item.stockOnHand), unit: item.unit })}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <input
                      className="input"
                      aria-label={t('docflow.lines.descriptionAria', { n })}
                      value={line.description}
                      onChange={(event) => update(line.key, { description: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input num"
                      type="number"
                      min="0"
                      step="0.001"
                      aria-label={t('docflow.lines.qtyAria', { n })}
                      value={line.quantity}
                      onChange={(event) => update(line.key, { quantity: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input num"
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={t('docflow.lines.rateAria', { n })}
                      value={line.rate}
                      onChange={(event) => update(line.key, { rate: event.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="select"
                      aria-label={t('docflow.lines.taxAria', { n })}
                      value={line.taxRate}
                      onChange={(event) => update(line.key, { taxRate: event.target.value })}
                    >
                      {taxRatesWith(defaultTaxRate, parseNumber(line.taxRate)).map((rate) => (
                        <option key={rate} value={String(rate)}>
                          {rate}%
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="align-right num">{formatCurrency(lineAmount(line))}</td>
                  <td className="align-right">
                    <button
                      type="button"
                      className="action-btn is-danger"
                      aria-label={t('docflow.lines.removeAria', { n })}
                      disabled={lines.length === 1}
                      onClick={() => onChange(lines.filter((entry) => entry.key !== line.key))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="form-section">
        <Button icon={<Plus size={15} />} onClick={() => onChange([...lines, newLine(defaultTaxRate !== undefined ? String(defaultTaxRate) : '0')])}>
          {t('docflow.lines.add')}
        </Button>
      </div>
    </>
  );
}
