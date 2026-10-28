import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setAccessToken } from '@/api/client';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

// The phone page's camera "sees" the code in `scanned.code` as soon as it starts.
const scanned = { code: '8901262150101' };
vi.mock('./useBarcodeScanner', async () => {
  const { useCallback, useRef } = await import('react');
  return {
    scanFeedback: () => undefined,
    useBarcodeScanner: (onCode: (code: string) => void) => {
      const onCodeRef = useRef(onCode);
      onCodeRef.current = onCode;
      const start = useCallback(async () => onCodeRef.current(scanned.code), []);
      const stop = useCallback(() => undefined, []);
      return {
        videoRef: { current: null },
        start,
        stop,
        active: true,
        starting: false,
        error: null,
        torchAvailable: false,
        torchOn: false,
        toggleTorch: async () => undefined,
      };
    },
  };
});

import { PHONE_LINK_KEY } from './PhoneScanner';
import { FAST_MODE_KEY, PhoneScanPage } from './PhoneScanPage';
import { OPEN_BILL_KEY, PosPage } from './PosPage';

const SESSION = { id: 'sess1234', purpose: 'sale', expiresAt: '2026-10-27T22:00:00Z', connected: false, counterUserName: 'Asha', closed: false };
const KEY = 'secret-key-abcdefghijklmnopqrstuvwxyz0123456789';
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

function renderPhone() {
  // The real address too: the app skips restoring a sign-in on /scan/ pages.
  window.history.pushState({}, '', `/scan/${KEY}`);
  // A phone opening the link has no session of its own (an earlier test signed in).
  setAccessToken(null);
  return renderWithProviders(
    <Routes>
      <Route path="/scan/:token" element={<PhoneScanPage />} />
    </Routes>,
    { route: `/scan/${KEY}` },
  );
}

describe('phone as scanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.removeItem(FAST_MODE_KEY);
    scanned.code = '8901262150101';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('shows a QR with the secret link on the counter and adds what the phone sends, with its quantity', async () => {
    let polls = 0;
    let qrUrl = '';
    installMockApi({
      'POST /api/pos/scanner-sessions': { ...SESSION, token: KEY },
      'GET /api/pos/scanner-sessions/sess1234/qr': (url: URL) => {
        qrUrl = url.searchParams.get('url') ?? '';
        return { svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' };
      },
      'GET /api/pos/scanner-sessions/sess1234/scans': (url: URL) => {
        polls += 1;
        const after = Number(url.searchParams.get('after'));
        if (polls < 2) return { session: SESSION, scans: [] };
        return { session: { ...SESSION, connected: true }, scans: after < 1 ? [{ seq: 1, code: '8901262150101', quantity: 3 }] : [] };
      },
      'GET /api/pos/lookup': BUTTER,
      'DELETE /api/pos/scanner-sessions/sess1234': { ...SESSION, closed: true },
    });
    renderWithProviders(<PosPage />);
    await userEvent.click(await screen.findByRole('button', { name: /use phone as scanner/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('img', { name: /qr code/i })).toBeInTheDocument();
    expect(qrUrl).toBe(`${window.location.origin}/scan/${KEY}`);

    // The phone opens the link and sends 3 butters: the dialog closes and they land on the bill.
    expect(await screen.findByText('Amul Butter', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/phone scanner connected/i)).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(OPEN_BILL_KEY) ?? '{}').lines[0].quantity).toBe(3);
    expect(JSON.parse(sessionStorage.getItem(PHONE_LINK_KEY) ?? '{}').after).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    await waitFor(() => expect(sessionStorage.getItem(PHONE_LINK_KEY)).toBeNull());
  });

  it('on the phone (no sign-in), shows the scanned item and sends the chosen quantity', async () => {
    const sent: Array<{ code: string; quantity: number }> = [];
    let sawAuthHeader = false;
    installMockApi({
      [`GET /api/pos-scan/${KEY}`]: { organizationName: 'Rooman Mart', purpose: 'sale', counterUserName: 'Asha', expiresAt: SESSION.expiresAt },
      [`GET /api/pos-scan/${KEY}/lookup`]: BUTTER,
      [`POST /api/pos-scan/${KEY}/scans`]: (_url: URL, init: RequestInit) => {
        sawAuthHeader = sawAuthHeader || Boolean((init.headers as Record<string, string> | undefined)?.Authorization);
        const body = JSON.parse(String(init.body));
        sent.push(body);
        return { seq: sent.length, ...body };
      },
    });
    renderPhone();
    expect(await screen.findByText('Rooman Mart')).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: /scanned item/i });
    expect(within(card).getByText('Amul Butter')).toBeInTheDocument();
    expect(within(card).getByText('₹100.00')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: /one more/i }));
    await userEvent.click(within(card).getByRole('button', { name: /one more/i }));
    await userEvent.click(within(card).getByRole('button', { name: /send to bill/i }));
    await waitFor(() => expect(sent).toEqual([{ code: '8901262150101', quantity: 3 }]));
    expect(await screen.findByText(/amul butter x 3 sent to the bill/i)).toBeInTheDocument();
    expect(sawAuthHeader).toBe(false);
  });

  it('asks for the details of a barcode Books does not know, adds the item and sends it', async () => {
    scanned.code = '8906001234567';
    const created: unknown[] = [];
    const sent: unknown[] = [];
    installMockApi({
      [`GET /api/pos-scan/${KEY}`]: { organizationName: 'Rooman Mart', purpose: 'sale', counterUserName: 'Asha', expiresAt: SESSION.expiresAt },
      [`GET /api/pos-scan/${KEY}/lookup`]: () =>
        new Response(JSON.stringify({ detail: 'No item with this barcode' }), { status: 404, headers: { 'content-type': 'application/json' } }),
      [`POST /api/pos-scan/${KEY}/items`]: (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        created.push(body);
        return { ...BUTTER, id: 'new1', name: body.name, barcode: body.barcode, sellingPrice: body.sellingPrice, trackInventory: false };
      },
      [`POST /api/pos-scan/${KEY}/scans`]: (_url: URL, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return { seq: 1, code: '8906001234567', quantity: 1 };
      },
    });
    renderPhone();
    const form = await screen.findByRole('form', { name: /new item/i });
    expect(within(form).getByText(/8906001234567 is not in books yet/i)).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText(/item name/i), 'Masala Chips');
    await userEvent.type(within(form).getByLabelText(/^price/i), '20');
    await userEvent.selectOptions(within(form).getByLabelText(/^gst/i), '12');
    await userEvent.click(within(form).getByRole('button', { name: /add item and send/i }));
    await waitFor(() => expect(sent).toEqual([{ code: '8906001234567', quantity: 1 }]));
    expect(created).toEqual([{ barcode: '8906001234567', name: 'Masala Chips', sellingPrice: 20, taxRate: 12, unit: 'pcs' }]);
    expect(await screen.findByText(/masala chips x 1 sent to the bill/i)).toBeInTheDocument();
  });

  it('tells the phone when the link has ended (12 hours, or the counter disconnected)', async () => {
    installMockApi({
      [`GET /api/pos-scan/${KEY}`]: () =>
        new Response(JSON.stringify({ detail: 'This scanner link has ended. Ask the counter for a new QR code.' }), {
          status: 410,
          headers: { 'content-type': 'application/json' },
        }),
    });
    renderPhone();
    expect(await screen.findByText(/scanner link ended/i)).toBeInTheDocument();
    expect(screen.getByText(/ask the counter for a new qr code/i)).toBeInTheDocument();
  });

  it('in Fast scan, sends every scan straight to the bill without a card', async () => {
    localStorage.setItem(FAST_MODE_KEY, '1');
    const sent: unknown[] = [];
    installMockApi({
      [`GET /api/pos-scan/${KEY}`]: { organizationName: 'Rooman Mart', purpose: 'sale', counterUserName: 'Asha', expiresAt: SESSION.expiresAt },
      [`GET /api/pos-scan/${KEY}/lookup`]: BUTTER,
      [`POST /api/pos-scan/${KEY}/scans`]: (_url: URL, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return { seq: sent.length, code: BUTTER.barcode, quantity: 1 };
      },
    });
    renderPhone();
    await waitFor(() => expect(sent).toEqual([{ code: '8901262150101', quantity: 1 }]));
    expect(screen.queryByRole('region', { name: /scanned item/i })).toBeNull();
    expect(screen.getByRole('button', { name: /fast scan on/i })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/amul butter x 1 sent to the bill/i)).toBeInTheDocument();
  });

  it('on an items link, adds the counted quantity to stock and creates new items with their stock', async () => {
    const stocked: unknown[] = [];
    installMockApi({
      [`GET /api/pos-scan/${KEY}`]: { organizationName: 'Rooman Mart', purpose: 'items', counterUserName: 'Asha', expiresAt: SESSION.expiresAt },
      [`GET /api/pos-scan/${KEY}/lookup`]: BUTTER,
      [`POST /api/pos-scan/${KEY}/stock`]: (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        stocked.push(body);
        return { ...BUTTER, stockOnHand: 10 + body.quantity };
      },
    });
    renderPhone();
    expect(await screen.findByText(/adding items and stock/i)).toBeInTheDocument();
    const card = await screen.findByRole('region', { name: /scanned item/i });
    await userEvent.clear(within(card).getByLabelText(/how many to add/i));
    await userEvent.type(within(card).getByLabelText(/how many to add/i), '24');
    await userEvent.click(within(card).getByRole('button', { name: /add to stock/i }));
    await waitFor(() => expect(stocked).toEqual([{ code: '8901262150101', quantity: 24 }]));
    expect(await screen.findByText(/amul butter \+24 added \(stock now 34\)/i)).toBeInTheDocument();
  });

  it('on an items link, a new barcode is created with its cost and opening stock', async () => {
    scanned.code = '8906001234567';
    const created: unknown[] = [];
    installMockApi({
      [`GET /api/pos-scan/${KEY}`]: { organizationName: 'Rooman Mart', purpose: 'items', counterUserName: 'Asha', expiresAt: SESSION.expiresAt },
      [`GET /api/pos-scan/${KEY}/lookup`]: () =>
        new Response(JSON.stringify({ detail: 'No item with this barcode' }), { status: 404, headers: { 'content-type': 'application/json' } }),
      [`POST /api/pos-scan/${KEY}/items`]: (_url: URL, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        created.push(body);
        return { ...BUTTER, id: 'n2', name: body.name, barcode: body.barcode, stockOnHand: body.openingStock };
      },
    });
    renderPhone();
    const form = await screen.findByRole('form', { name: /new item/i });
    await userEvent.type(within(form).getByLabelText(/item name/i), 'Masala Chips');
    await userEvent.type(within(form).getByLabelText(/^price/i), '20');
    await userEvent.type(within(form).getByLabelText(/cost price/i), '14');
    await userEvent.type(within(form).getByLabelText(/how many on the shelf/i), '48');
    await userEvent.click(within(form).getByRole('button', { name: /create item/i }));
    await waitFor(() =>
      expect(created).toEqual([{ barcode: '8906001234567', name: 'Masala Chips', sellingPrice: 20, taxRate: 0, unit: 'pcs', costPrice: 14, openingStock: 48 }]),
    );
    expect(await screen.findByText(/masala chips created \(stock 48\)/i)).toBeInTheDocument();
  });

  it('takes a Bluetooth / USB scanner on the counter even when nobody clicked into the barcode box', async () => {
    installMockApi({ 'GET /api/pos/lookup': BUTTER });
    renderWithProviders(<PosPage />);
    await screen.findByRole('button', { name: /use phone as scanner/i });
    (document.activeElement as HTMLElement | null)?.blur();
    // A scanner "types" the code very fast and presses Enter.
    for (const key of '8901262150101') fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(await screen.findByText('Amul Butter')).toBeInTheDocument();
  });
});
