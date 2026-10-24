import { describe, expect, it } from 'vitest';

import { lineTotals, linesError, linesPayload, newLine } from './LineItemsEditor';

const line = (quantity: string, rate: string, taxRate: string, description = 'Item') => ({ ...newLine(), quantity, rate, taxRate, description });

describe('lineTotals', () => {
  it('charges GST on the discounted value, as the server does', () => {
    // 2 x 5,000 at 18%, less 500: tax = 18% of 9,500.
    const totals = lineTotals([line('2', '5000', '18')], '500');
    expect(totals).toEqual({ subtotal: 10000, discount: 500, taxTotal: 1710, total: 11210 });
  });

  it('handles mixed rates and no discount', () => {
    const totals = lineTotals([line('1', '1000', '18'), line('3', '100', '5')], '0');
    expect(totals.subtotal).toBe(1300);
    expect(totals.taxTotal).toBe(195);
    expect(totals.total).toBe(1495);
  });
});

describe('linesError / linesPayload', () => {
  it('flags missing descriptions and zero quantities', () => {
    expect(linesError([])).toBe('docflow.form.needLine');
    expect(linesError([line('1', '10', '0', '  ')])).toBe('docflow.form.needDescription');
    expect(linesError([line('0', '10', '0')])).toBe('docflow.form.needQuantity');
    expect(linesError([line('1', '10', '0')])).toBeNull();
  });

  it('sends numbers and nulls for blank ids', () => {
    expect(linesPayload([line('1.5', '99.999', '12', ' Widget ')])).toEqual([
      { itemId: null, accountId: null, description: 'Widget', quantity: 1.5, rate: 100, taxRate: 12 },
    ]);
  });
});
