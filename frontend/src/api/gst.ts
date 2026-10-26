/** GST returns (GSTR-1, GSTR-3B), the TDS / TCS register, e-invoice and e-way bill. */
import { api, downloadFile } from './client';

type Query = Record<string, string | number | boolean | undefined | null>;

const qs = (query: Query) =>
  Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

export interface SectionSummary {
  count: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface Gstr1Summary {
  period: { start: string; end: string };
  summary: Record<'b2b' | 'b2cl' | 'b2cs' | 'exp' | 'cdnr' | 'cdnur' | 'b2cs_credit', SectionSummary>;
  warnings: string[];
  json: { gstin: string; fp: string; hsn: { hsn_b2b: HsnRow[]; hsn_b2c: HsnRow[] } };
}

export interface HsnRow {
  num: number;
  hsn_sc: string;
  uqc: string;
  qty: number;
  rt: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
}

export interface TaxHeads {
  taxable?: number;
  igst: number;
  cgst: number;
  sgst: number;
}

export interface Gstr3b {
  period: { start: string; end: string };
  outward: { taxable: TaxHeads; zeroRated: TaxHeads; nilExempt: TaxHeads; inwardReverseCharge: TaxHeads };
  interStateUnregistered: Array<{ pos: string; state: string; taxable: number; igst: number }>;
  itc: { reverseCharge: TaxHeads; allOther: TaxHeads; reversed: TaxHeads; net: TaxHeads };
  exemptInward: number;
  payment: { creditUsed: TaxHeads; cashPayable: TaxHeads; creditCarriedForward: TaxHeads; reverseChargeCash: TaxHeads };
}

export interface TdsRegister {
  period: { start: string; end: string };
  tds: Array<{ billId: string; date: string; billNumber: string; vendorName: string; vendorPan?: string | null; section: string; rate: number; taxable: number; tds: number }>;
  tdsBySection: Array<{ section: string; taxable: number; tds: number }>;
  tdsTotal: number;
  tcs: Array<{ invoiceId: string; date: string; invoiceNumber: string; customerName: string; customerPan?: string | null; rate: number; tcs: number }>;
  tcsTotal: number;
  missingPan: string[];
}

export interface GstRegistration {
  irn?: string | null;
  irnAckNo?: string | null;
  irnAckDate?: string | null;
  ewayBillNo?: string | null;
}

export const gstApi = {
  gstr1: (query: Query) => api.get<Gstr1Summary>('/gst/gstr1', query),
  gstr3b: (query: Query) => api.get<Gstr3b>('/gst/gstr3b', query),
  tdsRegister: (query: Query) => api.get<TdsRegister>('/gst/tds-register', query),
  downloadGstr1: (query: Query, format: 'json' | 'xlsx') => downloadFile(`/gst/gstr1?${qs({ ...query, format })}`, `GSTR1.${format}`),
  downloadGstr3b: (query: Query) => downloadFile(`/gst/gstr3b?${qs({ ...query, format: 'json' })}`, 'GSTR3B.json'),
  downloadTds: (query: Query) => downloadFile(`/gst/tds-register?${qs({ ...query, format: 'xlsx' })}`, 'TDS_TCS.xlsx'),
  downloadEinvoice: (invoiceId: string, number: string) => downloadFile(`/gst/invoices/${invoiceId}/einvoice`, `EINV_${number}.json`),
  downloadEway: (invoiceId: string, number: string, query: Query) => downloadFile(`/gst/invoices/${invoiceId}/eway-bill?${qs(query)}`, `EWB_${number}.json`),
  register: (invoiceId: string, body: GstRegistration) => api.put<GstRegistration>(`/gst/invoices/${invoiceId}/registration`, body),
};
