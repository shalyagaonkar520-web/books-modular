import { Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth, RequireGuest, RequireRole } from '@/auth/RouteGuards';
import { AccountingPage } from '@/pages/accounting/AccountingPage';
import { BankingPage } from '@/pages/banking/BankingPage';
import { BillFormPage } from '@/pages/purchases/BillFormPage';
import { BillsPage } from '@/pages/purchases/BillsPage';
import { ContactsPage } from '@/pages/contacts/ContactsPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { ExpensesPage } from '@/pages/purchases/ExpensesPage';
import { InvoiceFormPage } from '@/pages/sales/InvoiceFormPage';
import { InvoiceViewPage } from '@/pages/sales/InvoiceViewPage';
import { InvoicesPage } from '@/pages/sales/InvoicesPage';
import { ItemsPage } from '@/pages/items/ItemsPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PaymentsMadePage } from '@/pages/purchases/PaymentsMadePage';
import { PaymentsReceivedPage } from '@/pages/sales/PaymentsReceivedPage';
import { PayrollPage } from '@/pages/payroll/PayrollPage';
import { ProfilePage } from '@/pages/settings/ProfilePage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { TimeTrackingPage } from '@/pages/timetracking/TimeTrackingPage';

export function App() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Routes>
        <Route element={<RequireGuest />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="items" element={<ItemsPage />} />

            <Route path="customers" element={<ContactsPage type="customer" />} />
            <Route path="vendors" element={<ContactsPage type="vendor" />} />

            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/new" element={<InvoiceFormPage />} />
            <Route path="invoices/:invoiceId" element={<InvoiceViewPage />} />
            <Route path="invoices/:invoiceId/edit" element={<InvoiceFormPage />} />
            <Route path="payments-received" element={<PaymentsReceivedPage />} />

            <Route path="bills" element={<BillsPage />} />
            <Route path="bills/new" element={<BillFormPage />} />
            <Route path="bills/:billId/edit" element={<BillFormPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="payments-made" element={<PaymentsMadePage />} />

            <Route path="banking" element={<BankingPage />} />
            <Route path="time-tracking" element={<TimeTrackingPage />} />
            <Route path="accounting" element={<AccountingPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="payroll" element={<PayrollPage />} />

            <Route path="profile" element={<ProfilePage />} />
            <Route
              path="settings"
              element={
                <RequireRole roles={['admin']}>
                  <SettingsPage />
                </RequireRole>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
