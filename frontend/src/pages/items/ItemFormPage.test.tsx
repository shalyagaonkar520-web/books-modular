import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMockApi, page } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { ItemFormPage } from './ItemFormPage';

describe('ItemFormPage barcode', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends the barcode typed (or scanned with a USB scanner) on the item', async () => {
    let sent: { barcode?: string | null; sku?: string } = {};
    installMockApi({
      'GET /api/accounting/accounts': [],
      'GET /api/contacts': page([]),
      'POST /api/items': (_url: URL, init: RequestInit) => {
        sent = JSON.parse(String(init.body));
        return { id: 'it1', name: 'Amul Butter', sku: sent.sku, barcode: sent.barcode };
      },
    });
    renderWithProviders(<ItemFormPage />);
    await userEvent.type(await screen.findByLabelText(/^name/i), 'Amul Butter');
    await userEvent.type(screen.getByLabelText(/^sku/i), 'BUT-100');
    await userEvent.type(screen.getByLabelText(/^barcode/i), ' 8901262150101 ');
    await userEvent.click(screen.getByRole('button', { name: /create item/i }));
    await waitFor(() => expect(sent.barcode).toBe('8901262150101'));
  });

  it('sends no barcode when the field is left empty', async () => {
    let sent: { barcode?: string | null } = { barcode: 'unset' };
    installMockApi({
      'GET /api/accounting/accounts': [],
      'GET /api/contacts': page([]),
      'POST /api/items': (_url: URL, init: RequestInit) => {
        sent = JSON.parse(String(init.body));
        return { id: 'it2', name: 'Loose rice', sku: 'RICE-1', barcode: null };
      },
    });
    renderWithProviders(<ItemFormPage />);
    await userEvent.type(await screen.findByLabelText(/^name/i), 'Loose rice');
    await userEvent.type(screen.getByLabelText(/^sku/i), 'RICE-1');
    await userEvent.click(screen.getByRole('button', { name: /create item/i }));
    await waitFor(() => expect(sent.barcode).toBeNull());
  });
});
