/**
 * The Point of Sale counter: scan products with the phone camera (or a USB
 * scanner, or by typing), take cash / UPI / card, print the receipt.
 *
 * Every sale is sent with an id made before the first attempt. If the
 * connection drops while paying, Retry sends the same id, so the customer is
 * never charged twice; until then the bill is locked. The open bill survives
 * a page reload (sessionStorage).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Flashlight, Minus, Plus, ScanBarcode, Smartphone, Trash2, WifiOff, X } from 'lucide-react';

import { ApiError } from '@/api/client';
import { newClientId, posApi, type PosMode, type PosSale, type PosSaleCreate } from '@/api/pos';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatQuantity, parseNumber, round2, todayIso } from '@/utils/format';

import { PhoneScannerDialog, usePhoneLink } from './PhoneScanner';
import { printReceipt, Receipt } from './Receipt';
import { useBarcodeScanner } from './useBarcodeScanner';
import { useOnline } from './useOnline';

export interface BillLine {
  itemId: string;
  name: string;
  sku: string;
  unit: string;
  rate: number;
  taxRate: number;
  quantity: number;
  trackInventory: boolean;
  stockOnHand: number;
}

interface OpenBill {
  lines: BillLine[];
  discount: string;
  /** A payment sent but not confirmed (connection lost): retried with the same id. */
  pending: PosSaleCreate | null;
}

export const OPEN_BILL_KEY = 'rb.pos.openBill';
const EMPTY_BILL: OpenBill = { lines: [], discount: '', pending: null };

function loadBill(): OpenBill {
  try {
    const raw = sessionStorage.getItem(OPEN_BILL_KEY);
    if (!raw) return EMPTY_BILL;
    const parsed = JSON.parse(raw) as Partial<OpenBill>;
    return { lines: Array.isArray(parsed.lines) ? parsed.lines : [], discount: parsed.discount ?? '', pending: parsed.pending ?? null };
  } catch {
    return EMPTY_BILL;
  }
}

function saveBill(bill: OpenBill): void {
  try {
    if (bill.lines.length || bill.pending) sessionStorage.setItem(OPEN_BILL_KEY, JSON.stringify(bill));
    else sessionStorage.removeItem(OPEN_BILL_KEY);
  } catch {
    // Private mode: the bill just doesn't survive a reload.
  }
}

/** The bill as the server will work it out: the discount is spread over the lines before GST. */
export function billTotals(lines: BillLine[], discount: number) {
  const subtotal = round2(lines.reduce((sum, line) => sum + round2(line.rate * line.quantity), 0));
  const off = Math.min(Math.max(discount, 0), subtotal);
  const tax = round2(
    lines.reduce((sum, line) => {
      const amount = round2(line.rate * line.quantity);
      const share = subtotal ? (amount / subtotal) * off : 0;
      return sum + round2(((amount - share) * line.taxRate) / 100);
    }, 0),
  );
  return { subtotal, discount: off, tax, total: round2(subtotal - off + tax) };
}

/** Notes a cashier is likely to be handed for a bill: exact, then the next round amounts. */
export function cashSuggestions(total: number): number[] {
  const out = new Set<number>([Math.ceil(total)]);
  for (const step of [10, 50, 100, 500, 2000]) out.add(Math.ceil(total / step) * step);
  return [...out].filter((value) => value >= total).sort((a, b) => a - b).slice(0, 5);
}

export function PosPage() {
  const { t } = useAppContent();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const online = useOnline();
  const [bill, setBill] = useState<OpenBill>(loadBill);
  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<PosSale | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveBill(bill), [bill]);
  const locked = bill.pending !== null;

  const addCode = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      if (locked) {
        toast.error(t('pos.lockedByPending'));
        return;
      }
      setLooking(true);
      try {
        const item = await posApi.lookup(value);
        setBill((current) => {
          const existing = current.lines.find((line) => line.itemId === item.id);
          const lines = existing
            ? current.lines.map((line) => (line.itemId === item.id ? { ...line, quantity: line.quantity + 1 } : line))
            : [
                ...current.lines,
                {
                  itemId: item.id,
                  name: item.name,
                  sku: item.sku,
                  unit: item.unit,
                  rate: item.sellingPrice,
                  taxRate: item.taxRate,
                  quantity: 1,
                  trackInventory: item.trackInventory,
                  stockOnHand: item.stockOnHand,
                },
              ];
          return { ...current, lines };
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) toast.error(t('pos.notFound', { code: value }));
        else toast.error(error instanceof ApiError ? error.message : t('pos.offline'));
      } finally {
        setLooking(false);
      }
    },
    [locked, t, toast],
  );

  const scanner = useBarcodeScanner((scanned) => void addCode(scanned));
  const phone = usePhoneLink((scanned) => void addCode(scanned));
  const [phoneDialog, setPhoneDialog] = useState(false);
  const phoneConnected = Boolean(phone.session && phone.session.connected && !phone.session.closed);
  // The QR dialog has done its job once the phone is in.
  useEffect(() => {
    if (phoneDialog && phoneConnected) {
      setPhoneDialog(false);
      toast.success(t('pos.phone.connected', { name: phone.session?.phoneUserName ?? '' }));
    }
  }, [phoneDialog, phoneConnected, phone.session?.phoneUserName, t, toast]);

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    const value = code;
    setCode('');
    void addCode(value);
    codeRef.current?.focus();
  };

  const setQuantity = (itemId: string, quantity: number) =>
    setBill((current) => ({
      ...current,
      lines: quantity <= 0 ? current.lines.filter((line) => line.itemId !== itemId) : current.lines.map((line) => (line.itemId === itemId ? { ...line, quantity } : line)),
    }));

  const discount = parseNumber(bill.discount, 0);
  const totals = useMemo(() => billTotals(bill.lines, discount), [bill.lines, discount]);

  const finished = (sale: PosSale) => {
    setBill(EMPTY_BILL);
    setPayOpen(false);
    setReceipt(sale);
  };

  return (
    <div className="pos-page">
      <PageHeader
        title={t('pos.title')}
        subtitle={t('pos.subtitle')}
        actions={
          <div className="pos-header-actions">
            <Link className="btn btn-secondary btn-sm" to="/pos/sales">
              <span>{t('pos.salesAndDayEnd')}</span>
            </Link>
            {isAdmin ? (
              <Link className="btn btn-ghost btn-sm" to="/pos/settings">
                <span>{t('pos.settings.title')}</span>
              </Link>
            ) : null}
          </div>
        }
      />

      {!online ? (
        <div className="pos-banner pos-banner-danger" role="alert">
          <WifiOff size={18} aria-hidden="true" />
          <span>{t('pos.offlineBanner')}</span>
        </div>
      ) : null}
      {locked ? (
        <div className="pos-banner pos-banner-warning" role="alert">
          <span>{t('pos.pendingBanner')}</span>
          <Button size="sm" variant="primary" onClick={() => setPayOpen(true)}>
            {t('pos.retryPayment')}
          </Button>
        </div>
      ) : null}

      <div className="pos-layout">
        <section className="pos-scan card">
          <div className="pos-camera">
            <video ref={scanner.videoRef} className={scanner.active ? 'is-live' : ''} muted playsInline aria-label={t('pos.camera')} />
            {!scanner.active ? (
              <div className="pos-camera-idle">
                <ScanBarcode size={40} aria-hidden="true" />
                <Button variant="primary" loading={scanner.starting} onClick={() => void scanner.start()} disabled={locked}>
                  {t('pos.startCamera')}
                </Button>
                {scanner.error ? <p className="pos-camera-error">{t(`pos.cameraError.${scanner.error}`)}</p> : null}
              </div>
            ) : (
              <div className="pos-camera-controls">
                {scanner.torchAvailable ? (
                  <Button size="sm" icon={<Flashlight size={16} />} onClick={() => void scanner.toggleTorch()} aria-pressed={scanner.torchOn}>
                    {scanner.torchOn ? t('pos.torchOff') : t('pos.torchOn')}
                  </Button>
                ) : null}
                <Button size="sm" icon={<X size={16} />} onClick={scanner.stop}>
                  {t('pos.stopCamera')}
                </Button>
              </div>
            )}
          </div>
          <form className="pos-code-form" onSubmit={submitCode}>
            <div className="field">
              <label className="field-label" htmlFor="pos-code">
                {t('pos.codeLabel')}
              </label>
              <input
                id="pos-code"
                ref={codeRef}
                className="input"
                aria-describedby="pos-code-hint"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="off"
                autoFocus
                maxLength={64}
                disabled={locked}
              />
              <span className="field-hint" id="pos-code-hint">
                {t('pos.codeHint')}
              </span>
            </div>
            <Button type="submit" variant="secondary" loading={looking} disabled={!code.trim() || locked}>
              {t('pos.add')}
            </Button>
          </form>
          {phoneConnected ? (
            <div className="pos-phone-banner" role="status">
              <Smartphone size={18} aria-hidden="true" />
              <span>{t('pos.phone.linked', { name: phone.session?.phoneUserName ?? '' })}</span>
              <Button size="sm" variant="ghost" onClick={() => void phone.close()}>
                {t('pos.phone.disconnect')}
              </Button>
            </div>
          ) : (
            <Button className="pos-phone-btn" icon={<Smartphone size={16} />} onClick={() => setPhoneDialog(true)} disabled={locked}>
              {t('pos.phone.use')}
            </Button>
          )}
        </section>

        <section className="pos-bill card" aria-label={t('pos.bill')}>
          <div className="pos-bill-head">
            <h2>{t('pos.bill')}</h2>
            {bill.lines.length && !locked ? (
              <Button size="sm" variant="ghost" onClick={() => setBill(EMPTY_BILL)}>
                {t('pos.clearBill')}
              </Button>
            ) : null}
          </div>
          {bill.lines.length === 0 ? (
            <p className="pos-empty">{t('pos.emptyBill')}</p>
          ) : (
            <ul className="pos-lines">
              {bill.lines.map((line) => {
                const short = line.trackInventory && line.quantity > line.stockOnHand;
                return (
                  <li key={line.itemId} className="pos-line">
                    <div className="pos-line-main">
                      <strong>{line.name}</strong>
                      <span className="pos-line-sub">
                        {formatCurrency(line.rate)} × {formatQuantity(line.quantity)} {line.unit}
                        {line.taxRate ? ` · ${line.taxRate}% GST` : ''}
                      </span>
                      {short ? <span className="pos-line-warn">{t('pos.lowStock', { stock: formatQuantity(line.stockOnHand) })}</span> : null}
                    </div>
                    <div className="pos-qty">
                      <button type="button" className="icon-btn" aria-label={t('pos.less', { name: line.name })} onClick={() => setQuantity(line.itemId, line.quantity - 1)} disabled={locked}>
                        {line.quantity <= 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                      </button>
                      <input
                        className="pos-qty-input"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        aria-label={t('pos.quantityOf', { name: line.name })}
                        value={line.quantity}
                        disabled={locked}
                        onChange={(event) => setQuantity(line.itemId, parseNumber(event.target.value, 0))}
                      />
                      <button type="button" className="icon-btn" aria-label={t('pos.more', { name: line.name })} onClick={() => setQuantity(line.itemId, line.quantity + 1)} disabled={locked}>
                        <Plus size={16} />
                      </button>
                    </div>
                    <span className="pos-line-amount">{formatCurrency(round2(line.rate * line.quantity))}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="pos-totals">
            <TextField
              label={t('pos.discount')}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={bill.discount}
              onChange={(event) => setBill((current) => ({ ...current, discount: event.target.value }))}
              disabled={locked || bill.lines.length === 0}
            />
            <dl>
              <dt>{t('pos.subtotal')}</dt>
              <dd>{formatCurrency(totals.subtotal)}</dd>
              {totals.discount ? (
                <>
                  <dt>{t('pos.discount')}</dt>
                  <dd>-{formatCurrency(totals.discount)}</dd>
                </>
              ) : null}
              <dt>{t('pos.gst')}</dt>
              <dd>{formatCurrency(totals.tax)}</dd>
              <dt className="pos-grand">{t('pos.total')}</dt>
              <dd className="pos-grand" data-testid="pos-total">
                {formatCurrency(totals.total)}
              </dd>
            </dl>
            <Button variant="primary" className="pos-pay-btn" disabled={(bill.lines.length === 0 || totals.total <= 0) && !locked} onClick={() => setPayOpen(true)}>
              {locked ? t('pos.retryPayment') : t('pos.pay', { amount: formatCurrency(totals.total) })}
            </Button>
          </div>
        </section>
      </div>

      {phoneDialog ? (
        <PhoneScannerDialog
          session={phone.session}
          onOpen={phone.open}
          onCancel={() => {
            setPhoneDialog(false);
            if (!phoneConnected) void phone.close();
          }}
        />
      ) : null}

      {payOpen ? (
        <PaySheet
          bill={bill}
          total={totals.total}
          online={online}
          onPending={(pending) => setBill((current) => ({ ...current, pending }))}
          onDiscardPending={() => setBill((current) => ({ ...current, pending: null }))}
          onClose={() => setPayOpen(false)}
          onDone={finished}
        />
      ) : null}

      <Modal
        open={receipt !== null}
        title={t('pos.saleDone')}
        size="sm"
        onClose={() => setReceipt(null)}
        footer={
          <>
            <Button onClick={printReceipt}>{t('pos.print')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                setReceipt(null);
                codeRef.current?.focus();
              }}
            >
              {t('pos.newSale')}
            </Button>
          </>
        }
      >
        {receipt ? (
          <>
            {receipt.changeDue ? <p className="pos-change-callout">{t('pos.giveChange', { amount: formatCurrency(receipt.changeDue) })}</p> : null}
            <Receipt sale={receipt} />
          </>
        ) : null}
      </Modal>
    </div>
  );
}

interface PaySheetProps {
  bill: OpenBill;
  total: number;
  online: boolean;
  onPending: (pending: PosSaleCreate) => void;
  onDiscardPending: () => void;
  onClose: () => void;
  onDone: (sale: PosSale) => void;
}

function PaySheet({ bill, total, online, onPending, onDiscardPending, onClose, onDone }: PaySheetProps) {
  const { t } = useAppContent();
  const pending = bill.pending;
  const [mode, setMode] = useState<PosMode>(pending?.paymentMode ?? 'cash');
  const [tendered, setTendered] = useState(pending?.amountTendered != null ? String(pending.amountTendered) : '');
  const [reference, setReference] = useState(pending?.reference ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(pending !== null);

  const cash = parseNumber(tendered, 0);
  const shownTotal = pending ? null : total;
  const change = mode === 'cash' && tendered !== '' && shownTotal !== null ? round2(cash - shownTotal) : 0;
  const cashShort = mode === 'cash' && tendered !== '' && shownTotal !== null && cash < shownTotal;

  const send = async () => {
    setError(null);
    const body: PosSaleCreate =
      pending ??
      ({
        clientSaleId: newClientId(),
        lines: bill.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
        paymentMode: mode,
        amountTendered: mode === 'cash' && tendered !== '' ? cash : null,
        discountAmount: parseNumber(bill.discount, 0),
        reference: mode !== 'cash' && reference.trim() ? reference.trim() : null,
        date: todayIso(),
      } satisfies PosSaleCreate);
    // Remember it before sending: if the answer never comes, Retry reuses it.
    onPending(body);
    setBusy(true);
    try {
      const sale = await posApi.createSale(body);
      onDone(sale);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0 && err.status < 500) {
        // Refused (stock, cash short...): nothing was made, so the bill can be changed.
        onDiscardPending();
        setConnectionLost(false);
        setError(err.message);
      } else {
        setConnectionLost(true);
        setError(t('pos.connectionLost'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={connectionLost ? t('pos.retryTitle') : t('pos.payTitle', { amount: formatCurrency(total) })}
      size="sm"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          {connectionLost ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('pos.discardConfirm'))) {
                  onDiscardPending();
                  setConnectionLost(false);
                  setError(null);
                }
              }}
            >
              {t('pos.discardPending')}
            </Button>
          ) : (
            <Button onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
          )}
          <Button variant="primary" loading={busy} disabled={!online || cashShort} onClick={() => void send()}>
            {connectionLost ? t('pos.retryPayment') : t('pos.completeSale')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      {connectionLost ? (
        <p>{t('pos.retryExplain')}</p>
      ) : (
        <>
          <div className="pos-modes" role="radiogroup" aria-label={t('pos.paymentMode')}>
            {(['cash', 'upi', 'card'] as PosMode[]).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                className={`pos-mode ${mode === option ? 'is-active' : ''}`}
                onClick={() => setMode(option)}
              >
                {t(`pos.mode.${option}`)}
              </button>
            ))}
          </div>
          {mode === 'cash' ? (
            <>
              <TextField
                label={t('pos.cashReceived')}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
                autoFocus
                error={cashShort ? t('pos.cashShort') : undefined}
              />
              <div className="pos-quick-cash">
                {cashSuggestions(total).map((amount) => (
                  <button key={amount} type="button" className="btn btn-secondary btn-sm" onClick={() => setTendered(String(amount))}>
                    <span>{formatCurrency(amount)}</span>
                  </button>
                ))}
              </div>
              {change > 0 ? <p className="pos-change-callout">{t('pos.giveChange', { amount: formatCurrency(change) })}</p> : null}
            </>
          ) : (
            <TextField label={t('pos.reference')} hint={t('pos.referenceHint')} value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} />
          )}
        </>
      )}
      {!online ? <p className="pos-camera-error">{t('pos.offlineBanner')}</p> : null}
    </Modal>
  );
}
