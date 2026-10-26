/**
 * The counter's day: sales history for a date, the day-end report (takings
 * by payment mode and cashier, returns, cash the drawer should hold) and,
 * from a sale, its receipt and returns.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError } from '@/api/client';
import { newClientId, posApi, type PosSale, type PosSaleListItem } from '@/api/pos';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { formatCurrency, formatDate, formatDateTime, formatQuantity, parseNumber, todayIso } from '@/utils/format';

import { printReceipt, Receipt } from './Receipt';

export function PosSalesPage() {
  const { t } = useAppContent();
  const [day, setDay] = useState(todayIso());
  const [openId, setOpenId] = useState<string | null>(null);
  const summary = useAsync(() => posApi.summary(day), [day]);
  const sales = useAsync(() => posApi.sales({ date: day }), [day]);
  const reload = () => {
    summary.reload();
    sales.reload();
  };

  return (
    <div className="pos-sales-page">
      <PageHeader
        title={t('pos.sales.title')}
        subtitle={t('pos.sales.subtitle')}
        actions={
          <div className="pos-header-actions no-print">
            <Link className="btn btn-primary btn-sm" to="/pos">
              <span>{t('pos.backToCounter')}</span>
            </Link>
            <Button size="sm" onClick={() => window.print()}>
              {t('pos.sales.printDayEnd')}
            </Button>
          </div>
        }
      />
      <div className="pos-day-picker no-print">
        <TextField label={t('pos.sales.date')} type="date" value={day} max={todayIso()} onChange={(event) => event.target.value && setDay(event.target.value)} />
      </div>

      {summary.loading && !summary.data ? <LoadingBlock /> : null}
      {summary.error ? <ErrorBlock message={summary.error} onRetry={summary.reload} /> : null}
      {summary.data ? (
        <>
          <h2 className="pos-print-title">{t('pos.sales.dayEndFor', { date: formatDate(day) })}</h2>
          <div className="stat-grid">
            <StatTile label={t('pos.sales.netSales')} value={formatCurrency(summary.data.netSales)} sublabel={t('pos.sales.bills', { count: summary.data.salesCount })} tone="positive" />
            <StatTile label={t('pos.sales.gross')} value={formatCurrency(summary.data.grossSales)} sublabel={t('pos.sales.gstIncluded', { amount: formatCurrency(summary.data.taxTotal) })} />
            <StatTile label={t('pos.sales.returns')} value={formatCurrency(summary.data.returnsTotal)} tone={summary.data.returnsTotal ? 'warning' : 'neutral'} />
            <StatTile label={t('pos.sales.cashExpected')} value={formatCurrency(summary.data.cashExpected)} sublabel={t('pos.sales.cashExpectedHint')} />
          </div>
          <div className="grid-2">
            <Card title={t('pos.sales.byMode')}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('pos.paymentMode')}</th>
                    <th className="num">{t('pos.sales.billsColumn')}</th>
                    <th className="num">{t('pos.sales.taken')}</th>
                    <th className="num">{t('pos.sales.refunded')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.byMode.map((row) => (
                    <tr key={row.mode}>
                      <td>{t(`pos.mode.${row.mode}`)}</td>
                      <td className="num">{row.count}</td>
                      <td className="num">{formatCurrency(row.total)}</td>
                      <td className="num">{formatCurrency(row.refunds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title={t('pos.sales.byCashier')}>
              {summary.data.byCashier.length === 0 ? (
                <p className="muted">{t('pos.sales.none')}</p>
              ) : (
                <table className="data-table">
                  <tbody>
                    {summary.data.byCashier.map((row) => (
                      <tr key={row.cashierId ?? row.name}>
                        <td>{row.name}</td>
                        <td className="num">{t('pos.sales.bills', { count: row.count })}</td>
                        <td className="num">{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
          {summary.data.topItems.length ? (
            <Card title={t('pos.sales.topItems')}>
              <table className="data-table">
                <tbody>
                  {summary.data.topItems.map((row) => (
                    <tr key={row.itemId}>
                      <td>{row.name}</td>
                      <td className="num">{formatQuantity(row.quantity)}</td>
                      <td className="num">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card title={t('pos.sales.history')} className="no-print">
        {sales.loading && !sales.data ? <LoadingBlock /> : null}
        {sales.error ? <ErrorBlock message={sales.error} onRetry={sales.reload} /> : null}
        {sales.data && sales.data.length === 0 ? <EmptyState title={t('pos.sales.none')} /> : null}
        {sales.data && sales.data.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('pos.sales.time')}</th>
                  <th>{t('pos.sales.billNo')}</th>
                  <th>{t('pos.paymentMode')}</th>
                  <th className="num">{t('pos.sales.itemsColumn')}</th>
                  <th className="num">{t('pos.total')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sales.data.map((sale: PosSaleListItem) => (
                  <tr key={sale.id}>
                    <td>{formatDateTime(sale.createdAt)}</td>
                    <td>
                      {sale.invoiceNumber}
                      {sale.returnedAmount ? <span className="badge badge-warning pos-badge">{t('pos.returned')}</span> : null}
                    </td>
                    <td>{t(`pos.mode.${sale.mode}`)}</td>
                    <td className="num">{formatQuantity(sale.itemsCount)}</td>
                    <td className="num">{formatCurrency(sale.total)}</td>
                    <td className="num">
                      <Button size="sm" variant="ghost" onClick={() => setOpenId(sale.id)}>
                        {t('pos.sales.open')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {openId ? <SaleModal saleId={openId} onClose={() => setOpenId(null)} onChanged={reload} /> : null}
    </div>
  );
}

function SaleModal({ saleId, onClose, onChanged }: { saleId: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useAppContent();
  const { canWrite } = useAuth();
  const toast = useToast();
  const sale = useAsync(() => posApi.sale(saleId), [saleId]);
  const [returning, setReturning] = useState(false);

  return (
    <Modal
      open
      title={sale.data ? t('pos.receipt.bill', { number: sale.data.invoiceNumber }) : t('common.loading')}
      size="sm"
      onClose={onClose}
      footer={
        sale.data && !returning ? (
          <>
            <Link className="btn btn-ghost btn-md" to={`/invoices/${sale.data.invoiceId}`}>
              <span>{t('pos.sales.viewInvoice')}</span>
            </Link>
            {canWrite && sale.data.returnedAmount < sale.data.total ? (
              <Button onClick={() => setReturning(true)}>{t('pos.return.start')}</Button>
            ) : null}
            <Button variant="primary" onClick={printReceipt}>
              {t('pos.print')}
            </Button>
          </>
        ) : null
      }
    >
      {sale.loading && !sale.data ? <LoadingBlock /> : null}
      {sale.error ? <ErrorBlock message={sale.error} onRetry={sale.reload} /> : null}
      {sale.data && returning ? (
        <ReturnForm
          sale={sale.data}
          onCancel={() => setReturning(false)}
          onDone={(updated) => {
            sale.setData(updated);
            setReturning(false);
            toast.success(t('pos.return.done'));
            onChanged();
          }}
        />
      ) : null}
      {sale.data && !returning ? (
        <>
          <Receipt sale={sale.data} />
          {sale.data.returns.length ? (
            <ul className="pos-return-list">
              {sale.data.returns.map((ret) => (
                <li key={ret.creditNoteId}>
                  {t('pos.return.line', { number: ret.creditNoteNumber, date: formatDate(ret.date), amount: formatCurrency(ret.total) })}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}

function ReturnForm({ sale, onCancel, onDone }: { sale: PosSale; onCancel: () => void; onDone: (sale: PosSale) => void }) {
  const { t } = useAppContent();
  const returnable = sale.lines.filter((line) => line.itemId && line.quantity - line.returnedQuantity > 0);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per return, kept across retries so a dropped answer cannot refund twice.
  const [clientReturnId] = useState(newClientId);

  const lines = returnable
    .map((line) => ({ itemId: line.itemId as string, quantity: parseNumber(quantities[line.itemId as string] ?? '', 0) }))
    .filter((line) => line.quantity > 0);
  const refund = returnable.reduce((sum, line) => {
    const q = parseNumber(quantities[line.itemId as string] ?? '', 0);
    return sum + (line.quantity ? ((line.amount + line.taxAmount) / line.quantity) * q : 0);
  }, 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await posApi.returnItems(sale.id, { clientReturnId, lines, reason: reason.trim() || null, date: todayIso() }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('pos.connectionLost'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pos-return-form">
      <p>{t('pos.return.explain', { mode: t(`pos.mode.${sale.mode}`) })}</p>
      <FormError message={error} />
      {returnable.map((line) => {
        const left = line.quantity - line.returnedQuantity;
        return (
          <TextField
            key={line.itemId}
            label={t('pos.return.lineLabel', { name: line.name, left: formatQuantity(left) })}
            type="number"
            min={0}
            max={left}
            step="any"
            inputMode="decimal"
            value={quantities[line.itemId as string] ?? ''}
            onChange={(event) => setQuantities((current) => ({ ...current, [line.itemId as string]: event.target.value }))}
          />
        );
      })}
      <TextField label={t('pos.return.reason')} value={reason} maxLength={120} onChange={(event) => setReason(event.target.value)} />
      <p className="pos-change-callout">{t('pos.return.refundAbout', { amount: formatCurrency(refund) })}</p>
      <div className="pos-header-actions">
        <Button onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button variant="danger" loading={busy} disabled={lines.length === 0} onClick={() => void submit()}>
          {t('pos.return.confirm')}
        </Button>
      </div>
    </div>
  );
}
