import { Navigate, Route, Routes } from 'react-router-dom';

import { PlatformAuthProvider } from '@/auth/PlatformAuthContext';
import { PlatformApp } from '@/pages/platform/PlatformApp';
import { AppLayout } from '@/components/layout/AppLayout';
import { ModuleGuard } from '@/app/ModuleGuard';
import { RequireAuth, RequireEmployeePortal, RequireGuest, RequireMainApp, RequireRole } from '@/auth/RouteGuards';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';
import { EmployeePortalPage } from '@/pages/portal/EmployeePortalPage';
import { AccountingPage } from '@/pages/accounting/AccountingPage';
import { FinancialDashboardPage } from '@/pages/financial/FinancialDashboardPage';
import { ReceivablesPayablesDashboard } from '@/pages/financial/ReceivablesPayablesDashboard';
import { RazorpayPaymentsPage } from '@/pages/payments/RazorpayPaymentsPage';
import { BankingPage } from '@/pages/banking/BankingPage';
import { BillFormPage } from '@/pages/purchases/BillFormPage';
import { BillsPage } from '@/pages/purchases/BillsPage';
import { ContactsPage } from '@/pages/contacts/ContactsPage';
import { ContactFormPage } from '@/pages/contacts/ContactFormPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { DocumentsPage } from '@/pages/documents/DocumentsPage';
import { ExpenseDashboardPage } from '@/pages/expenses/ExpenseDashboardPage';
import { ExpensesPage } from '@/pages/purchases/ExpensesPage';
import { InvoiceFormPage } from '@/pages/sales/InvoiceFormPage';
import { InvoiceViewPage } from '@/pages/sales/InvoiceViewPage';
import { InvoicesPage } from '@/pages/sales/InvoicesPage';
import { ItemsPage } from '@/pages/items/ItemsPage';
import { ItemFormPage } from '@/pages/items/ItemFormPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { LandingPage } from '@/pages/Landing/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PaymentsMadePage } from '@/pages/purchases/PaymentsMadePage';
import { PaymentsReceivedPage } from '@/pages/sales/PaymentsReceivedPage';
import { PayrollPage } from '@/pages/payroll/PayrollPage';
import { ProfilePage } from '@/pages/settings/ProfilePage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { ReportsPage } from '@/pages/reports/ReportsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { TimeTrackingPage } from '@/pages/timetracking/TimeTrackingPage';
import { OrgAdminApp } from '@/pages/orgadmin/OrgAdminApp';
import { DocumentFormPage } from '@/pages/docflow/DocumentFormPage';
import { DocumentListPage } from '@/pages/docflow/DocumentListPage';
import { DocumentViewPage } from '@/pages/docflow/DocumentViewPage';
import { RecurringProfilesPage } from '@/pages/docflow/RecurringProfilesPage';
import { RefundsPage } from '@/pages/docflow/RefundsPage';
import { GstFilingPage } from '@/pages/gst/GstFilingPage';
import { BudgetsPage } from '@/pages/accounting/BudgetsPage';
import { FixedAssetsPage } from '@/pages/accounting/FixedAssetsPage';
import { InventoryPage } from '@/pages/inventory/InventoryPage';
import { SubscriptionPage } from '@/pages/subscription/SubscriptionPage';

export function App() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Routes>
        {/* Separate, self-contained platform operator console with its own auth.
            Only this subtree is wrapped in PlatformAuthProvider. */}
        <Route
          path="/platform/*"
          element={
            <PlatformAuthProvider>
              <PlatformApp />
            </PlatformAuthProvider>
          }
        />

        {/* The organization admin panel: separate logins created by the platform
            administrator, with its own session provider inside OrgAdminApp.
            Needs no tenant session. */}
        <Route path="/org-admin/*" element={<OrgAdminApp />} />

        {/* Aliases for admin panel */}
        <Route path="/admin" element={<Navigate to="/platform" replace />} />
        <Route path="/admin/*" element={<Navigate to="/platform" replace />} />
        <Route path="/admin-panel" element={<Navigate to="/platform" replace />} />
        <Route path="/admin-panel/*" element={<Navigate to="/platform" replace />} />
        <Route path="/adminpanel" element={<Navigate to="/platform" replace />} />
        <Route path="/adminpanel/*" element={<Navigate to="/platform" replace />} />
        <Route path="/superadmin" element={<Navigate to="/platform" replace />} />
        <Route path="/superadmin/*" element={<Navigate to="/platform" replace />} />

        {/* Always public — the landing page */}
        <Route path="/" element={<LandingPage />} />

        {/* Auth pages — only for guests (redirect to /dashboard if already logged in) */}
        <Route element={<RequireGuest />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
        </Route>

        {/* Protected app routes — redirect to / if not logged in */}
        <Route element={<RequireAuth />}>
          {/* Employee is a portal-only role; every other route below redirects it to /portal instead */}
          <Route element={<RequireEmployeePortal />}>
            <Route path="/portal" element={<EmployeePortalPage />} />
          </Route>

          <Route element={<RequireMainApp />}>
            <Route element={<AppLayout />}>
            {/* Trial and plan: never module-guarded (admins manage, everyone else reads). */}
            <Route path="/subscription" element={<SubscriptionPage />} />
            <Route element={<ModuleGuard />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/new" element={<ItemFormPage />} />
            <Route path="/items/:itemId/edit" element={<ItemFormPage />} />
            <Route path="/inventory" element={<InventoryPage />} />

            <Route path="/customers" element={<ContactsPage type="customer" />} />
            <Route path="/customers/new" element={<ContactFormPage type="customer" />} />
            <Route path="/customers/:contactId/edit" element={<ContactFormPage type="customer" />} />
            <Route path="/vendors" element={<ContactsPage type="vendor" />} />
            <Route path="/vendors/new" element={<ContactFormPage type="vendor" />} />
            <Route path="/vendors/:contactId/edit" element={<ContactFormPage type="vendor" />} />

            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/invoices/new" element={<InvoiceFormPage />} />
            <Route path="/invoices/:invoiceId" element={<InvoiceViewPage />} />
            <Route path="/invoices/:invoiceId/edit" element={<InvoiceFormPage />} />
            <Route path="/payments-received" element={<PaymentsReceivedPage />} />
            <Route path="/quotes" element={<DocumentListPage key="estimate" kind="estimate" />} />
            <Route path="/quotes/new" element={<DocumentFormPage key="estimate-new" kind="estimate" />} />
            <Route path="/quotes/:docId" element={<DocumentViewPage key="estimate-view" kind="estimate" />} />
            <Route path="/quotes/:docId/edit" element={<DocumentFormPage key="estimate-edit" kind="estimate" />} />
            <Route path="/sales-orders" element={<DocumentListPage key="sales_order" kind="sales_order" />} />
            <Route path="/sales-orders/new" element={<DocumentFormPage key="sales_order-new" kind="sales_order" />} />
            <Route path="/sales-orders/:docId" element={<DocumentViewPage key="sales_order-view" kind="sales_order" />} />
            <Route path="/sales-orders/:docId/edit" element={<DocumentFormPage key="sales_order-edit" kind="sales_order" />} />
            <Route path="/credit-notes" element={<DocumentListPage key="credit_note" kind="credit_note" />} />
            <Route path="/credit-notes/new" element={<DocumentFormPage key="credit_note-new" kind="credit_note" />} />
            <Route path="/credit-notes/:docId" element={<DocumentViewPage key="credit_note-view" kind="credit_note" />} />
            <Route path="/credit-notes/:docId/edit" element={<DocumentFormPage key="credit_note-edit" kind="credit_note" />} />
            <Route path="/recurring-invoices" element={<RecurringProfilesPage key="invoice" kind="invoice" />} />
            <Route path="/refunds" element={<RefundsPage />} />

            <Route path="/bills" element={<BillsPage />} />
            <Route path="/bills/new" element={<BillFormPage />} />
            <Route path="/bills/:billId/edit" element={<BillFormPage />} />
            <Route path="/expense-dashboard" element={<ExpenseDashboardPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/payments-made" element={<PaymentsMadePage />} />
            <Route path="/purchase-orders" element={<DocumentListPage key="purchase_order" kind="purchase_order" />} />
            <Route path="/purchase-orders/new" element={<DocumentFormPage key="purchase_order-new" kind="purchase_order" />} />
            <Route path="/purchase-orders/:docId" element={<DocumentViewPage key="purchase_order-view" kind="purchase_order" />} />
            <Route path="/purchase-orders/:docId/edit" element={<DocumentFormPage key="purchase_order-edit" kind="purchase_order" />} />
            <Route path="/vendor-credits" element={<DocumentListPage key="vendor_credit" kind="vendor_credit" />} />
            <Route path="/vendor-credits/new" element={<DocumentFormPage key="vendor_credit-new" kind="vendor_credit" />} />
            <Route path="/vendor-credits/:docId" element={<DocumentViewPage key="vendor_credit-view" kind="vendor_credit" />} />
            <Route path="/vendor-credits/:docId/edit" element={<DocumentFormPage key="vendor_credit-edit" kind="vendor_credit" />} />
            <Route path="/recurring-bills" element={<RecurringProfilesPage key="bill" kind="bill" />} />

            <Route
              path="/financial-dashboard"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <FinancialDashboardPage />
                </RequireRole>
              }
            />
            <Route path="/receivables-payables" element={<ReceivablesPayablesDashboard />} />
            <Route
              path="/banking"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <BankingPage />
                </RequireRole>
              }
            />
            <Route
              path="/razorpay-payments"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <RazorpayPaymentsPage />
                </RequireRole>
              }
            />
            <Route path="/time-tracking" element={<TimeTrackingPage />} />
            <Route path="/gst-filing" element={<GstFilingPage />} />
            <Route
              path="/fixed-assets"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <FixedAssetsPage />
                </RequireRole>
              }
            />
            <Route
              path="/budgets"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <BudgetsPage />
                </RequireRole>
              }
            />
            <Route
              path="/recurring-journals"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <RecurringProfilesPage key="journal" kind="journal" />
                </RequireRole>
              }
            />
            <Route
              path="/accounting"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <AccountingPage />
                </RequireRole>
              }
            />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route
              path="/payroll"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <PayrollPage />
                </RequireRole>
              }
            />


            <Route path="/profile" element={<ProfilePage />} />
            <Route
              path="/settings"
              element={
                <RequireRole roles={['admin']}>
                  <SettingsPage />
                </RequireRole>
              }
            />
            </Route>
          </Route>
          </Route>
        </Route>

        {/* Anything else → landing */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
