import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DashboardSummary } from '@/api/types';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { DashboardPage } from './DashboardPage';

const emptySummary: DashboardSummary = {
  receivables: { totalUnpaidInvoices: 0, currentAmount: 0, overdueAmount: 0, totalReceivables: 0 },
  payables: { totalUnpaidBills: 0, currentAmount: 0, overdueAmount: 0, totalPayables: 0 },
  cashFlow: {
    period: 'this_fiscal_year',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    openingBalance: 0,
    incomingAmount: 0,
    outgoingAmount: 0,
    netCashFlow: 0,
    closingBalance: 0,
    breakdown: [],
  },
  incomeExpense: { startDate: '2026-04-01', endDate: '2027-03-31', totalIncome: 0, totalExpense: 0, net: 0, breakdown: [] },
  inventory: { totalItemsCount: 0, goodsCount: 0, serviceCount: 0, trackedCount: 0, totalInventoryValuation: 0, lowStockItemsCount: 0 },
  bankBalances: [],
  totalCash: 0,
  topCustomers: [],
  recentActivity: [],
  unbilledHours: 0,
  unbilledAmount: 0,
};

const populatedSummary: DashboardSummary = {
  ...emptySummary,
  receivables: { totalUnpaidInvoices: 3, currentAmount: 40000, overdueAmount: 15400, totalReceivables: 55400 },
  payables: { totalUnpaidBills: 2, currentAmount: 30000, overdueAmount: 10120, totalPayables: 40120 },
  cashFlow: {
    ...emptySummary.cashFlow,
    openingBalance: 100000,
    incomingAmount: 22000,
    outgoingAmount: 44500,
    netCashFlow: -22500,
    closingBalance: 77500,
    breakdown: [
      { label: 'Apr 26', start: '2026-04-01', end: '2026-04-30', incoming: 0, outgoing: 0 },
      { label: 'Sep 26', start: '2026-09-01', end: '2026-09-30', incoming: 22000, outgoing: 44500 },
    ],
  },
  incomeExpense: {
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    totalIncome: 60000,
    totalExpense: 41000,
    net: 19000,
    breakdown: [{ label: 'Sep 26', start: '2026-09-01', end: '2026-09-30', incoming: 60000, outgoing: 41000 }],
  },
  inventory: { totalItemsCount: 4, goodsCount: 3, serviceCount: 1, trackedCount: 2, totalInventoryValuation: 143600, lowStockItemsCount: 1 },
  bankBalances: [{ bankAccountId: 'b1', name: 'Operating Account', type: 'bank', balance: 77500 }],
  totalCash: 77500,
  topCustomers: [{ contactId: 'c1', contactName: 'Acme Ltd', amount: 55400 }],
  recentActivity: [
    { id: 'i1', type: 'invoice', number: 'INV-00001', contactName: 'Acme Ltd', date: '2026-09-01', amount: 35400, status: 'partially_paid' },
    { id: 'e1', type: 'expense', number: 'EXP-00001', contactName: 'Rent Expense', date: '2026-09-03', amount: 29500, status: null },
  ],
  unbilledHours: 6.5,
  unbilledAmount: 13000,
};

describe('DashboardPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tells the user their books are empty instead of showing invented figures', async () => {
    installMockApi({
      'GET /api/dashboard/summary': emptySummary,
      'GET /api/dashboard/notifications': { items: [], count: 0 },
    });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/your books are empty/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add a customer/i })).toHaveAttribute('href', '/customers?new=1');
    // Zeros are shown as zeros, never as sample data.
    expect(screen.getAllByText('₹0.00').length).toBeGreaterThan(0);
  });

  it('renders real receivables, payables, cash flow and activity from the API', async () => {
    installMockApi({
      'GET /api/dashboard/summary': populatedSummary,
      'GET /api/dashboard/notifications': { items: [], count: 0 },
    });

    renderWithProviders(<DashboardPage />);

    // The receivables total appears in both the stat tile and the receivables card.
    expect((await screen.findAllByText('₹55,400.00')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹40,120.00').length).toBeGreaterThan(0);
    expect(screen.getByText('3 unpaid invoice(s)')).toBeInTheDocument();
    expect(screen.getByText('2 unpaid bill(s)')).toBeInTheDocument();
    expect(screen.queryByText(/your books are empty/i)).not.toBeInTheDocument();

    // Cash position and closing balance
    expect(screen.getAllByText('₹77,500.00').length).toBeGreaterThan(0);

    // Recent activity is listed with its status
    expect(screen.getByText('INV-00001')).toBeInTheDocument();
    expect(screen.getByText('EXP-00001')).toBeInTheDocument();
    expect(screen.getByText('Partially paid')).toBeInTheDocument();

    // Inventory and unbilled time
    expect(screen.getByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('6.5')).toBeInTheDocument();
  });

  it('reloads the summary when the period changes', async () => {
    const { calls } = installMockApi({
      'GET /api/dashboard/summary': populatedSummary,
      'GET /api/dashboard/notifications': { items: [], count: 0 },
    });

    renderWithProviders(<DashboardPage />);
    await screen.findAllByText('₹55,400.00');

    const select = screen.getByLabelText<HTMLSelectElement>('Period', { selector: 'select' }) ?? screen.getByRole('combobox');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(select, { target: { value: 'this_month' } });

    await waitFor(() => {
      expect(calls.filter((call) => call.path === '/api/dashboard/summary').length).toBeGreaterThan(1);
    });
  });

  it('surfaces a loading failure with a retry action', async () => {
    installMockApi({
      'GET /api/dashboard/summary': new Response(JSON.stringify({ detail: 'Database is unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
      'GET /api/dashboard/notifications': { items: [], count: 0 },
    });

    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText('Database is unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
