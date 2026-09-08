import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { AuthProvider } from '@/auth/AuthContext';
import { ToastProvider } from '@/components/ui/Toast';
import type { AuthResponse, Organization, User } from '@/api/types';

export const testUser: User = {
  id: 'u1',
  name: 'Khadar Basha',
  email: 'khadar@example.com',
  role: 'admin',
  isActive: true,
  organizationId: 'org1',
  lastLoginAt: '2026-09-08T04:00:00Z',
  createdAt: '2026-04-01T04:00:00Z',
};

export const testOrganization: Organization = {
  id: 'org1',
  name: 'Rooman Technologies',
  legalName: 'Rooman Technologies Pvt Ltd',
  gstin: '29ABCDE1234F1Z5',
  pan: 'ABCDE1234F',
  email: 'accounts@example.com',
  phone: '+91 80 1234 5678',
  address: '1 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'India',
  currency: 'INR',
  fiscalYearStartMonth: 4,
  invoiceTerms: null,
  invoiceNotes: null,
};

export const authResponse: AuthResponse = {
  accessToken: 'test-access-token',
  tokenType: 'bearer',
  expiresIn: 1800,
  user: testUser,
  organization: testOrganization,
};

export function renderWithProviders(ui: ReactElement, { route = '/', ...options }: RenderOptions & { route?: string } = {}) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
  return render(ui, { wrapper: Wrapper, ...options });
}
