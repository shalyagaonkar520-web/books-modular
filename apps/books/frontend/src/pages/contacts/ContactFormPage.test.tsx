import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockApi } from '@/test/mockApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { ContactFormPage } from './ContactFormPage';

const accounts = [
  { id: 'acc1', code: '1100', name: 'Accounts Receivable', type: 'asset', subtype: 'accounts_receivable', isSystem: true, isActive: true },
];

describe('ContactFormPage', () => {
  beforeEach(() => {
    installMockApi({
      'GET /api/accounting/accounts': accounts,
      'POST /api/contacts': (_url, init) => ({ id: 'c1', displayName: JSON.parse(String(init.body)).displayName }),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders as a full page, not a dialog', async () => {
    renderWithProviders(<ContactFormPage type="customer" />);
    expect(await screen.findByText('New customer')).toBeInTheDocument();
    // A modal would expose role="dialog"; this is a page.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('groups the fields into sections', async () => {
    renderWithProviders(<ContactFormPage type="customer" />);
    expect(await screen.findByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Primary contact')).toBeInTheDocument();
    expect(screen.getByText('Tax and terms')).toBeInTheDocument();
    expect(screen.getByText('Addresses')).toBeInTheDocument();
  });

  it('offers bank details for vendors only', async () => {
    const { unmount } = renderWithProviders(<ContactFormPage type="vendor" />);
    expect(await screen.findByText('Bank details')).toBeInTheDocument();
    expect(screen.getByLabelText(/re-enter account number/i)).toBeInTheDocument();
    unmount();

    renderWithProviders(<ContactFormPage type="customer" />);
    await screen.findByText('Identity');
    expect(screen.queryByText('Bank details')).not.toBeInTheDocument();
  });

  it('refuses to save when the two account numbers differ', async () => {
    renderWithProviders(<ContactFormPage type="vendor" />);
    await screen.findByText('Bank details');

    await userEvent.type(screen.getByLabelText(/display name/i), 'Dell India');
    await userEvent.type(screen.getByLabelText(/^account number/i), '50100123456789');
    await userEvent.type(screen.getByLabelText(/re-enter account number/i), '50100999999999');

    await userEvent.click(screen.getByRole('button', { name: /create vendor/i }));
    // Flagged twice on purpose: inline under the field, and as a toast on the
    // blocked save, so it is caught whether or not the field is in view.
    await waitFor(() => expect(screen.getAllByText(/account numbers do not match/i).length).toBeGreaterThan(0));
  });
});
