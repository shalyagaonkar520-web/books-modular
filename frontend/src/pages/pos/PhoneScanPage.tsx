/**
 * The phone's end of "use phone as scanner", opened from the QR code on a
 * counter. No sign-in and no app around it: the key in the link is the
 * permission. Scan a product, check what Books found (name, price, GST),
 * choose how many and send it to the counter's bill. A barcode Books does not
 * know yet asks for the item's name, price and GST and adds it.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Flashlight, Minus, Plus } from 'lucide-react';

import { ApiError } from '@/api/client';
import { phoneScanApi, type PhoneSession, type PosItem } from '@/api/pos';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { formatCurrency, formatQuantity, parseNumber } from '@/utils/format';

import { useBarcodeScanner } from './useBarcodeScanner';

const GST_RATES = ['0', '5', '12', '18', '28'];
const UNITS = ['pcs', 'kg', 'g', 'ltr', 'ml', 'pack', 'box', 'dozen'];
/** How many recent sends the phone lists. */
const RECENT = 6;

type Current = { code: string; item: PosItem } | { code: string; item: null };

export function PhoneScanPage() {
  const { token = '' } = useParams();
  const { t } = useAppContent();
  const [session, setSession] = useState<PhoneSession | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [newItem, setNewItem] = useState({ name: '', price: '', gst: '0', unit: 'pcs' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Array<{ key: number; text: string }>>([]);
  const [typed, setTyped] = useState('');
  const keyRef = useRef(0);
  const currentRef = useRef<Current | null>(null);
  currentRef.current = current;

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

  const look = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      // One product at a time: a scan while the card is open is ignored.
      if (!code || currentRef.current) return;
      setError(null);
      try {
        const item = await phoneScanApi.lookup(token, code);
        setCurrent({ code, item });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404 && err.message === 'No item with this barcode') {
          setCurrent({ code, item: null });
          setNewItem({ name: '', price: '', gst: '0', unit: 'pcs' });
        } else {
          fail(err);
        }
      }
      setQuantity('1');
    },
    [fail, token],
  );

  const scanner = useBarcodeScanner((code) => void look(code));
  const { start, stop } = scanner;
  useEffect(() => {
    if (session) void start();
  }, [session, start]);
  useEffect(() => {
    if (ended) stop();
  }, [ended, stop]);

  const qty = parseNumber(quantity, 0);
  const done = (name: string) => {
    setSent((list) => [{ key: ++keyRef.current, text: t('pos.scan.sentLine', { name, qty: formatQuantity(qty) }) }, ...list].slice(0, RECENT));
    setCurrent(null);
  };

  const send = async () => {
    if (!current?.item || qty <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await phoneScanApi.send(token, current.code, qty);
      done(current.item.name);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const addAndSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!current || current.item || qty <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const item = await phoneScanApi.newItem(token, {
        barcode: current.code,
        name: newItem.name.trim(),
        sellingPrice: parseNumber(newItem.price, 0),
        taxRate: parseNumber(newItem.gst, 0),
        unit: newItem.unit,
      });
      await phoneScanApi.send(token, current.code, qty);
      done(item.name);
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

  const quantityBox = (
    <div className="phone-scan-qty">
      <span>{t('pos.scan.quantity')}</span>
      <button type="button" className="icon-btn" aria-label={t('pos.scan.less')} onClick={() => setQuantity(String(Math.max(1, qty - 1)))}>
        <Minus size={18} />
      </button>
      <input
        aria-label={t('pos.scan.quantity')}
        className="pos-qty-input"
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <button type="button" className="icon-btn" aria-label={t('pos.scan.more')} onClick={() => setQuantity(String(qty + 1))}>
        <Plus size={18} />
      </button>
    </div>
  );

  return (
    <main className="phone-scan">
      <header className="phone-scan-head">
        <strong>{session.organizationName}</strong>
        <span>{t('pos.scan.forCounter', { name: session.counterUserName ?? t('pos.remote.theCounter') })}</span>
      </header>

      <div className="pos-camera phone-scan-camera">
        <video ref={scanner.videoRef} className={scanner.active ? 'is-live' : ''} muted playsInline aria-label={t('pos.camera')} />
        {!scanner.active ? (
          <div className="pos-camera-idle">
            <Button variant="primary" loading={scanner.starting} onClick={() => void start()}>
              {t('pos.startCamera')}
            </Button>
            {scanner.error ? <p className="pos-camera-error">{t(`pos.cameraError.${scanner.error}`)}</p> : null}
          </div>
        ) : scanner.torchAvailable ? (
          <div className="pos-camera-controls">
            <Button size="sm" icon={<Flashlight size={16} />} onClick={() => void scanner.toggleTorch()} aria-pressed={scanner.torchOn}>
              {scanner.torchOn ? t('pos.torchOff') : t('pos.torchOn')}
            </Button>
          </div>
        ) : null}
      </div>

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
          {quantityBox}
          <Button variant="primary" className="phone-scan-send" loading={busy} disabled={qty <= 0} onClick={() => void send()}>
            {t('pos.scan.send')}
          </Button>
          <Button variant="ghost" onClick={() => setCurrent(null)} disabled={busy}>
            {t('pos.scan.skip')}
          </Button>
        </section>
      ) : current ? (
        <form className="phone-scan-card" onSubmit={addAndSend} aria-label={t('pos.scan.newTitle')}>
          <h2>{t('pos.scan.newTitle')}</h2>
          <p className="phone-scan-hint">{t('pos.scan.newHint', { code: current.code })}</p>
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
          {quantityBox}
          <Button type="submit" variant="primary" className="phone-scan-send" loading={busy} disabled={!newItem.name.trim() || newItem.price === '' || qty <= 0}>
            {t('pos.scan.addAndSend')}
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
        <ul className="pos-remote-list">
          {sent.map((line) => (
            <li key={line.key} className="is-ok">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pos-empty">{t('pos.scan.pointCamera')}</p>
      )}
    </main>
  );
}
