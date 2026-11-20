import { Navigate, Route, Routes } from 'react-router-dom';

import { PlatformAuthProvider } from '@/auth/PlatformAuthContext';
import { AppContentPage } from '@/pages/platform/AppContentPage';
import { PlatformApp } from '@/pages/platform/PlatformApp';
import { AppLayout } from '@/components/layout/AppLayout';
import { ModuleGuard } from '@/app/ModuleGuard';
import { RequireAuth, RequireEmployeePortal, RequireGuest, RequireMainApp, RequireRole, RequireWrite } from '@/auth/RouteGuards';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvitePage';
import { EmployeePortalPage } from '@/pages/portal/EmployeePortalPage';
import { AccountingPage } from '@/pages/accounting/AccountingPage';
import { FinancialDashboardPage } from '@/pages/financial/FinancialDashboardPage';
import { ReceivablesPayablesDashboard } from '@/pages/financial/ReceivablesPayablesDashboard';
import { RazorpayPaymentsPage } from '@/pages/payments/RazorpayPaymentsPage';
import { BankingPage } from '@/pages/banking/BankingPage';
import { BankStatementPage } from '@/pages/operations/BankStatementPage';
import { InsightsPage } from '@/pages/insights/InsightsPage';
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
import { PosPage } from '@/pages/pos/PosPage';
import { PosSalesPage } from '@/pages/pos/PosSalesPage';
import { PosSettingsPage } from '@/pages/pos/PosSettingsPage';
import { PhoneScanPage } from '@/pages/pos/PhoneScanPage';
import { PosHelpPage } from '@/pages/pos/PosHelpPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { LandingPage } from '@/pages/Landing/LandingPage';
import { ContactPage, PrivacyPage, RefundPolicyPage, ShippingPolicyPage, TermsPage } from '@/pages/Landing/LegalPages';
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
import {
  AdminActivityPage,
  AdminConsole,
  AdminOrganizationPage,
  AdminPlanPage,
  AdminUsersPage,
} from '@/pages/admin/AdminConsole';
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage';
import { ChangeLogPage } from '@/pages/admin/ChangeLogPage';
import { SecurityPage } from '@/pages/admin/SecurityPage';
import { ReviewsPage } from '@/pages/reviews/ReviewsPage';
import { SupportPage } from '@/pages/support/SupportPage';
import { DocumentFormPage } from '@/pages/docflow/DocumentFormPage';
import { DocumentListPage } from '@/pages/docflow/DocumentListPage';
import { DocumentViewPage } from '@/pages/docflow/DocumentViewPage';
import { RecurringProfilesPage } from '@/pages/docflow/RecurringProfilesPage';
import { RefundsPage } from '@/pages/docflow/RefundsPage';
import { GstFilingPage } from '@/pages/gst/GstFilingPage';
import { IncomeTaxPage } from '@/pages/tax/IncomeTaxPage';
import { BudgetsPage } from '@/pages/accounting/BudgetsPage';
import { FixedAssetsPage } from '@/pages/accounting/FixedAssetsPage';
import { InventoryPage } from '@/pages/inventory/InventoryPage';
import { AutomationPage } from '@/pages/automation/AutomationPage';
import { AiAssistantPage } from '@/pages/ai/AiAssistantPage';
import { DocumentPortalPage } from '@/pages/portal/DocumentPortalPage';
import { SubscriptionPage } from '@/pages/subscription/SubscriptionPage';
import { ConnectMobilePage } from '@/pages/workspace/admin/ConnectMobilePage';
import { ManualHome } from '@/pages/workspace/ManualHome';
import { storedMode } from '@/pages/workspace/ModeSwitch';
import { WorkspaceApp } from '@/pages/workspace/WorkspaceApp';
import { WorkspaceInvitePage } from '@/pages/workspace/WorkspaceInvitePage';
import { useAuth } from '@/auth/AuthContext';

/** "/dashboard" for an AI-workspace employee means their workspace (in the mode they last used). */
function DashboardRoute() {
  const { user } = useAuth();
  if (user?.workspaceEmployee) return <Navigate to={storedMode() === 'manual' ? '/workspace/home' : '/workspace'} replace />;
  return <DashboardPage />;
}

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

        {/* The old separate organization admin panel is now the Admin console inside the app. */}
        <Route path="/org-admin/*" element={<Navigate to="/admin" replace />} />

        {/* Always public — the landing page */}
        <Route path="/" element={<LandingPage />} />
        {/* Policy pages (payment gateways check these exist) */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/shipping-policy" element={<ShippingPolicyPage />} />
        <Route path="/contact" element={<ContactPage />} />
        {/* Customer portal: a shared invoice or quote, opened without logging in */}
        <Route path="/p/:token" element={<DocumentPortalPage />} />
        {/* Phone scanner of a Point of Sale counter: opened from its QR code, no login (the link's key) */}
        <Route path="/scan/:token" element={<PhoneScanPage />} />

        {/* Auth pages — only for guests (redirect to /dashboard if already logged in) */}
        <Route element={<RequireGuest />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/workspace-invite" element={<WorkspaceInvitePage />} />
        </Route>

        {/* Protected app routes — redirect to / if not logged in */}
        <Route element={<RequireAuth />}>
          {/* Employee is a portal-only role; every other route below redirects it to /portal instead */}
          <Route element={<RequireEmployeePortal />}>
            <Route path="/portal" element={<EmployeePortalPage />} />
          </Route>

          {/* The AI workspace (Automatic mode) has its own full-screen layout. */}
          <Route path="/workspace" element={<WorkspaceApp />} />

          <Route element={<RequireMainApp />}>
            <Route element={<AppLayout />}>
            <Route path="/workspace/home" element={<ManualHome />} />
            <Route path="/connect-mobile" element={<Navigate to="/admin/mobile" replace />} />
            {/* Trial and plan: never module-guarded (admins manage, everyone else reads). */}
            <Route path="/subscription" element={<SubscriptionPage />} />
            {/* Support (every role) and the Admin console (admins) stay open even while the plan has run out. */}
            <Route path="/support" element={<SupportPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route
              path="/admin"
              element={
                <RequireRole roles={['admin']}>
                  <AdminConsole />
                </RequireRole>
              }
            >
              <Route index element={<AdminOverviewPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="changes" element={<ChangeLogPage />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="plan" element={<AdminPlanPage />} />
              <Route path="organization" element={<AdminOrganizationPage />} />
              <Route path="app-content" element={<AppContentPage mode="organization" />} />
              <Route path="mobile" element={<ConnectMobilePage />} />
              <Route path="activity" element={<AdminActivityPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
            <Route element={<ModuleGuard />}>
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/new" element={<RequireWrite><ItemFormPage /></RequireWrite>} />
            <Route path="/items/:itemId/edit" element={<ItemFormPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/pos" element={<RequireWrite><PosPage /></RequireWrite>} />
            <Route path="/pos/sales" element={<PosSalesPage />} />
            <Route path="/pos/help" element={<PosHelpPage />} />
            <Route
              path="/pos/settings"
              element={
                <RequireRole roles={['admin']}>
                  <PosSettingsPage />
                </RequireRole>
              }
            />

            <Route path="/customers" element={<ContactsPage type="customer" />} />
            <Route path="/customers/new" element={<RequireWrite><ContactFormPage type="customer" /></RequireWrite>} />
            <Route path="/customers/:contactId/edit" element={<ContactFormPage type="customer" />} />
            <Route path="/vendors" element={<ContactsPage type="vendor" />} />
            <Route path="/vendors/new" element={<RequireWrite><ContactFormPage type="vendor" /></RequireWrite>} />
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
            <Route path="/delivery-challans" element={<DocumentListPage key="delivery_challan" kind="delivery_challan" />} />
            <Route path="/delivery-challans/new" element={<DocumentFormPage key="delivery_challan-new" kind="delivery_challan" />} />
            <Route path="/delivery-challans/:docId" element={<DocumentViewPage key="delivery_challan-view" kind="delivery_challan" />} />
            <Route path="/delivery-challans/:docId/edit" element={<DocumentFormPage key="delivery_challan-edit" kind="delivery_challan" />} />
            <Route path="/credit-notes" element={<DocumentListPage key="credit_note" kind="credit_note" />} />
            <Route path="/credit-notes/new" element={<DocumentFormPage key="credit_note-new" kind="credit_note" />} />
            <Route path="/credit-notes/:docId" element={<DocumentViewPage key="credit_note-view" kind="credit_note" />} />
            <Route path="/credit-notes/:docId/edit" element={<DocumentFormPage key="credit_note-edit" kind="credit_note" />} />
            <Route path="/recurring-invoices" element={<RecurringProfilesPage key="invoice" kind="invoice" />} />
            <Route path="/refunds" element={<RefundsPage />} />

            <Route path="/bills" element={<BillsPage />} />
            <Route path="/bills/new" element={<RequireWrite><BillFormPage /></RequireWrite>} />
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
              path="/banking/:accountId/statement"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <BankStatementPage />
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
            <Route
              path="/gst-filing"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <GstFilingPage />
                </RequireRole>
              }
            />
            <Route path="/income-tax" element={<IncomeTaxPage />} />
            <Route path="/ai-assistant" element={<AiAssistantPage />} />
            <Route
              path="/insights"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <InsightsPage />
                </RequireRole>
              }
            />
            <Route
              path="/automation"
              element={
                <RequireRole roles={['admin', 'viewer']}>
                  <AutomationPage />
                </RequireRole>
              }
            />
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
