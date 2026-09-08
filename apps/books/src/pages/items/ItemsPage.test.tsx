import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Account, Item } from '@/api/types';
import { installMockApi, page } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { ItemsPage } from './ItemsPage';

const trackedItem: Item = {
  id: 'it1',
  name: '27 inch Monitor',
  type: 'goods',
  sku: 'MON-27',
  unit: 'pcs',
  hsnSac: '8528',
  taxRate: 18,
  description: 'IPS panel with USB-C',
  imageUrl: null,
  sellingPrice: 10000,
  salesAccountId: null,
  salesAccountName: 'Sales',
  salesDescription: null,
  costPrice: 7000,
  purchaseAccountId: null,
  purchaseAccountName: 'Cost of Goods Sold',
  purchaseDescription: null,
  preferredVendorId: null,
  preferredVendorName: null,
  trackInventory: true,
  openingStock: 20,
  openingStockRate: 7000,
  stockOnHand: 3,
  reorderLevel: 5,
  warehouseLocation: 'Main store',
  isActive: true,
  createdAt: '2026-09-01T04:00:00Z',
  updatedAt: '2026-09-01T04:00:00Z',
};

const serviceItem: Item = {
  ...trackedItem,
  id: 'it2',
  name: 'Consulting',
  type: 'service',
  sku: 'SRV-CON',
  unit: 'hrs',
  sellingPrice: 2500,
  costPrice: 0,
  trackInventory: false,
  openingStock: 0,
  openingStockRate: 0,
  stockOnHand: 0,
  reorderLevel: 0,
  description: null,
};

const accounts: Account[] = [
  { id: 'a1', code: '4000', name: 'Sales', type: 'income', subtype: 'sales', description: null, isSystem: true, isActive: true, balance: 0 },
  { id: 'a2', code: '5000', name: 'Cost of Goods Sold', type: 'expense', subtype: 'cogs', description: null, isSystem: true, isActive: true, balance: 0 },
];

const inventorySummary = {
  rows: [],
  totalItems: 2,
  trackedItems: 1,
  lowStockItems: 1,
  totalStockValue: 21000,
};

function baseRoutes(items: Item[] = [trackedItem, serviceItem]) {
  return {
    'GET /api/items': page(items),
    'GET /api/reports/inventory-summary': inventorySummary,
    'GET /api/accounting/accounts': accounts,
    'GET /api/contacts': page([]),
    'GET /api/inventory-adjustments': page([]),
  };
}

describe('ItemsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists items from the API with their prices and stock state', async () => {
    installMockApi(baseRoutes());

    renderWithProviders(<ItemsPage />);

    expect(await screen.findByText('27 inch Monitor')).toBeInTheDocument();
    expect(screen.getByText('MON-27')).toBeInTheDocument();
    expect(screen.getByText('₹10,000.00')).toBeInTheDocument();
    expect(screen.getByText('₹7,000.00')).toBeInTheDocument();
    expect(screen.getByText('Consulting')).toBeInTheDocument();
    // Three on hand against a reorder level of five is a low-stock warning.
    expect(screen.getByText(/3 pcs/i)).toBeInTheDocument();
    // Services never show a stock figure.
    expect(screen.getAllByText(/not tracked/i).length).toBeGreaterThan(0);
  });

  it('shows an empty state rather than sample rows when there are no items', async () => {
    installMockApi({ ...baseRoutes([]), 'GET /api/items': page([]) });

    renderWithProviders(<ItemsPage />);

    expect(await screen.findByText(/no items/i)).toBeInTheDocument();
    expect(screen.queryByText('27 inch Monitor')).not.toBeInTheDocument();
  });

  it('passes the search term to the API', async () => {
    const { calls } = installMockApi(baseRoutes());

    renderWithProviders(<ItemsPage />);
    await screen.findByText('27 inch Monitor');

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'monitor' } });

    await waitFor(
      () => {
        expect(calls.some((call) => call.path === '/api/items' && call.method === 'GET')).toBe(true);
      },
      { timeout: 2000 },
    );
  });

  it('surfaces a load failure with a retry action', async () => {
    installMockApi({
      ...baseRoutes(),
      'GET /api/items': new Response(JSON.stringify({ detail: 'Items are temporarily unavailable' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    });

    renderWithProviders(<ItemsPage />);

    expect(await screen.findByText('Items are temporarily unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
