/** What differs between quotes, sales orders, delivery challans, credit notes, purchase orders and vendor credits. */
import type { DocKindKey } from '@/api/docFlow';

export type SecondDate = 'expiryDate' | 'shipmentDate' | 'deliveryDate';

export interface DocConfig {
  kind: DocKindKey;
  /** Route prefix, e.g. /quotes. */
  route: string;
  /** Text-key prefix in the app content catalog, e.g. "quotes". */
  texts: string;
  /** Sidebar group it belongs to (for breadcrumbs). */
  group: 'sales' | 'purchases';
  party: 'customer' | 'vendor';
  secondDate?: SecondDate;
  /** List tabs: status filter values ("" = all). */
  tabs: string[];
  /** Status a new document is saved with by the primary button (the secondary one saves a draft). */
  issueStatus: string;
  /** Credit notes and vendor credits: posted, applied and refunded. */
  isCredit: boolean;
  /** Statuses in which the edit form is offered. */
  editable: string[];
  /** Asks why: the reason for a credit, or why goods move on a delivery challan. */
  hasReason: boolean;
  /** Has terms & conditions (credits print a reason instead). */
  hasTerms: boolean;
  hasSalesperson: boolean;
  /** PDF file name prefix. */
  filePrefix: string;
}

export const DOC_CONFIGS: Record<DocKindKey, DocConfig> = {
  estimate: {
    kind: 'estimate',
    route: '/quotes',
    texts: 'quotes',
    group: 'sales',
    party: 'customer',
    secondDate: 'expiryDate',
    tabs: ['', 'draft', 'sent', 'accepted', 'declined', 'expired', 'invoiced'],
    issueStatus: 'sent',
    isCredit: false,
    hasReason: false,
    editable: ['draft', 'sent', 'expired'],
    hasTerms: true,
    hasSalesperson: true,
    filePrefix: 'Quote',
  },
  sales_order: {
    kind: 'sales_order',
    route: '/sales-orders',
    texts: 'salesOrders',
    group: 'sales',
    party: 'customer',
    secondDate: 'shipmentDate',
    tabs: ['', 'draft', 'confirmed', 'invoiced', 'void'],
    issueStatus: 'confirmed',
    isCredit: false,
    hasReason: false,
    editable: ['draft', 'confirmed'],
    hasTerms: true,
    hasSalesperson: true,
    filePrefix: 'SalesOrder',
  },
  delivery_challan: {
    kind: 'delivery_challan',
    route: '/delivery-challans',
    texts: 'deliveryChallans',
    group: 'sales',
    party: 'customer',
    tabs: ['', 'draft', 'issued', 'invoiced', 'void'],
    issueStatus: 'issued',
    isCredit: false,
    hasReason: true,
    editable: ['draft', 'issued'],
    hasTerms: true,
    hasSalesperson: false,
    filePrefix: 'DeliveryChallan',
  },
  credit_note: {
    kind: 'credit_note',
    route: '/credit-notes',
    texts: 'creditNotes',
    group: 'sales',
    party: 'customer',
    tabs: ['', 'draft', 'open', 'closed', 'void'],
    issueStatus: 'open',
    isCredit: true,
    hasReason: true,
    editable: ['draft', 'open'],
    hasTerms: false,
    hasSalesperson: false,
    filePrefix: 'CreditNote',
  },
  purchase_order: {
    kind: 'purchase_order',
    route: '/purchase-orders',
    texts: 'purchaseOrders',
    group: 'purchases',
    party: 'vendor',
    secondDate: 'deliveryDate',
    tabs: ['', 'draft', 'issued', 'billed', 'cancelled'],
    issueStatus: 'issued',
    isCredit: false,
    hasReason: false,
    editable: ['draft', 'issued'],
    hasTerms: true,
    hasSalesperson: false,
    filePrefix: 'PurchaseOrder',
  },
  vendor_credit: {
    kind: 'vendor_credit',
    route: '/vendor-credits',
    texts: 'vendorCredits',
    group: 'purchases',
    party: 'vendor',
    tabs: ['', 'draft', 'open', 'closed', 'void'],
    issueStatus: 'open',
    isCredit: true,
    hasReason: true,
    editable: ['draft', 'open'],
    hasTerms: false,
    hasSalesperson: false,
    filePrefix: 'VendorCredit',
  },
};
