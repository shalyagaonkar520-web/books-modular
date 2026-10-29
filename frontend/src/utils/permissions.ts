/**
 * Custom roles: which feature each page belongs to, so a custom-role user sees
 * only what their role gives View or Edit on. Feature keys mirror
 * backend/services/permissions.py, which enforces the same rules on the API.
 */
export type AccessLevel = 'none' | 'view' | 'edit';
export type Permissions = Record<string, AccessLevel>;

/** Page prefix -> feature key. Pages not listed (dashboard, profile, settings) are not role-controlled. */
const ROUTE_FEATURES: Array<[string, string]> = [
  ['/customers', 'customers'],
  ['/vendors', 'customers'],
  ['/quotes', 'quotes'],
  ['/sales-orders', 'salesOrders'],
  ['/delivery-challans', 'deliveryChallans'],
  ['/invoices', 'invoices'],
  ['/recurring-invoices', 'recurring'],
  ['/recurring-bills', 'recurring'],
  ['/recurring-journals', 'recurring'],
  ['/credit-notes', 'creditNotes'],
  ['/payments-received', 'paymentsReceived'],
  ['/refunds', 'refunds'],
  ['/pos', 'pos'],
  ['/purchase-orders', 'purchaseOrders'],
  ['/bills', 'bills'],
  ['/vendor-credits', 'vendorCredits'],
  ['/payments-made', 'paymentsMade'],
  ['/expenses', 'expenses'],
  ['/expense-dashboard', 'expenses'],
  ['/items', 'items'],
  ['/inventory', 'inventory'],
  ['/banking', 'banking'],
  ['/razorpay-payments', 'razorpay'],
  ['/financial-dashboard', 'financialHub'],
  ['/receivables-payables', 'receivablesPayables'],
  ['/accounting', 'accounting'],
  ['/fixed-assets', 'fixedAssets'],
  ['/budgets', 'budgets'],
  ['/gst-filing', 'gst'],
  ['/income-tax', 'incomeTax'],
  ['/reports', 'reports'],
  ['/insights', 'insights'],
  ['/ai-assistant', 'ai'],
  ['/time-tracking', 'timeTracking'],
  ['/documents', 'documents'],
  ['/payroll', 'payroll'],
  ['/automation', 'automation'],
];

export function featureForPath(pathname: string): string | null {
  const hit = ROUTE_FEATURES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}

export function accessFor(permissions: Permissions | null | undefined, feature: string | null): AccessLevel {
  if (!feature) return 'view';
  return permissions?.[feature] ?? 'none';
}
