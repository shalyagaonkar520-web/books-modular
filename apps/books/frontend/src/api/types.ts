/** Types mirroring the FastAPI response models (camelCase over the wire). */

/**
 * "employee" is a restricted portal-only role: an invited Payroll employee
 * who can see only their own payslips and profile, and nothing else in the
 * app - not the main dashboard, not other employees, not company financials.
 */
export type Role = 'admin' | 'staff' | 'viewer' | 'employee';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  organizationId: string;
  lastLoginAt?: string | null;
  createdAt: string;
}

/** What the accept-invite page shows before asking the invitee to set a password. */
export interface InviteInfo {
  name: string;
  email: string;
  organizationName: string;
}

export interface Organization {
  id: string;
  name: string;
  legalName?: string | null;
  gstin?: string | null;
  pan?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country: string;
  currency: string;
  fiscalYearStartMonth: number;
  invoiceTerms?: string | null;
  invoiceNotes?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
  organization: Organization;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Message {
  message: string;
}

export type ItemType = 'goods' | 'service';

export interface Item {
  id: string;
  name: string;
  type: ItemType;
  sku: string;
  unit: string;
  hsnSac?: string | null;
  taxRate: number;
  description?: string | null;
  imageUrl?: string | null;
  sellingPrice: number;
  salesAccountId?: string | null;
  salesAccountName?: string | null;
  salesDescription?: string | null;
  costPrice: number;
  purchaseAccountId?: string | null;
  purchaseAccountName?: string | null;
  purchaseDescription?: string | null;
  preferredVendorId?: string | null;
  preferredVendorName?: string | null;
  trackInventory: boolean;
  openingStock: number;
  openingStockRate: number;
  stockOnHand: number;
  reorderLevel: number;
  warehouseLocation?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAdjustment {
  id: string;
  adjustmentNumber: string;
  itemId: string;
  itemName: string;
  date: string;
  quantityDelta: number;
  reason: string;
  notes?: string | null;
  createdAt: string;
}

export type ContactType = 'customer' | 'vendor';
export type GstTreatment = 'registered_business' | 'unregistered' | 'consumer' | 'overseas' | 'sez';

export interface Contact {
  id: string;
  type: ContactType;
  displayName: string;
  companyName?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  pan?: string | null;
  gstTreatment: GstTreatment;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  paymentTermsDays: number;
  notes?: string | null;
  isActive: boolean;
  outstandingBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactSummary {
  contact: Contact;
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  overdue: number;
  documentCount: number;
}

export interface DocumentLine {
  id?: string;
  position?: number;
  itemId?: string | null;
  accountId?: string | null;
  description: string;
  quantity: number;
  rate: number;
  taxRate: number;
  amount?: number;
  taxAmount?: number;
  itemName?: string | null;
  accountName?: string | null;
}

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void' | 'overdue';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
  customerGstin?: string | null;
  customerBillingAddress?: string | null;
  projectId?: string | null;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  reference?: string | null;
  subtotal: number;
  discountAmount: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  notes?: string | null;
  terms?: string | null;
  sentAt?: string | null;
  lines: DocumentLine[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  total: number;
  amountPaid: number;
  balanceDue: number;
  reference?: string | null;
}

export interface DocumentStats {
  totalOutstanding: number;
  overdue: number;
  dueWithin30Days: number;
  draftCount: number;
  unpaidCount: number;
  overdueCount: number;
}

export type PaymentMode = 'cash' | 'bank_transfer' | 'upi' | 'cheque' | 'card' | 'other';

export interface CustomerPayment {
  id: string;
  paymentNumber: string;
  customerId: string;
  customerName: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  bankAccountId: string;
  bankAccountName: string;
  date: string;
  amount: number;
  mode: PaymentMode;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
}

export type BillStatus = 'draft' | 'open' | 'partially_paid' | 'paid' | 'void' | 'overdue';

export interface Bill {
  id: string;
  billNumber: string;
  vendorBillNumber?: string | null;
  vendorId: string;
  vendorName: string;
  date: string;
  dueDate: string;
  status: BillStatus;
  subtotal: number;
  discountAmount: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  notes?: string | null;
  lines: DocumentLine[];
  createdAt: string;
  updatedAt: string;
}

export interface BillListItem {
  id: string;
  billNumber: string;
  vendorBillNumber?: string | null;
  vendorId: string;
  vendorName: string;
  date: string;
  dueDate: string;
  status: BillStatus;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

export interface VendorPayment {
  id: string;
  paymentNumber: string;
  vendorId: string;
  vendorName: string;
  billId?: string | null;
  billNumber?: string | null;
  bankAccountId: string;
  bankAccountName: string;
  date: string;
  amount: number;
  mode: PaymentMode;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface Expense {
  id: string;
  expenseNumber: string;
  date: string;
  accountId: string;
  accountName: string;
  paidThroughAccountId: string;
  paidThroughName: string;
  vendorId?: string | null;
  vendorName?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  amount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  reference?: string | null;
  notes?: string | null;
  isBillable: boolean;
  createdAt: string;
}

export type BankAccountType = 'bank' | 'cash' | 'credit_card';

export interface BankAccount {
  id: string;
  name: string;
  type: BankAccountType;
  bankName?: string | null;
  accountNumberMasked?: string | null;
  ifsc?: string | null;
  currency: string;
  openingBalance: number;
  openingBalanceDate: string;
  currentBalance: number;
  unreconciledCount: number;
  isActive: boolean;
  isPrimary: boolean;
  ledgerAccountId: string;
  createdAt: string;
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  bankAccountName: string;
  date: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  description: string;
  reference?: string | null;
  sourceType: string;
  sourceId?: string | null;
  counterAccountId?: string | null;
  counterAccountName?: string | null;
  isReconciled: boolean;
  reconciledAt?: string | null;
  runningBalance?: number | null;
  createdAt: string;
}

export interface BankingSummary {
  totalBalance: number;
  accounts: BankAccount[];
  unreconciledCount: number;
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype?: string | null;
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
  balance: number;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description?: string | null;
  debit: number;
  credit: number;
  contactId?: string | null;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  reference?: string | null;
  notes?: string | null;
  sourceType: string;
  sourceId?: string | null;
  isReversal: boolean;
  total: number;
  lines: JournalLine[];
  createdAt: string;
}

export interface LedgerLine {
  date: string;
  entryId: string;
  entryNumber: string;
  sourceType: string;
  reference?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface LedgerReport {
  account: Account;
  startDate?: string | null;
  endDate?: string | null;
  openingBalance: number;
  lines: LedgerLine[];
  closingBalance: number;
}

export interface TrialBalance {
  asOf: string;
  rows: Array<{ accountId: string; code: string; name: string; type: AccountType; debit: number; credit: number }>;
  totalDebit: number;
  totalCredit: number;
}

export interface Project {
  id: string;
  name: string;
  customerId?: string | null;
  customerName?: string | null;
  description?: string | null;
  billingMethod: 'hourly' | 'fixed';
  hourlyRate: number;
  budgetHours: number;
  status: 'active' | 'completed' | 'on_hold';
  loggedHours: number;
  billableHours: number;
  unbilledHours: number;
  unbilledAmount: number;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  projectName: string;
  customerName?: string | null;
  userId: string;
  userName: string;
  date: string;
  hours: number;
  description?: string | null;
  isBillable: boolean;
  invoiceId?: string | null;
  createdAt: string;
}

export interface StoredDocument {
  id: string;
  title: string;
  category: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  notes?: string | null;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
  uploadedBy?: string | null;
  uploadedByName?: string | null;
  createdAt: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  email?: string | null;
  designation?: string | null;
  department?: string | null;
  dateOfJoining: string;
  pan?: string | null;
  bankAccountNumberMasked?: string | null;
  bankIfsc?: string | null;
  basicSalary: number;
  hra: number;
  otherAllowances: number;
  pfEmployee: number;
  professionalTax: number;
  tds: number;
  grossSalary: number;
  netSalary: number;
  isActive: boolean;
  createdAt: string;
  /** Whether this employee already has (or has been invited to) portal access. */
  hasLogin: boolean;
}

/** A salary-free row for the "which employee is this?" invite picker. */
export interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
  email?: string | null;
}

export interface Payslip {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation?: string | null;
  department?: string | null;
  pan?: string | null;
  bankAccountNumberMasked?: string | null;
  basicSalary: number;
  hra: number;
  otherAllowances: number;
  gross: number;
  pfEmployee: number;
  professionalTax: number;
  tds: number;
  lossOfPayDays: number;
  lossOfPayAmount: number;
  totalDeductions: number;
  netPay: number;
}

export interface PayRun {
  id: string;
  periodYear: number;
  periodMonth: number;
  periodLabel: string;
  status: 'draft' | 'approved' | 'paid';
  payDate?: string | null;
  bankAccountId?: string | null;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
  payslips: Payslip[];
  createdAt: string;
}

export interface ReportLine {
  accountId?: string | null;
  code?: string | null;
  name: string;
  amount: number;
}

export interface ReportSection {
  title: string;
  lines: ReportLine[];
  total: number;
}

export interface ProfitAndLoss {
  startDate: string;
  endDate: string;
  income: ReportSection;
  costOfGoodsSold: ReportSection;
  grossProfit: number;
  operatingExpenses: ReportSection;
  operatingProfit: number;
  otherIncome: ReportSection;
  netProfit: number;
}

export interface BalanceSheet {
  asOf: string;
  assets: ReportSection;
  liabilities: ReportSection;
  equity: ReportSection;
  currentPeriodEarnings: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

export interface AgingReport {
  asOf: string;
  rows: Array<{
    contactId: string;
    contactName: string;
    current: number;
    days1To30: number;
    days31To60: number;
    days61To90: number;
    daysOver90: number;
    total: number;
  }>;
  buckets: Array<{ label: string; amount: number; count: number }>;
  total: number;
}

export interface ContactTotalsReport {
  startDate: string;
  endDate: string;
  rows: Array<{ contactId: string; contactName: string; documentCount: number; amount: number; amountPaid: number; balance: number }>;
  total: number;
}

export interface ExpenseByCategoryReport {
  startDate: string;
  endDate: string;
  rows: Array<{ accountId: string; accountName: string; count: number; amount: number }>;
  total: number;
}

export interface InventorySummaryReport {
  rows: Array<{
    itemId: string;
    name: string;
    sku: string;
    unit: string;
    stockOnHand: number;
    reorderLevel: number;
    costPrice: number;
    stockValue: number;
    isLowStock: boolean;
  }>;
  totalItems: number;
  trackedItems: number;
  lowStockItems: number;
  totalStockValue: number;
}

export interface TaxSummary {
  startDate: string;
  endDate: string;
  outputGst: number;
  inputGst: number;
  netPayable: number;
  taxableSales: number;
  taxablePurchases: number;
}

export type DashboardPeriod = 'this_fiscal_year' | 'last_fiscal_year' | 'this_quarter' | 'this_month' | 'last_month';

export interface PeriodBreakdown {
  label: string;
  start: string;
  end: string;
  incoming: number;
  outgoing: number;
}

export interface DashboardSummary {
  receivables: { totalUnpaidInvoices: number; currentAmount: number; overdueAmount: number; totalReceivables: number };
  payables: { totalUnpaidBills: number; currentAmount: number; overdueAmount: number; totalPayables: number };
  cashFlow: {
    period: string;
    startDate: string;
    endDate: string;
    openingBalance: number;
    incomingAmount: number;
    outgoingAmount: number;
    netCashFlow: number;
    closingBalance: number;
    breakdown: PeriodBreakdown[];
  };
  incomeExpense: {
    startDate: string;
    endDate: string;
    totalIncome: number;
    totalExpense: number;
    net: number;
    breakdown: PeriodBreakdown[];
  };
  inventory: {
    totalItemsCount: number;
    goodsCount: number;
    serviceCount: number;
    trackedCount: number;
    totalInventoryValuation: number;
    lowStockItemsCount: number;
  };
  bankBalances: Array<{ bankAccountId: string; name: string; type: string; balance: number }>;
  totalCash: number;
  topCustomers: Array<{ contactId: string; contactName: string; amount: number }>;
  recentActivity: Array<{ id: string; type: string; number: string; contactName?: string | null; date: string; amount: number; status?: string | null }>;
  unbilledHours: number;
  unbilledAmount: number;
}

export interface NotificationItem {
  id: string;
  kind: 'overdue_invoice' | 'overdue_bill' | 'low_stock' | 'unreconciled';
  title: string;
  body: string;
  entityType: string;
  entityId?: string | null;
  severity: 'info' | 'warning' | 'danger';
}

export interface Notifications {
  items: NotificationItem[];
  count: number;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  device: string;
  browser: string;
  ipAddress?: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface ExcelCategorizeSection {
  category: string;
  sheet_name: string;
  headers: string[];
  count: number;
  rows: Array<Record<string, unknown>>;
}

export interface ExcelCategorizeResponse {
  filename: string;
  total_sheets: number;
  total_rows: number;
  sections: ExcelCategorizeSection[];
}

export interface ExcelCommitResponse {
  success: boolean;
  imported_counts: Record<string, number>;
  message: string;
}

