/**
 * The books on the landing page shelf: one per feature of Rooman Books,
 * grouped into shelves (the tabs above it). Opening a book explains it.
 */
import {
  BarChart3,
  Boxes,
  Building2,
  FileText,
  Landmark,
  Receipt,
  ScanBarcode,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  Workflow,
  BookOpen,
  Globe2,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';

export type ShelfKey = 'sales' | 'purchases' | 'accounting' | 'compliance' | 'team';

export const SHELVES: Array<{ key: ShelfKey; label: string }> = [
  { key: 'sales', label: 'Sales' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'compliance', label: 'GST & Tax' },
  { key: 'team', label: 'Team & Admin' },
];

/** Cover colours: background, ink (title and art) and accent. Cobalt, vermilion, ink and cream, like screen prints. */
export type CoverLook = { bg: string; ink: string; accent: string };
const LOOKS: CoverLook[] = [
  { bg: '#1F3FB0', ink: '#F4F2ED', accent: '#E4572E' },
  { bg: '#F1E9D8', ink: '#141414', accent: '#1F3FB0' },
  { bg: '#E4572E', ink: '#F4F2ED', accent: '#141414' },
  { bg: '#141414', ink: '#F1E9D8', accent: '#E4572E' },
];

export interface FeatureBook {
  id: string;
  shelf: ShelfKey;
  title: string;
  /** One line under the title: what it is for. */
  tagline: string;
  icon: LucideIcon;
  summary: string;
  points: string[];
  look: CoverLook;
}

const BOOKS: Array<Omit<FeatureBook, 'look'>> = [
  {
    id: 'invoices',
    shelf: 'sales',
    title: 'Invoices & Quotes',
    tagline: 'Bill customers the GST way',
    icon: FileText,
    summary:
      'Raise GST-ready invoices in seconds, from a quote or sales order, and send them by email or a share link. Every invoice posts to your accounts on its own.',
    points: [
      'Quotes, sales orders, delivery challans and credit notes',
      'Recurring invoices that go out on schedule',
      'PDF copies marked Original, Duplicate and Triplicate',
      'Customer statements and payment reminders',
    ],
  },
  {
    id: 'pos',
    shelf: 'sales',
    title: 'Point of Sale',
    tagline: 'Fast billing at the counter',
    icon: ScanBarcode,
    summary:
      'A counter screen for shops: scan items, take cash, UPI or card, and print the receipt. Each sale is a paid invoice in your books, and returns become credit notes.',
    points: [
      'Use a phone as the barcode scanner, just scan a QR code',
      'Cash, UPI and card payments',
      'Stock goes down as you sell',
      'Sales never count twice, even on a weak connection',
    ],
  },
  {
    id: 'razorpay',
    shelf: 'sales',
    title: 'Online Payments',
    tagline: 'Razorpay, matched to invoices',
    icon: Wallet,
    summary:
      'Let customers pay invoices online through Razorpay. Payments, fees, refunds and settlements come into your books by themselves and are matched to the right invoice.',
    points: [
      'Pay-now button on every invoice',
      'Automatic sync of payments, refunds and settlements',
      'Rules that sort payments into the right account',
      'Reconciliation of Razorpay against your bank',
    ],
  },
  {
    id: 'portal',
    shelf: 'sales',
    title: 'Customer Portal',
    tagline: 'Share documents by link',
    icon: Globe2,
    summary:
      'Send a customer one link to view, download and pay an invoice or accept a quote, with no login needed.',
    points: ['Invoices and quotes open in any browser', 'Customers download the PDF or pay online', 'No account or password for your customer'],
  },
  {
    id: 'bills',
    shelf: 'purchases',
    title: 'Bills & Purchases',
    tagline: 'Pay vendors on time',
    icon: ShoppingCart,
    summary:
      'Track what you buy, from purchase order to vendor bill to payment, and always know what you owe and when it is due.',
    points: [
      'Purchase orders, bills, vendor credits and payments made',
      'Recurring bills for rent and subscriptions',
      'Alerts for duplicate bills and unusual amounts',
      'Payables ageing by vendor',
    ],
  },
  {
    id: 'expenses',
    shelf: 'purchases',
    title: 'Expenses',
    tagline: 'Every rupee spent, recorded',
    icon: Receipt,
    summary: 'Record day-to-day spending with the receipt attached, and see where the money goes by category and project.',
    points: ['Attach receipts and documents', 'Categories that post to the right accounts', 'Expenses by project and branch'],
  },
  {
    id: 'inventory',
    shelf: 'purchases',
    title: 'Inventory',
    tagline: 'Stock you can trust',
    icon: Boxes,
    summary:
      'Keep a live count of every item as you buy and sell, with its value on your balance sheet. Adjust stock, track serial numbers and import your catalogue from Excel.',
    points: ['Items, prices and HSN / SAC codes', 'Stock adjustments and serial numbers', 'Low-stock view and inventory valuation', 'Bulk import from Excel'],
  },
  {
    id: 'banking',
    shelf: 'accounting',
    title: 'Banking',
    tagline: 'Reconcile in minutes',
    icon: Landmark,
    summary:
      'Bring in your bank statements and match each line to invoices, bills and expenses, so your books agree with the bank.',
    points: ['Bank and cash accounts', 'Statement import and matching', 'Transfers between accounts', 'Cash-flow view across accounts'],
  },
  {
    id: 'accountant',
    shelf: 'accounting',
    title: 'Accountant',
    tagline: 'Double-entry, done right',
    icon: BookOpen,
    summary:
      'A full double-entry ledger underneath everything, with the tools an accountant expects: journals, chart of accounts, fixed assets and budgets.',
    points: [
      'Chart of accounts, manual and recurring journals',
      'Fixed assets with depreciation',
      'Budgets against actuals',
      'Multiple currencies and branches',
    ],
  },
  {
    id: 'reports',
    shelf: 'accounting',
    title: 'Reports',
    tagline: 'Know where you stand',
    icon: BarChart3,
    summary:
      'Profit and loss, balance sheet, cash flow, receivables and payables ageing and more, ready at any moment and easy to export.',
    points: ['Financial statements for any period', 'Ageing, sales and purchase reports', 'Export to Excel and PDF', 'Scheduled report emails'],
  },
  {
    id: 'insights',
    shelf: 'accounting',
    title: 'Insights & AI',
    tagline: 'Ask your books a question',
    icon: Sparkles,
    summary:
      'An AI assistant that answers questions about your business in plain words, plus alerts that spot what needs your attention.',
    points: ['Ask "who owes me the most?" and get the answer', 'Duplicate-bill and unusual-amount alerts', 'Customer credit-risk scores', 'A daily digest email'],
  },
  {
    id: 'gst',
    shelf: 'compliance',
    title: 'GST Returns',
    tagline: 'GSTR-1, 3B and 2B',
    icon: ScrollText,
    summary:
      'Your GST returns are built from the invoices and bills you already have. Check them, reconcile with GSTR-2B and file with confidence.',
    points: ['GSTR-1 and GSTR-3B summaries', 'GSTR-2B reconciliation', 'e-Way bill register and delivery challans', 'HSN summary'],
  },
  {
    id: 'tds',
    shelf: 'compliance',
    title: 'TDS & Income Tax',
    tagline: 'Withholding without the worry',
    icon: Building2,
    summary: 'Deduct TDS on bills and payments at the right rates, and keep the records your income tax return needs.',
    points: ['TDS on bills and payments', 'TDS reports by section', 'Income tax (ITR) helper'],
  },
  {
    id: 'payroll',
    shelf: 'team',
    title: 'Payroll',
    tagline: 'Pay your people',
    icon: Users,
    summary:
      'Run salaries, generate payslips and post payroll to your accounts. Employees see their payslips, leave and timesheets in their own portal.',
    points: ['Employees, salary structures and payslips', 'Employee portal for payslips and leave', 'Time tracking and projects'],
  },
  {
    id: 'automation',
    shelf: 'team',
    title: 'Automation',
    tagline: 'Let the routine run itself',
    icon: Workflow,
    summary:
      'Rules that act when something happens, approvals before money moves, and connections to your other apps.',
    points: ['Workflow rules and email alerts', 'Approvals and reviewers (maker and checker)', 'Custom fields', 'API keys and webhooks for other apps'],
  },
  {
    id: 'admin',
    shelf: 'team',
    title: 'Admin & Security',
    tagline: 'Control who sees what',
    icon: ShieldCheck,
    summary:
      'Give each person exactly the access they need, see every change ever made, and sign out a lost device in one click.',
    points: [
      'Roles and custom roles: no access, view or edit per feature',
      'A change log of every field',
      'Login history and active sessions',
      'Plans by users, with storage for your documents',
    ],
  },
];

export const FEATURE_BOOKS: FeatureBook[] = BOOKS.map((book, i) => ({ ...book, look: LOOKS[i % LOOKS.length] }));
