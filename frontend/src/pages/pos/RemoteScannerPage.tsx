/**
 * The phone's end of "use phone as scanner": opened from the QR code on a
 * counter, it reads barcodes with the camera and sends each one to that
 * counter's bill.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Flashlight, XCircle } from 'lucide-react';

import { ApiError } from '@/api/client';
import { scannerApi, type ScannerSession } from '@/api/pos';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';

import { useBarcodeScanner } from './useBarcodeScanner';

interface SentScan {
  key: number;
  code: string;
  ok: boolean;
  message?: string;
}

/** How many recent scans the phone lists. */
const RECENT = 8;

export function RemoteScannerPage() {
  const { sessionId = '' } = useParams();
  const { t } = useAppContent();
  const [session, setSession] = useState<ScannerSession | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [sent, setSent] = useState<SentScan[]>([]);
  const [code, setCode] = useState('');
  const keyRef = useRef(0);

  useEffect(() => {
    scannerApi
      .connect(sessionId)
      .then(setSession)
      .catch((err) => setFatal(err instanceof ApiError ? err.message : t('pos.offline')));
  }, [sessionId, t]);

  const send = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      const key = ++keyRef.current;
      try {
        await scannerApi.send(sessionId, value);
        setSent((list) => [{ key, code: value, ok: true }, ...list].slice(0, RECENT));
      } catch (err) {
        const message = err instanceof ApiError ? err.message : t('pos.offline');
        setSent((list) => [{ key, code: value, ok: false, message }, ...list].slice(0, RECENT));
        // The counter closed the link: no point keeping the camera on.
        if (err instanceof ApiError && err.status === 410) setFatal(message);
      }
    },
    [sessionId, t],
  );

  const scanner = useBarcodeScanner((scanned) => void send(scanned));
  const { start, stop } = scanner;
  useEffect(() => {
    if (session) void start();
  }, [session, start]);
  useEffect(() => {
    if (fatal) stop();
  }, [fatal, stop]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(code);
    setCode('');
  };

  if (fatal && !session) return <ErrorBlock message={fatal} />;
  if (!session) return <LoadingBlock label={t('pos.remote.connecting')} />;

  return (
    <div className="pos-remote">
      <PageHeader
        title={t('pos.remote.title')}
        subtitle={t('pos.remote.subtitle', { name: session.counterUserName ?? t('pos.remote.theCounter') })}
      />
      {fatal ? (
        <div className="pos-banner pos-banner-danger" role="alert">
          {fatal}
        </div>
      ) : null}
      <div className="pos-camera">
        <video ref={scanner.videoRef} className={scanner.active ? 'is-live' : ''} muted playsInline aria-label={t('pos.camera')} />
        {!scanner.active ? (
          <div className="pos-camera-idle">
            <Button variant="primary" loading={scanner.starting} onClick={() => void start()} disabled={Boolean(fatal)}>
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

      <form className="pos-code-form" onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="remote-code">
            {t('pos.codeLabel')}
          </label>
          <input
            id="remote-code"
            className="input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            maxLength={64}
            disabled={Boolean(fatal)}
          />
        </div>
        <Button type="submit" disabled={!code.trim() || Boolean(fatal)}>
          {t('pos.remote.send')}
        </Button>
      </form>

      <h2 className="pos-remote-heading">{t('pos.remote.sent')}</h2>
      {sent.length === 0 ? (
        <p className="pos-empty">{t('pos.remote.nothingYet')}</p>
      ) : (
        <ul className="pos-remote-list">
          {sent.map((scan) => (
            <li key={scan.key} className={scan.ok ? 'is-ok' : 'is-failed'}>
              {scan.ok ? <CheckCircle2 size={18} aria-hidden="true" /> : <XCircle size={18} aria-hidden="true" />}
              <span className="pos-remote-code">{scan.code}</span>
              <span className="pos-remote-status">{scan.ok ? t('pos.remote.onTheBill') : scan.message}</span>
              {!scan.ok && !fatal ? (
                <Button size="sm" variant="ghost" onClick={() => void send(scan.code)}>
                  {t('pos.remote.retry')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
