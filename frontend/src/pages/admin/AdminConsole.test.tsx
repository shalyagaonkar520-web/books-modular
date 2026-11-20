import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChangeEntry } from '@/api/adminConsole';
import { installMockApi } from '@/test/mockApi';
import { renderWithProviders, testUser } from '@/test/renderWithProviders';
import { InviteUserModal } from '@/pages/settings/InviteUserModal';
import { ResetPasswordModal } from '@/pages/settings/ResetPasswordModal';
import { ReviewsPage } from '@/pages/reviews/ReviewsPage';
import { SupportPage } from '@/pages/support/SupportPage';

import { AdminConsole } from './AdminConsole';
import { ChangeLogPage } from './ChangeLogPage';
import { SecurityPage } from './SecurityPage';

const change: ChangeEntry = {
  id: 'c1',
  userId: 'u2',
  userName: 'Sam Staff',
  userRole: 'staff',
  action: 'update',
  entityType: 'items',
  entityId: 'i1',
  entityLabel: 'Chai',
  changes: { selling_price: ['50', '51'] },
  createdAt: '2026-10-29T10:00:00Z',
};
const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 25 });

describe('Admin console', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has a tab for every admin area', async () => {
    installMockApi();
    renderWithProviders(
      <Routes>
        <Route path="/admin" element={<AdminConsole />}>
          <Route index element={<p>overview</p>} />
        </Route>
      </Routes>,
      { route: '/admin' },
    );
    const nav = await screen.findByRole('navigation', { name: 'Admin console' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Overview',
      'Users & roles',
      'Change log',
      'Security',
      'Plan',
      'Organization',
      'App content',
      'Connect to Mobile',
      'Activity',
    ]);
  });

  it('shows every change with its old and new value, even ₹1', async () => {
    const { calls } = installMockApi({
      'GET /api/users': [testUser],
      'GET /api/admin/changes/types': ['items'],
      'GET /api/admin/changes': page([change]),
    });
    renderWithProviders(<ChangeLogPage />);
    expect(await screen.findByText('Sam Staff')).toBeInTheDocument();
    expect(screen.getByText('Selling price')).toBeInTheDocument();
    expect(screen.getByText('50')).toHaveClass('change-old');
    expect(screen.getByText('51')).toHaveClass('change-new');
    fireEvent.change(screen.getByLabelText('Record'), { target: { value: 'items' } });
    await waitFor(() => expect(calls.some((c) => c.path === '/api/admin/changes' && c.method === 'GET')).toBe(true));
  });

  it('lists sign-ins and signs a user out everywhere', async () => {
    const { calls } = installMockApi({
      'GET /api/users': [testUser],
      'GET /api/admin/security/summary': { signInsToday: 3, failedToday: 1, failedLast7Days: 2, signedInSessions: 1, usersSignedIn: 1 },
      'GET /api/admin/security/sessions': [
        {
          id: 's1',
          userId: 'u2',
          userName: 'Sam Staff',
          userEmail: 'sam@example.com',
          userRole: 'staff',
          ipAddress: '10.0.0.5',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0',
          createdAt: '2026-10-29T10:00:00Z',
          expiresAt: '2026-11-29T10:00:00Z',
        },
      ],
      'GET /api/admin/security/logins': page([
        { id: 'l1', userId: 'u2', userName: 'Sam Staff', email: 'sam@example.com', success: false, reason: 'Wrong password', createdAt: '2026-10-29T09:00:00Z' },
      ]),
      'POST /api/admin/security/users/u2/sign-out': { message: 'Sam Staff is signed out everywhere.' },
    });
    renderWithProviders(<SecurityPage />);
    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
    expect(await screen.findByText('Wrong password')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/admin/security/users/u2/sign-out')).toBe(true));
  });

  it('a reviewer invite needs whose work they review', async () => {
    const { calls } = installMockApi({
      'GET /api/users': [testUser, { ...testUser, id: 'u2', name: 'Sam Staff', role: 'staff' }],
      'GET /api/roles': [],
      'POST /api/users': (_url: URL, init: RequestInit) => ({ ...testUser, id: 'u3', ...JSON.parse(String(init.body)) }),
    });
    renderWithProviders(<InviteUserModal onClose={() => undefined} onInvited={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'reviewer' } });
    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: 'Rita Reviewer' } });
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'rita@example.com' } });
    const send = screen.getByRole('button', { name: /Send invite/ });
    expect(send).toBeDisabled();
    fireEvent.click(await screen.findByRole('switch', { name: 'Review Staff' }));
    fireEvent.click(await screen.findByRole('switch', { name: 'Review Sam Staff' }));
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/api/users')?.body).toMatchObject({
      role: 'reviewer',
      reviewScope: ['role:staff', 'user:u2'],
    }));
  });

  it('reviews: approve, hold, or send the maker a message', async () => {
    const { calls } = installMockApi({
      'GET /api/reviews/summary': { waiting: 1, hold: 0, flagged: 0, reviewed: 0, scope: ['Staff (role)'] },
      'GET /api/reviews': page([change]),
      'POST /api/reviews/c1': { ...change, reviewStatus: 'flagged' },
    });
    renderWithProviders(<ReviewsPage />);
    expect(await screen.findByText(/You review the work of Staff \(role\)/)).toBeInTheDocument();
    expect(screen.getByText(/Is this correct\?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hold' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Send message' }));
    const dialog = await screen.findByRole('dialog');
    const flag = within(dialog).getByRole('button', { name: 'Send message' });
    expect(flag).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Price should be 12' } });
    fireEvent.click(flag);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.path === '/api/reviews/c1')?.body).toEqual({ status: 'flagged', note: 'Price should be 12' }),
    );
  });

  it('support shows reviewer messages about my work, and I can reply', async () => {
    const { calls } = installMockApi({
      'POST /api/reviews/mine/c1/reply': { ...change },
      'GET /api/reviews/mine': page([{ ...change, reviewStatus: 'flagged', reviewNote: 'Price should be 12', reviewedByName: 'Rita' }]),
      'GET /api/support/requests': [],
    });
    renderWithProviders(<SupportPage />);
    expect(await screen.findByText('Reviewer messages about my work')).toBeInTheDocument();
    expect(screen.getByText('Price should be 12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reply to Rita' }));
    fireEvent.change(screen.getByLabelText('Your answer to Rita'), { target: { value: 'Fixed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(calls.find((c) => c.path === '/api/reviews/mine/c1/reply')?.body).toEqual({ message: 'Fixed' }));
    expect(await screen.findByRole('button', { name: /New request/ })).toBeInTheDocument();
  });

  it("resets a user's password with the password in the request body", async () => {
    const { calls } = installMockApi({ 'POST /api/users/u2/reset-password': { message: 'ok' } });
    renderWithProviders(<ResetPasswordModal user={{ ...testUser, id: 'u2', name: 'Cash Counter' }} onClose={() => undefined} />);
    const dialog = await screen.findByRole('dialog');
    const [password, confirm] = within(dialog).getAllByLabelText(/password/i).filter((el) => el.tagName === 'INPUT');
    fireEvent.change(password, { target: { value: 'Test1Pass!x' } });
    fireEvent.change(confirm, { target: { value: 'Test1Pass!x' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.path === '/api/users/u2/reset-password')?.body).toEqual({ newPassword: 'Test1Pass!x' }),
    );
  });
});
