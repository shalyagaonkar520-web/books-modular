import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
    return (_jsxs(_Fragment, { children: [_jsx("a", { href: "#main-content", className: "skip-link", children: "Skip to main content" }), _jsxs(Routes, { children: [_jsxs(Route, { element: _jsx(RequireGuest, {}), children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/register", element: _jsx(RegisterPage, {}) })] }), _jsx(Route, { element: _jsx(RequireAuth, {}), children: _jsxs(Route, { element: _jsx(AppLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "items", element: _jsx(ItemsPage, {}) }), _jsx(Route, { path: "customers", element: _jsx(ContactsPage, { type: "customer" }) }), _jsx(Route, { path: "vendors", element: _jsx(ContactsPage, { type: "vendor" }) }), _jsx(Route, { path: "invoices", element: _jsx(InvoicesPage, {}) }), _jsx(Route, { path: "invoices/new", element: _jsx(InvoiceFormPage, {}) }), _jsx(Route, { path: "invoices/:invoiceId", element: _jsx(InvoiceViewPage, {}) }), _jsx(Route, { path: "invoices/:invoiceId/edit", element: _jsx(InvoiceFormPage, {}) }), _jsx(Route, { path: "payments-received", element: _jsx(PaymentsReceivedPage, {}) }), _jsx(Route, { path: "bills", element: _jsx(BillsPage, {}) }), _jsx(Route, { path: "bills/new", element: _jsx(BillFormPage, {}) }), _jsx(Route, { path: "bills/:billId/edit", element: _jsx(BillFormPage, {}) }), _jsx(Route, { path: "expenses", element: _jsx(ExpensesPage, {}) }), _jsx(Route, { path: "payments-made", element: _jsx(PaymentsMadePage, {}) }), _jsx(Route, { path: "banking", element: _jsx(BankingPage, {}) }), _jsx(Route, { path: "time-tracking", element: _jsx(TimeTrackingPage, {}) }), _jsx(Route, { path: "accounting", element: _jsx(AccountingPage, {}) }), _jsx(Route, { path: "reports", element: _jsx(ReportsPage, {}) }), _jsx(Route, { path: "documents", element: _jsx(DocumentsPage, {}) }), _jsx(Route, { path: "payroll", element: _jsx(PayrollPage, {}) }), _jsx(Route, { path: "profile", element: _jsx(ProfilePage, {}) }), _jsx(Route, { path: "settings", element: _jsx(RequireRole, { roles: ['admin'], children: _jsx(SettingsPage, {}) }) }), _jsx(Route, { path: "*", element: _jsx(NotFoundPage, {}) })] }) })] })] }));
}
