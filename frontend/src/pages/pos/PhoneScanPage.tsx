/**
 * The phone's end of "use phone as scanner", opened from a QR code. No sign-in
 * and no app around it: the key in the link is the permission. Full screen:
 * the camera on top, the controls in a panel at the bottom, the screen kept
 * awake. A Bluetooth / USB scanner paired with the phone works too.
 *
 * Two kinds of link:
 * - sale (the counter): scan, check what Books found, choose how many, send
 *   it to the bill - or in Fast scan every scan goes straight onto the bill;
 * - items (the Items screen): scan, add how many are on the shelf to stock -
 *   or create the item (name, price, GST, cost, opening stock).
 * A barcode Books does not know always asks for the item's details.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Flashlight, Maximize2, Minus, Plus, Zap } from 'lucide-react';

import { ApiError } from '@/api/client';
import { phoneScanApi, type PhoneSession, type PosItem } from '@/api/pos';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { formatCurrency, formatQuantity, parseNumber } from '@/utils/format';

import { useBarcodeScanner } from './useBarcodeScanner';
import { useScannerKeys } from './useScannerKeys';

const GST_RATES = ['0', '5', '12', '18', '28'];
const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'pack', 'box', 'dozen'];
/** How many recent sends the phone lists. */
const RECENT = 8;
export const FAST_MODE_KEY = 'rb.scan.fast';

type Current = { code: string; item: PosItem } | { code: string; item: null };
interface WakeLockLike {
  release: () => Promise<void>;
}

function loadFast(): boolean {
  try {
    return localStorage.getItem(FAST_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Keep the screen on while scanning (where the browser allows it). */
function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> } };
    let lock: WakeLockLike | null = null;
    let cancelled = false;
    const take = () =>
      nav.wakeLock
        ?.request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    void take();
    // The lock is dropped when the page is hidden; take it again on return.
    const onVisible = () => document.visibilityState === 'visible' && void take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

export function PhoneScanPage() {
  const { token = '' } = useParams();
  const { t } = useAppContent();
  const [session, setSession] = useState<PhoneSession | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [newItem, setNewItem] = useState({ name: '', price: '', gst: '0', unit: 'pcs', cost: '', stock: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Array<{ key: number; text: string }>>([]);
  const [typed, setTyped] = useState('');
  const [fast, setFast] = useState(loadFast);
  const keyRef = useRef(0);
  const currentRef = useRef<Current | null>(null);
  currentRef.current = current;
  const busyRef = useRef(false);
  busyRef.current = busy;
  const items = session?.purpose === 'items';

  // The link no longer works (ended, expired, not found): nothing more can be sent.
  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && (err.status === 410 || err.status === 404)) setEnded(err.message);
      else setError(err instanceof ApiError ? err.message : t('pos.offline'));
    },
    [t],
  );

  useEffect(() => {
    phoneScanApi
      .open(token)
      .then(setSession)
      .catch((err) => setEnded(err instanceof ApiError ? err.message : t('pos.offline')));
  }, [token, t]);
  useWakeLock(Boolean(session) && !ended);

  const note = useCallback(
    (text: string) => setSent((list) => [{ key: ++keyRef.current, text }, ...list].slice(0, RECENT)),
    [],
  );

  // Items already sent in this session: each goes in once, more only by hand.
  const doneRef = useRef<Set<string>>(new Set());

  /** Put it on the bill (sale) or into stock (items). */
  const deliver = useCallback(
    async (code: string, name: string, howMany: number) => {
      doneRef.current.add(code);
      if (session?.purpose === 'items') {
        const item = await phoneScanApi.addStock(token, code, howMany);
        note(t('pos.scan.stockLine', { name, qty: formatQuantity(howMany), stock: formatQuantity(item.stockOnHand) }));
      } else {
        await phoneScanApi.send(token, code, howMany);
        note(t('pos.scan.sentLine', { name, qty: formatQuantity(howMany) }));
      }
    },
    [note, session?.purpose, t, token],
  );

  const look = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      // One product at a time: a scan while a card is open or a send is running waits.
      if (!code || currentRef.current || busyRef.current) return;
      setError(null);
      setQuantity('1');
      try {
        const item = await phoneScanApi.lookup(token, code);
        if (doneRef.current.has(code)) {
          setError(t(session?.purpose === 'items' ? 'pos.scan.alreadyAdded' : 'pos.scan.alreadySent', { name: item.name }));
          return;
        }
        if (fast) {
          // Fast scan: straight through, one at a time.
          setBusy(true);
          try {
            await deliver(code, item.name, 1);
          } finally {
            setBusy(false);
          }
          return;
        }
        setCurrent({ code, item });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404 && err.message === 'No item with this barcode') {
          setCurrent({ code, item: null });
          setNewItem({ name: '', price: '', gst: '0', unit: 'pcs', cost: '', stock: '' });
        } else {
          fail(err);
        }
      }
    },
    [deliver, fail, fast, session?.purpose, t, token],
  );

  const scanner = useBarcodeScanner((code) => void look(code), 1500, () => Boolean(currentRef.current) || busyRef.current);
  const { start, stop } = scanner;
  useEffect(() => {
    if (session) void start();
  }, [session, start]);
  useEffect(() => {
    if (ended) stop();
  }, [ended, stop]);
  // A Bluetooth / USB scanner paired with the phone types the code: take it from anywhere.
  useScannerKeys((code) => void look(code), Boolean(session) && !ended);

  const qty = parseNumber(quantity, 0);

  const confirm = async () => {
    if (!current?.item || qty <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await deliver(current.code, current.item.name, qty);
      setCurrent(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!current || current.item) return;
    const stockCount = parseNumber(newItem.stock, 0);
    if (!items && qty <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const created = await phoneScanApi.newItem(token, {
        barcode: current.code,
        name: newItem.name.trim(),
        sellingPrice: parseNumber(newItem.price, 0),
        taxRate: parseNumber(newItem.gst, 0),
        unit: newItem.unit,
        ...(items ? { costPrice: parseNumber(newItem.cost, 0), openingStock: stockCount } : {}),
      });
      if (items) {
        note(t('pos.scan.createdLine', { name: created.name, stock: formatQuantity(created.stockOnHand) }));
      } else {
        await phoneScanApi.send(token, current.code, qty);
        note(t('pos.scan.sentLine', { name: created.name, qty: formatQuantity(qty) }));
      }
      setCurrent(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    const code = typed;
    setTyped('');
    void look(code);
  };

  const toggleFast = () => {
    setFast((was) => {
      try {
        localStorage.setItem(FAST_MODE_KEY, was ? '0' : '1');
      } catch {
        // Not remembered; fine.
      }
      return !was;
    });
  };

  const fullScreen = () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  };

  if (ended) {
    return (
      <main className="phone-scan phone-scan-ended">
        <h1>{t('pos.scan.endedTitle')}</h1>
        <p>{ended}</p>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="phone-scan">
        <p className="phone-scan-loading">{t('pos.scan.opening')}</p>
      </main>
    );
  }

  const quantityBox = (label: string) => (
    <div className="phone-scan-qty">
      <span>{label}</span>
      <button type="button" className="icon-btn" aria-label={t('pos.scan.less')} onClick={() => setQuantity(String(Math.max(1, qty - 1)))}>
        <Minus size={20} />
      </button>
      <input
        aria-label={label}
        className="pos-qty-input"
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <button type="button" className="icon-btn" aria-label={t('pos.scan.more')} onClick={() => setQuantity(String(qty + 1))}>
        <Plus size={20} />
      </button>
    </div>
  );

  return (
    <main className="phone-scan phone-scan-full">
      <header className="phone-scan-head">
        <div>
          <strong>{session.organizationName}</strong>
          <span>
            {items ? t('pos.scan.forItems') : t('pos.scan.forCounter', { name: session.counterUserName ?? t('pos.remote.theCounter') })}
          </span>
        </div>
        <button type="button" className="icon-btn" aria-label={t('pos.scan.fullScreen')} onClick={fullScreen}>
          <Maximize2 size={20} />
        </button>
      </header>

      <div className="pos-camera phone-scan-camera">
        <video ref={scanner.videoRef} className={scanner.active ? 'is-live' : ''} muted playsInline aria-label={t('pos.camera')} />
        {!scanner.active ? (
          <div className="pos-camera-idle">
            <Button variant="primary" loading={scanner.starting} onClick={() => void start()}>
              {t('pos.startCamera')}
            </Button>
            {scanner.error ? <p className="pos-camera-error">{t(`pos.cameraError.${scanner.error}`)}</p> : null}
            <p className="phone-scan-hint-light">{t('pos.scan.bluetoothHint')}</p>
          </div>
        ) : (
          <>
            <div className="phone-scan-frame" aria-hidden="true" />
            {scanner.torchAvailable ? (
              <div className="pos-camera-controls">
                <Button size="sm" icon={<Flashlight size={16} />} onClick={() => void scanner.toggleTorch()} aria-pressed={scanner.torchOn}>
                  {scanner.torchOn ? t('pos.torchOff') : t('pos.torchOn')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <section className="phone-scan-panel">
        <button type="button" className={`phone-scan-fast ${fast ? 'is-on' : ''}`} aria-pressed={fast} onClick={toggleFast}>
          <Zap size={16} aria-hidden="true" />
          <span>{fast ? t('pos.scan.fastOn') : t('pos.scan.fastOff')}</span>
        </button>

        <FormError message={error} />

        {current?.item ? (
          <section className="phone-scan-card" aria-label={t('pos.scan.found')}>
            <h2>{current.item.name}</h2>
            <dl>
              <dt>{t('pos.scan.price')}</dt>
              <dd>{formatCurrency(current.item.sellingPrice)}</dd>
              <dt>{t('pos.gst')}</dt>
              <dd>{current.item.taxRate}%</dd>
              {current.item.trackInventory ? (
                <>
                  <dt>{t('pos.scan.inStock')}</dt>
                  <dd>
                    {formatQuantity(current.item.stockOnHand)} {current.item.unit}
                  </dd>
                </>
              ) : null}
              <dt>{t('pos.codeLabel')}</dt>
              <dd className="phone-scan-code">{current.code}</dd>
            </dl>
            {quantityBox(items ? t('pos.scan.howManyIn') : t('pos.scan.quantity'))}
            <Button variant="primary" className="phone-scan-send" loading={busy} disabled={qty <= 0} onClick={() => void confirm()}>
              {items ? t('pos.scan.addToStock') : t('pos.scan.send')}
            </Button>
            <Button variant="ghost" onClick={() => setCurrent(null)} disabled={busy}>
              {t('pos.scan.skip')}
            </Button>
          </section>
        ) : current ? (
          <form className="phone-scan-card" onSubmit={addItem} aria-label={t('pos.scan.newTitle')}>
            <h2>{t('pos.scan.newTitle')}</h2>
            <p className="phone-scan-hint">{items ? t('pos.scan.newHintItems', { code: current.code }) : t('pos.scan.newHint', { code: current.code })}</p>
            <TextField label={t('pos.scan.itemName')} required value={newItem.name} maxLength={200} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} />
            <TextField
              label={t('pos.scan.price')}
              required
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={newItem.price}
              onChange={(event) => setNewItem({ ...newItem, price: event.target.value })}
            />
            <SelectField
              label={t('pos.gst')}
              value={newItem.gst}
              options={GST_RATES.map((rate) => ({ value: rate, label: `${rate}%` }))}
              onChange={(event) => setNewItem({ ...newItem, gst: event.target.value })}
            />
            <SelectField
              label={t('pos.scan.unit')}
              value={newItem.unit}
              options={UNITS.map((unit) => ({ value: unit, label: unit }))}
              onChange={(event) => setNewItem({ ...newItem, unit: event.target.value })}
            />
            {items ? (
              <>
                <TextField
                  label={t('pos.scan.costPrice')}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={newItem.cost}
                  onChange={(event) => setNewItem({ ...newItem, cost: event.target.value })}
                />
                <TextField
                  label={t('pos.scan.openingStock')}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={newItem.stock}
                  onChange={(event) => setNewItem({ ...newItem, stock: event.target.value })}
                />
              </>
            ) : (
              quantityBox(t('pos.scan.quantity'))
            )}
            <Button
              type="submit"
              variant="primary"
              className="phone-scan-send"
              loading={busy}
              disabled={!newItem.name.trim() || newItem.price === '' || (!items && qty <= 0)}
            >
              {items ? t('pos.scan.createItem') : t('pos.scan.addAndSend')}
            </Button>
            <Button variant="ghost" onClick={() => setCurrent(null)} disabled={busy}>
              {t('pos.scan.skip')}
            </Button>
          </form>
        ) : (
          <form className="pos-code-form" onSubmit={submitTyped}>
            <div className="field">
              <label className="field-label" htmlFor="phone-code">
                {t('pos.codeLabel')}
              </label>
              <input id="phone-code" className="input" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" maxLength={64} />
            </div>
            <Button type="submit" disabled={!typed.trim()}>
              {t('pos.add')}
            </Button>
          </form>
        )}

        {sent.length ? (
          <ul className="pos-remote-list" aria-label={t('pos.scan.recent')}>
            {sent.map((line) => (
              <li key={line.key} className="is-ok">
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>{line.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pos-empty">{items ? t('pos.scan.pointCameraItems') : t('pos.scan.pointCamera')}</p>
        )}
      </section>
    </main>
  );
}
