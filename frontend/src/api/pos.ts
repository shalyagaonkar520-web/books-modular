/** Point of Sale: the counter screen's calls (backend/routers/pos.py). */
import { api } from './client';

export type PosMode = 'cash' | 'upi' | 'card';

export interface PosItem {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  unit: string;
  sellingPrice: number;
  taxRate: number;
  hsnSac?: string | null;
  trackInventory: boolean;
  stockOnHand: number;
  reorderLevel: number;
  imageUrl?: string | null;
}

export interface PosSaleCreate {
  clientSaleId: string;
  lines: Array<{ itemId: string; quantity: number }>;
  paymentMode: PosMode;
  amountTendered?: number | null;
  discountAmount?: number;
  reference?: string | null;
  customerId?: string | null;
  date?: string;
}

export interface PosSaleLine {
  itemId?: string | null;
  name: string;
  quantity: number;
  returnedQuantity: number;
  rate: number;
  taxRate: number;
  amount: number;
  taxAmount: number;
}

export interface PosReturnSummary {
  creditNoteId: string;
  creditNoteNumber: string;
  date: string;
  total: number;
  refundNumber?: string | null;
}

export interface PosReceipt {
  organizationName: string;
  gstin?: string | null;
  address?: string | null;
  phone?: string | null;
  header?: string | null;
  footer?: string | null;
}

export interface PosSaleListItem {
  id: string;
  clientSaleId: string;
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  createdAt: string;
  customerName: string;
  mode: PosMode;
  total: number;
  returnedAmount: number;
  itemsCount: number;
  cashierName?: string | null;
}

export interface PosSale extends PosSaleListItem {
  paymentId?: string | null;
  paymentNumber?: string | null;
  subtotal: number;
  discountAmount: number;
  taxTotal: number;
  tendered: number;
  changeDue: number;
  reference?: string | null;
  lines: PosSaleLine[];
  returns: PosReturnSummary[];
  receipt: PosReceipt;
}

export interface PosSummary {
  date: string;
  salesCount: number;
  grossSales: number;
  taxTotal: number;
  returnsTotal: number;
  netSales: number;
  itemsSold: number;
  averageBill: number;
  cashExpected: number;
  byMode: Array<{ mode: PosMode; count: number; total: number; refunds: number }>;
  byCashier: Array<{ cashierId?: string | null; name: string; count: number; total: number }>;
  topItems: Array<{ itemId: string; name: string; quantity: number; amount: number }>;
}

export interface PosSettings {
  bankAccountId: string | null;
  allowNegativeStock: boolean;
  receiptHeader: string | null;
  receiptFooter: string | null;
  bankAccountName?: string | null;
  cashAccountId?: string | null;
  cashAccountName?: string | null;
}

export interface PosReturnCreate {
  clientReturnId: string;
  lines: Array<{ itemId: string; quantity: number }>;
  reason?: string | null;
  date?: string;
}

export interface ScannerSession {
  id: string;
  expiresAt: string;
  connected: boolean;
  counterUserName?: string | null;
  closed: boolean;
}

/** A just-opened session: ``token`` is the secret key for the QR link, shown only now. */
export interface OpenedScannerSession extends ScannerSession {
  token: string;
}

export interface ScanPoll {
  session: ScannerSession;
  scans: Array<{ seq: number; code: string; quantity: number }>;
}

/** The counter's side (signed in). */
export const scannerApi = {
  open: () => api.post<OpenedScannerSession>('/pos/scanner-sessions'),
  qr: (id: string, url: string) => api.get<{ svg: string }>(`/pos/scanner-sessions/${id}/qr`, { url }),
  poll: (id: string, after: number) => api.get<ScanPoll>(`/pos/scanner-sessions/${id}/scans`, { after }),
  close: (id: string) => api.delete<ScannerSession>(`/pos/scanner-sessions/${id}`),
};

export interface PhoneSession {
  organizationName: string;
  counterUserName?: string | null;
  expiresAt: string;
}

export interface PhoneNewItem {
  barcode: string;
  name: string;
  sellingPrice: number;
  taxRate: number;
  unit: string;
}

/** The phone's side: no sign-in, the key in the QR link is the permission. */
export const phoneScanApi = {
  open: (token: string) => api.get<PhoneSession>(`/pos-scan/${encodeURIComponent(token)}`),
  lookup: (token: string, code: string) => api.get<PosItem>(`/pos-scan/${encodeURIComponent(token)}/lookup`, { code }),
  send: (token: string, code: string, quantity: number) =>
    api.post<{ seq: number; code: string; quantity: number }>(`/pos-scan/${encodeURIComponent(token)}/scans`, { code, quantity }),
  newItem: (token: string, body: PhoneNewItem) => api.post<PosItem>(`/pos-scan/${encodeURIComponent(token)}/items`, body),
};

/** The link a phone opens to scan for a counter (also what its QR code holds). */
export function scannerLink(token: string): string {
  return `${window.location.origin}/scan/${token}`;
}

export const posApi = {
  lookup: (code: string) => api.get<PosItem>('/pos/lookup', { code }),
  createSale: (body: PosSaleCreate) => api.post<PosSale>('/pos/sales', body),
  sales: (query: { date?: string; mine?: boolean } = {}) => api.get<PosSaleListItem[]>('/pos/sales', query),
  sale: (id: string) => api.get<PosSale>(`/pos/sales/${id}`),
  returnItems: (id: string, body: PosReturnCreate) => api.post<PosSale>(`/pos/sales/${id}/returns`, body),
  summary: (date?: string) => api.get<PosSummary>('/pos/summary', { date }),
  settings: () => api.get<PosSettings>('/pos/settings'),
  saveSettings: (body: PosSettings) => api.put<PosSettings>('/pos/settings', body),
};

/** An id for a sale or return, made before it is sent so a retry is recognised. */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
