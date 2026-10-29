/**
 * Starting points for an invoice's terms & conditions, by kind of business.
 * Inserted into the terms field for the user to edit. Adapted from Free GST
 * Billing Software (https://github.com/IamRamgarhia/Free-GST-Billing-Software, MIT).
 * Labels are app texts: invoices.terms.preset.<id>.
 */
export const TERMS_PRESETS: Array<{ id: string; body: string }> = [
  {
    id: 'trader',
    body: `1. Payment is due within 15 days of the invoice date.
2. Interest at 18% a year is charged on overdue payments.
3. Goods once sold will not be taken back or exchanged.
4. Goods remain our property until paid for in full; risk passes to the buyer on dispatch.
5. Subject to [your city] jurisdiction only.`,
  },
  {
    id: 'freelancer',
    body: `1. This invoice is for the professional services agreed in our scope of work; extra work is quoted separately.
2. Payment is due within 7 days of the invoice date. Late payments carry interest at 1.5% a month.
3. If you deduct TDS (section 194J), please share Form 16A.
4. Deliverables pass to you once this invoice is paid in full.
5. Subject to [your city] jurisdiction.`,
  },
  {
    id: 'manufacturer',
    body: `1. Goods are dispatched ex-works unless agreed otherwise in writing; delivery dates are estimates.
2. Please inspect the goods on delivery. Defects must be reported within 7 days; goods are not otherwise returnable.
3. Payment: net 30 days from the invoice date. Interest at 24% a year on overdue amounts.
4. TDS under section 194Q applies where the buyer's turnover exceeds Rs 10 crore.
5. Subject to [your city] jurisdiction.`,
  },
  {
    id: 'retail',
    body: `1. Goods once sold will not be taken back.
2. Exchange within 7 days with this bill, for unused goods in original packing.
3. Warranty, where given, is by the manufacturer as per its terms.
4. Subject to [your city] jurisdiction.`,
  },
  {
    id: 'restaurant',
    body: `1. Prices include GST as shown on this bill.
2. Service charge, if any, is optional and may be removed on request.
3. Thank you for dining with us. Please visit again.`,
  },
  {
    id: 'it',
    body: `1. Services are provided under the agreed statement of work or service agreement.
2. Payment is due within 15 days of the invoice date; services may be suspended on non-payment.
3. TDS under section 194J, if deducted, must be deposited and Form 16A shared every quarter.
4. Licences and subscriptions are non-refundable once activated.
5. Subject to [your city] jurisdiction.`,
  },
  {
    id: 'contractor',
    body: `1. This invoice covers the work completed to date as per the agreed rates.
2. Payment is due within 15 days. TDS under section 194C may be deducted at the applicable rate.
3. Materials remain our property until paid for.
4. Any change to the scope of work will be billed separately.
5. Subject to [your city] jurisdiction.`,
  },
  {
    id: 'export',
    body: `1. Supply meant for export under LUT without payment of IGST (or with payment of IGST, as applicable).
2. Payment by wire transfer in the invoice currency within 30 days; bank charges outside India are borne by the buyer.
3. Delivery terms: [Incoterm, port].
4. Subject to the laws of India and [your city] jurisdiction.`,
  },
];
