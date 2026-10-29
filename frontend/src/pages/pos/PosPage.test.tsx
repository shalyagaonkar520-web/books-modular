import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { billTotals, cashSuggestions, OPEN_BILL_KEY, PosPage, type BillLine } from './PosPage';

const BUTTER = {
  id: 'it-butter',
  name: 'Amul Butter',
  sku: 'BUT-100',
  barcode: '8901262150101',
  unit: 'pcs',
  sellingPrice: 100,
  taxRate: 5,
  trackInventory: true,
  stockOnHand: 10,
  reorderLevel: 0,
};

function saleFrom(body: { clientSaleId: string; lines: Array<{ quantity: number }>; amountTendered?: number | null }) {
  const qty = body.lines.reduce((sum, line) => sum + line.quantity, 0);
  const total = qty * 105;
  return {
    id: 'sale-1',
    clientSaleId: body.clientSaleId,
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-00042',
    date: '2026-10-26',
    createdAt: '2026-10-26T10:00:00Z',
    customerName: 'Walk-in Customer',
    mode: 'cash',
    total,
    returnedAmount: 0,
    itemsCount: qty,
    cashierName: 'Asha',
    subtotal: qty * 100,
    discountAmount: 0,
    taxTotal: qty * 5,
    tendered: body.amountTendered ?? total,
    changeDue: (body.amountTendered ?? total) - total,
    lines: [{ itemId: BUTTER.id, name: BUTTER.name, quantity: qty, returnedQuantity: 0, rate: 100, taxRate: 5, amount: qty * 100, taxAmount: qty * 5 }],
    returns: [],
    receipt: { organizationName: 'Rooman Mart', gstin: '29ABCDE1234F1Z5', footer: 'No returns after 7 days' },
  };
}

async function scan(code: string) {
  const box = await screen.findByLabelText(/barcode or sku/i);
  await userEvent.type(box, `${code}{Enter}`);
}

describe('billTotals', () => {
  const line = (rate: number, quantity: number, taxRate: number): BillLine => ({
    itemId: `${rate}-${taxRate}`,
    name: 'x',
    sku: 'x',
    unit: 'pcs',
    rate,
    taxRate,
    quantity,
    trackInventory: false,
    stockOnHand: 0,
  });

  it('adds GST per line and spreads a discount before tax, like the server', () => {
    expect(billTotals([line(100, 2, 5), line(200, 1, 18)], 0)).toEqual({ subtotal: 400, discount: 0, tax: 46, total: 446 });
    // 40 off: 20 from each line, then tax on what is left.
    expect(billTotals([line(100, 2, 5), line(200, 1, 18)], 40)).toEqual({ subtotal: 400, discount: 40, tax: 41.4, total: 401.4 });
    expect(billTotals([line(10, 1, 0)], 50).total).toBe(0);
  });

  it('suggests the notes a customer is likely to hand over', () => {
    expect(cashSuggestions(446)).toEqual([446, 450, 500, 2000]);
    expect(cashSuggestions(100)).toEqual([100, 500, 2000]);
  });
});

describe('PosPage', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('scans, takes cash, shows the change and the receipt', async () => {
    let sent: { clientSaleId: string; lines: Array<{ itemId: string; quantity: number }>; amountTendered?: number | null; paymentMode: string } | null = null;
    installMockApi({
      'GET /api/pos/lookup': (url: URL) => (url.searchParams.get('code') === BUTTER.barcode ? BUTTER : new Response('{"detail":"No item with this barcode"}', { status: 404 })),
      'POST /api/pos/sales': (_url: URL, init: RequestInit) => {
        sent = JSON.parse(String(init.body));
        return saleFrom(sent!);
      },
    });
    renderWithProviders(<PosPage />);
    await scan(BUTTER.barcode);
    expect(await screen.findByText('Amul Butter')).toBeInTheDocument();
    // Scanning it again adds nothing: more of an item only with +.
    await scan(BUTTER.barcode);
    expect(await screen.findByText(/already on the bill/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('pos-total')).toHaveTextContent('105'));
    await userEvent.click(screen.getByRole('button', { name: 'One more Amul Butter' }));
    await waitFor(() => expect(screen.getByTestId('pos-total')).toHaveTextContent('210'));

    await userEvent.click(screen.getByRole('button', { name: /pay/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/cash received/i), '500');
    expect(within(dialog).getByText(/give change/i)).toHaveTextContent('290');
    await userEvent.click(within(dialog).getByRole('button', { name: /complete sale/i }));

    expect(await screen.findByTestId('pos-receipt')).toHaveTextContent('INV-00042');
    expect(screen.getByTestId('pos-receipt')).toHaveTextContent('No returns after 7 days');
    expect(sent!.lines).toEqual([{ itemId: BUTTER.id, quantity: 2 }]);
    expect(sent!.paymentMode).toBe('cash');
    expect(sent!.amountTendered).toBe(500);
    expect(sent!.clientSaleId.length).toBeGreaterThanOrEqual(8);
    // The bill is cleared for the next customer.
    expect(sessionStorage.getItem(OPEN_BILL_KEY)).toBeNull();
  });

  it('retries a payment whose answer was lost with the same sale id', async () => {
    const ids: string[] = [];
    let attempt = 0;
    installMockApi({
      'GET /api/pos/lookup': BUTTER,
      'POST /api/pos/sales': (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        ids.push(body.clientSaleId);
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return saleFrom(body);
      },
    });
    renderWithProviders(<PosPage />);
    await scan('anything');
    await screen.findByText('Amul Butter');
    await userEvent.click(screen.getByRole('button', { name: /pay/i }));
    let dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /complete sale/i }));
    expect(await within(dialog).findByText(/connection dropped/i)).toBeInTheDocument();
    // The unconfirmed payment survives a reload, and locks the bill.
    expect(JSON.parse(sessionStorage.getItem(OPEN_BILL_KEY) ?? '{}').pending.clientSaleId).toBe(ids[0]);
    expect(screen.getByLabelText(/barcode or sku/i)).toBeDisabled();

    dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /retry payment/i }));
    expect(await screen.findByTestId('pos-receipt')).toBeInTheDocument();
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
  });

  it('shows a refusal (short stock) and leaves the bill editable', async () => {
    installMockApi({
      'GET /api/pos/lookup': BUTTER,
      'POST /api/pos/sales': () =>
        new Response(JSON.stringify({ detail: 'Not enough stock. Amul Butter: 0 pcs in stock, 1 on the bill' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
    });
    renderWithProviders(<PosPage />);
    await scan('8901262150101');
    await screen.findByText('Amul Butter');
    await userEvent.click(screen.getByRole('button', { name: /pay/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /complete sale/i }));
    expect(await within(dialog).findByText(/not enough stock/i)).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(OPEN_BILL_KEY) ?? '{}').pending).toBeNull();
    expect(screen.getByLabelText(/barcode or sku/i)).not.toBeDisabled();
  });

  it('says so when a code matches no item, and keeps the open bill across a reload', async () => {
    installMockApi({
      'GET /api/pos/lookup': () => new Response(JSON.stringify({ detail: 'No item with this barcode' }), { status: 404, headers: { 'content-type': 'application/json' } }),
    });
    sessionStorage.setItem(
      OPEN_BILL_KEY,
      JSON.stringify({ lines: [{ ...BUTTER, itemId: BUTTER.id, rate: 100, quantity: 3 }], discount: '', pending: null }),
    );
    renderWithProviders(<PosPage />);
    expect(await screen.findByText('Amul Butter')).toBeInTheDocument();
    expect(screen.getByTestId('pos-total')).toHaveTextContent('315');
    await scan('0000');
    expect(await screen.findByText(/no item with the barcode or sku 0000/i)).toBeInTheDocument();
  });
});
