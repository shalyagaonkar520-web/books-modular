import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';

import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { Header } from './Header';

const notifications = {
  items: [
    {
      id: 'inv-abc123',
      kind: 'overdue_invoice',
      title: 'Invoice INV-00001 is overdue',
      body: 'Acme Ltd owes 5,000.00, 3 day(s) past due.',
      entityType: 'invoice',
      entityId: 'abc123',
      severity: 'danger',
    },
    {
      id: 'item-xyz789',
      kind: 'low_stock',
      title: 'Monitor is low on stock',
      body: '2 left, reorder level is 5.',
      entityType: 'item',
      entityId: 'xyz789',
      severity: 'warning',
    },
  ],
  count: 2,
};

/** Renders the current path so assertions can prove where a click navigated. */
function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname + useLocation().search}</span>;
}

function renderHeader() {
  return renderWithProviders(
    <>
      <Header onToggleSidebar={() => undefined} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </>,
  );
}

describe('Header notifications', () => {
  beforeEach(() => {
    localStorage.clear();
    installMockApi({ 'GET /api/dashboard/notifications': notifications });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows a count and lists what needs attention', async () => {
    renderHeader();
    const bell = await screen.findByRole('button', { name: /notifications \(2\)/i });
    await userEvent.click(bell);
    expect(await screen.findByText('Invoice INV-00001 is overdue')).toBeInTheDocument();
    expect(screen.getByText('Monitor is low on stock')).toBeInTheDocument();
  });

  it('opens the record the notification is about, not just its list page', async () => {
    renderHeader();
    await userEvent.click(await screen.findByRole('button', { name: /notifications \(2\)/i }));
    await userEvent.click(await screen.findByText('Invoice INV-00001 is overdue'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/invoices/abc123'));
  });

  it('deep-links a low-stock warning to that item', async () => {
    renderHeader();
    await userEvent.click(await screen.findByRole('button', { name: /notifications \(2\)/i }));
    await userEvent.click(await screen.findByText('Monitor is low on stock'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/items?item=xyz789'));
  });

  it('removes a notification once it has been opened, and keeps it gone', async () => {
    renderHeader();
    await userEvent.click(await screen.findByRole('button', { name: /notifications \(2\)/i }));
    await userEvent.click(await screen.findByText('Invoice INV-00001 is overdue'));

    // The bell count drops, and reopening does not bring it back.
    const bell = await screen.findByRole('button', { name: /notifications \(1\)/i });
    await userEvent.click(bell);
    expect(screen.queryByText('Invoice INV-00001 is overdue')).not.toBeInTheDocument();
    expect(screen.getByText('Monitor is low on stock')).toBeInTheDocument();
  });

  it('can dismiss without navigating', async () => {
    renderHeader();
    await userEvent.click(await screen.findByRole('button', { name: /notifications \(2\)/i }));
    await userEvent.click(screen.getByRole('button', { name: /dismiss: invoice inv-00001 is overdue/i }));

    expect(screen.queryByText('Invoice INV-00001 is overdue')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
});
