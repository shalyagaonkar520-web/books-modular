import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMockApi, page } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

// The camera itself cannot run in tests: the scanner "sees" a code as soon as it starts.
vi.mock('@/pages/pos/useBarcodeScanner', async () => {
  const { useCallback, useRef } = await import('react');
  return {
    useBarcodeScanner: (onCode: (code: string) => void) => {
      const onCodeRef = useRef(onCode);
      onCodeRef.current = onCode;
      const start = useCallback(async () => {
        onCodeRef.current('8901030865101');
      }, []);
      return {
        videoRef: { current: null },
        start,
        stop: () => undefined,
        active: false,
        starting: false,
        error: null,
        torchAvailable: false,
        torchOn: false,
        toggleTorch: async () => undefined,
      };
    },
  };
});

import { ItemFormPage } from './ItemFormPage';

describe('ItemFormPage barcode scanning', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fills the Barcode box from the camera and saves it', async () => {
    let sent: { barcode?: string | null } = {};
    installMockApi({
      'GET /api/accounting/accounts': [],
      'GET /api/contacts': page([]),
      'POST /api/items': (_url: URL, init: RequestInit) => {
        sent = JSON.parse(String(init.body));
        return { id: 'it9', name: 'Shampoo', sku: 'SHA-1', barcode: sent.barcode };
      },
    });
    renderWithProviders(<ItemFormPage />);
    await userEvent.type(await screen.findByLabelText(/^name/i), 'Shampoo');
    await userEvent.type(screen.getByLabelText(/^sku/i), 'SHA-1');
    await userEvent.click(screen.getByRole('button', { name: /scan with camera/i }));
    await waitFor(() => expect(screen.getByLabelText(/^barcode/i)).toHaveValue('8901030865101'));
    // The dialog closes by itself once a code is read.
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /create item/i }));
    await waitFor(() => expect(sent.barcode).toBe('8901030865101'));
  });
});
