import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

// The phone page's camera "sees" one code as soon as it starts.
vi.mock('./useBarcodeScanner', async () => {
  const { useCallback, useRef } = await import('react');
  return {
    scanFeedback: () => undefined,
    useBarcodeScanner: (onCode: (code: string) => void) => {
      const onCodeRef = useRef(onCode);
      onCodeRef.current = onCode;
      const start = useCallback(async () => onCodeRef.current('8901262150101'), []);
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
import { OPEN_BILL_KEY, PosPage } from './PosPage';
import { RemoteScannerPage } from './RemoteScannerPage';

const SESSION = { id: 'sess1234', expiresAt: '2026-10-27T22:00:00Z', connected: false, counterUserName: 'Asha', closed: false };
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

describe('phone as scanner', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('shows a QR code on the counter and adds what the phone scans to the bill', async () => {
    let polls = 0;
    let qrUrl = '';
    installMockApi({
      'POST /api/pos/scanner-sessions': SESSION,
      'GET /api/pos/scanner-sessions/sess1234/qr': (url: URL) => {
        qrUrl = url.searchParams.get('url') ?? '';
        return { svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' };
      },
      'GET /api/pos/scanner-sessions/sess1234/scans': (url: URL) => {
        polls += 1;
        const after = Number(url.searchParams.get('after'));
        if (polls < 2) return { session: SESSION, scans: [] };
        return {
          session: { ...SESSION, connected: true, phoneUserName: 'Ravi' },
          scans: after < 1 ? [{ seq: 1, code: '8901262150101' }] : [],
        };
      },
      'GET /api/pos/lookup': BUTTER,
      'DELETE /api/pos/scanner-sessions/sess1234': { ...SESSION, closed: true },
    });
    renderWithProviders(<PosPage />);
    await userEvent.click(await screen.findByRole('button', { name: /use phone as scanner/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('img', { name: /qr code/i })).toBeInTheDocument();
    expect(qrUrl).toMatch(/\/pos\/remote\/sess1234$/);

    // The phone connects and scans: the dialog closes and the item lands on the bill.
    expect(await screen.findByText('Amul Butter', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/phone scanner connected \(ravi\)/i)).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(PHONE_LINK_KEY) ?? '{}').after).toBe(1);
    expect(JSON.parse(sessionStorage.getItem(OPEN_BILL_KEY) ?? '{}').lines[0].quantity).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    await waitFor(() => expect(sessionStorage.getItem(PHONE_LINK_KEY)).toBeNull());
    expect(screen.getByRole('button', { name: /use phone as scanner/i })).toBeInTheDocument();
  });

  it('on the phone, sends what the camera reads to the counter', async () => {
    const sent: string[] = [];
    installMockApi({
      'POST /api/pos/scanner-sessions/sess1234/connect': { ...SESSION, connected: true },
      'POST /api/pos/scanner-sessions/sess1234/scans': (_url: URL, init: RequestInit) => {
        const { code } = JSON.parse(String(init.body));
        sent.push(code);
        return { seq: sent.length, code };
      },
    });
    renderWithProviders(
      <Routes>
        <Route path="/pos/remote/:sessionId" element={<RemoteScannerPage />} />
      </Routes>,
      { route: '/pos/remote/sess1234' },
    );
    expect(await screen.findByText(/counter bill opened by asha/i)).toBeInTheDocument();
    await waitFor(() => expect(sent).toEqual(['8901262150101']));
    expect(await screen.findByText('Sent')).toBeInTheDocument();
    // A code can also be typed.
    await userEvent.type(screen.getByLabelText(/barcode or sku/i), 'SKU-7');
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(sent).toEqual(['8901262150101', 'SKU-7']));
  });

  it('tells the phone when the counter has ended the link', async () => {
    installMockApi({
      'POST /api/pos/scanner-sessions/sess1234/connect': () =>
        new Response(JSON.stringify({ detail: 'This scanner link has ended. Show a new QR code on the counter.' }), {
          status: 410,
          headers: { 'content-type': 'application/json' },
        }),
    });
    renderWithProviders(
      <Routes>
        <Route path="/pos/remote/:sessionId" element={<RemoteScannerPage />} />
      </Routes>,
      { route: '/pos/remote/sess1234' },
    );
    expect(await screen.findByText(/this scanner link has ended/i)).toBeInTheDocument();
  });
});
