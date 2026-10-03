import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMockApi } from '@/test/mockApi';
import { renderWithProviders, testOrganization } from '@/test/renderWithProviders';

import { SettingsPage } from './SettingsPage';

describe('SettingsPage (tenant app)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('only edits the organization profile: users, integrations and the activity log live in the org admin panel', async () => {
    const { calls } = installMockApi({ 'GET /api/organization': testOrganization });
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByDisplayValue(testOrganization.name)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Invite user')).not.toBeInTheDocument();
    expect(calls.some((call) => call.path === '/api/users' || call.path.startsWith('/api/razorpay') || call.path === '/api/audit-logs')).toBe(
      false,
    );
  });
});
