/** The printed bill: narrow enough for an 80 mm thermal printer, readable on a phone. */
import type { PosSale } from '@/api/pos';
import { useAppContent } from '@/app/AppContentContext';
import { formatCurrency, formatDateTime, formatQuantity } from '@/utils/format';

export function Receipt({ sale }: { sale: PosSale }) {
  const { t } = useAppContent();
  const r = sale.receipt;
  return (
    <div className="pos-receipt" data-testid="pos-receipt">
      <div className="pos-receipt-head">
        <strong>{r.organizationName}</strong>
        {r.address ? <div>{r.address}</div> : null}
        {r.phone ? <div>{r.phone}</div> : null}
        {r.gstin ? <div>{t('pos.receipt.gstin', { gstin: r.gstin })}</div> : null}
        {r.header ? <div className="pos-receipt-note">{r.header}</div> : null}
      </div>
      <div className="pos-receipt-meta">
        <span>{t('pos.receipt.bill', { number: sale.invoiceNumber })}</span>
        <span>{formatDateTime(sale.createdAt)}</span>
      </div>
      <table className="pos-receipt-lines">
        <thead>
          <tr>
            <th>{t('pos.receipt.item')}</th>
            <th className="num">{t('pos.receipt.qty')}</th>
            <th className="num">{t('pos.receipt.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((line, index) => (
            <tr key={`${line.itemId ?? 'line'}-${index}`}>
              <td>
                {line.name}
                <div className="pos-receipt-sub">
                  {formatCurrency(line.rate)} {line.taxRate ? `+ ${line.taxRate}% GST` : ''}
                </div>
              </td>
              <td className="num">{formatQuantity(line.quantity)}</td>
              <td className="num">{formatCurrency(line.amount + line.taxAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="pos-receipt-totals">
        <dt>{t('pos.subtotal')}</dt>
        <dd>{formatCurrency(sale.subtotal)}</dd>
        {sale.discountAmount ? (
          <>
            <dt>{t('pos.discount')}</dt>
            <dd>-{formatCurrency(sale.discountAmount)}</dd>
          </>
        ) : null}
        <dt>{t('pos.gst')}</dt>
        <dd>{formatCurrency(sale.taxTotal)}</dd>
        <dt className="pos-receipt-total">{t('pos.total')}</dt>
        <dd className="pos-receipt-total">{formatCurrency(sale.total)}</dd>
        <dt>{t(`pos.mode.${sale.mode}`)}</dt>
        <dd>{formatCurrency(sale.tendered)}</dd>
        {sale.changeDue ? (
          <>
            <dt>{t('pos.change')}</dt>
            <dd>{formatCurrency(sale.changeDue)}</dd>
          </>
        ) : null}
        {sale.returnedAmount ? (
          <>
            <dt>{t('pos.returned')}</dt>
            <dd>-{formatCurrency(sale.returnedAmount)}</dd>
          </>
        ) : null}
      </dl>
      <div className="pos-receipt-foot">
        {sale.cashierName ? <div>{t('pos.receipt.cashier', { name: sale.cashierName })}</div> : null}
        <div className="pos-receipt-note">{r.footer || t('pos.receipt.thanks')}</div>
      </div>
    </div>
  );
}

/** Print only the receipt (the rest of the page is hidden by the pos-printing print styles). */
export function printReceipt(): void {
  document.body.classList.add('pos-printing');
  const done = () => {
    document.body.classList.remove('pos-printing');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  // Some mobile browsers never fire afterprint.
  window.setTimeout(done, 60_000);
}
