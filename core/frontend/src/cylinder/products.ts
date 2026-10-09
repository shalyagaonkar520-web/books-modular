/** The Rooman One products shown on the card cylinder, with honest status. */

export type ProductStatus = 'live' | 'soon' | 'planned';

export interface Product {
  key: string;
  name: string;
  tagline: string;
  points: string[];
  status: ProductStatus;
  /** two light-pool colours for the card art */
  colors: [string, string];
  /** 24x24 line icon */
  icon: string;
}

export const STATUS_LABEL: Record<ProductStatus, string> = { live: 'Available now', soon: 'Coming soon', planned: 'Planned' };

export const PRODUCTS: Product[] = [
  {
    key: 'books',
    name: 'Books',
    tagline: 'Accounting, GST and payroll',
    points: ['GST invoices, e-Way Bill, UPI QR', 'Banking, ledger and reports', 'Payroll and staff payslips'],
    status: 'live',
    colors: ['#007AFF', '#00C7BE'],
    icon: 'M5 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H5zM19 7v13M8 8h6M8 12h6',
  },
  {
    key: 'bookings',
    name: 'Bookings',
    tagline: 'Appointments, paid online',
    points: ['Staff, services and availability', 'Public booking page', 'Paid visits invoiced in Books'],
    status: 'soon',
    colors: ['#34C759', '#00C7BE'],
    icon: 'M4 6h16v14H4zM4 10h16M9 3v5M15 3v5M8 14h3',
  },
  {
    key: 'billing',
    name: 'Billing',
    tagline: 'Subscriptions for your customers',
    points: ['Plans, usage and renewals', 'Reminders and retries', 'Every charge lands in Books'],
    status: 'planned',
    colors: ['#FF3B30', '#FF9500'],
    icon: 'M4 7h16v11H4zM4 11h16M8 15h3M17 3l3 4M7 3 4 7',
  },
  {
    key: 'crm',
    name: 'CRM',
    tagline: 'Leads, deals and follow-ups',
    points: ['One customer list for every app', 'Invoices and bookings per customer', 'Workflow rules across apps'],
    status: 'planned',
    colors: ['#AF52DE', '#5856D6'],
    icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 6.5a3 3 0 0 1 0 5.6M18 14.6c1.8.6 3 2.4 3 5.4',
  },
  {
    key: 'events',
    name: 'Events',
    tagline: 'Events, tickets and check-in',
    points: ['Event pages and ticketing', 'Attendees in your customer list', 'Ticket sales posted to Books'],
    status: 'planned',
    colors: ['#FF2D55', '#AF52DE'],
    icon: 'M4 8a2 2 0 0 0 0 4v6h16v-6a2 2 0 0 1 0-4V4H4zM14 4v3M14 10v2M14 15v3',
  },
  {
    key: 'analytics',
    name: 'Analytics',
    tagline: 'Dashboards across every app',
    points: ['Revenue, bookings and receivables', 'Data at most 5 minutes old', 'Built from events, never live databases'],
    status: 'planned',
    colors: ['#FFCC00', '#FF9500'],
    icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  },
];
