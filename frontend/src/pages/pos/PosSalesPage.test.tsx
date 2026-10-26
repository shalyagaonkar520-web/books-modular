import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { PosSalesPage } from './PosSalesPage';

const SUMMARY = {
  date: '2026-10-26',
  salesCount: 2,
  grossSales: 551,
  taxTotal: 51,
  returnsTotal: 0,
  netSales: 551,
  itemsSold: 4,
  averageBill: 275.5,
  cashExpected: 341,
  byMode: [
    { mode: 'cash', count: 1, total: 341, refunds: 0 },
    { mode: 'upi', count: 1, total: 210, refunds: 0 },
    { mode: 'card', count: 0, total: 0, refunds: 0 },
  ],
  byCashier: [{ cashierId: 'u1', name: 'Asha', count: 2, total: 551 }],
  topItems: [{ itemId: 'it-butter', name: 'Amul Butter', quantity: 3, amount: 300 }],
};

const LIST_ITEM = {
  id: 'sale-1',
  clientSaleId: 'abcdefgh1',
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-00042',
  date: '2026-10-26',
  createdAt: '2026-10-26T10:00:00Z',
  customerName: 'Walk-in Customer',
  mode: 'cash',
  total: 341,
  returnedAmount: 0,
  itemsCount: 3,
  cashierName: 'Asha',
};

const SALE = {
  ...LIST_ITEM,
  paymentId: 'p1',
  paymentNumber: 'PAY-1',
  subtotal: 325,
  discountAmount: 0,
  taxTotal: 16,
  tendered: 400,
  changeDue: 59,
  lines: [
    { itemId: 'it-butter', name: 'Amul Butter', quantity: 3, returnedQuantity: 0, rate: 100, taxRate: 5, amount: 300, taxAmount: 15 },
    { itemId: 'it-bun', name: 'Bun', quantity: 1, returnedQuantity: 1, rate: 25, taxRate: 4, amount: 25, taxAmount: 1 },
  ],
  returns: [],
  receipt: { organizationName: 'Rooman Mart' },
};

describe('PosSalesPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the day end and returns items from a sale with one id per return', async () => {
    const posted: Array<{ clientReturnId: string; lines: Array<{ itemId: string; quantity: number }> }> = [];
    installMockApi({
      'GET /api/pos/summary': SUMMARY,
      'GET /api/pos/sales': [LIST_ITEM],
      'GET /api/pos/sales/sale-1': SALE,
      'POST /api/pos/sales/sale-1/returns': (_url: URL, init: RequestInit) => {
        posted.push(JSON.parse(String(init.body)));
        return { ...SALE, returnedAmount: 105, returns: [{ creditNoteId: 'cn1', creditNoteNumber: 'CN-00001', date: '2026-10-26', total: 105 }] };
      },
    });
    renderWithProviders(<PosSalesPage />);
    expect(await screen.findByText('Cash in drawer')).toBeInTheDocument();
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getAllByText('Amul Butter').length).toBeGreaterThan(0);

    await userEvent.click(await screen.findByRole('button', { name: /^open$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByTestId('pos-receipt')).toHaveTextContent('Rooman Mart');
    await userEvent.click(within(dialog).getByRole('button', { name: /return items/i }));
    // Bun was already returned in full, so only butter can come back.
    expect(within(dialog).queryByLabelText(/bun/i)).toBeNull();
    await userEvent.type(within(dialog).getByLabelText(/amul butter \(up to 3\)/i), '1');
    expect(within(dialog).getByText(/refund about/i)).toHaveTextContent('105');
    await userEvent.click(within(dialog).getByRole('button', { name: /refund and restock/i }));
    expect(await within(dialog).findByText(/CN-00001/)).toBeInTheDocument();
    expect(posted).toHaveLength(1);
    expect(posted[0].lines).toEqual([{ itemId: 'it-butter', quantity: 1 }]);
    expect(posted[0].clientReturnId.length).toBeGreaterThanOrEqual(8);
  });
});
