/**
 * A phone as the counter's barcode scanner.
 *
 * The counter opens a scanner session and shows its link as a QR code. A
 * phone signed in to the same organization opens the link (RemoteScannerPage)
 * and sends what its camera reads; the counter asks for new codes about once
 * a second and adds them to the bill. The session survives a page reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/api/client';
import { scannerApi, scannerLink, type ScannerSession } from '@/api/pos';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';

export const PHONE_LINK_KEY = 'rb.pos.phoneLink';
const POLL_MS = 1000;

interface StoredLink {
  session: ScannerSession;
  after: number;
}

function loadLink(): StoredLink | null {
  try {
    const raw = sessionStorage.getItem(PHONE_LINK_KEY);
    return raw ? (JSON.parse(raw) as StoredLink) : null;
  } catch {
    return null;
  }
}

function saveLink(link: StoredLink | null): void {
  try {
    if (link) sessionStorage.setItem(PHONE_LINK_KEY, JSON.stringify(link));
    else sessionStorage.removeItem(PHONE_LINK_KEY);
  } catch {
    // Private mode: the link just doesn't survive a reload.
  }
}

/** The counter's end: open / close the session and feed the phone's codes to ``onCode``. */
export function usePhoneLink(onCode: (code: string) => void) {
  const stored = loadLink();
  const [session, setSession] = useState<ScannerSession | null>(stored?.session ?? null);
  const afterRef = useRef(stored?.after ?? 0);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const remember = useCallback((next: ScannerSession | null) => {
    setSession(next);
    saveLink(next ? { session: next, after: afterRef.current } : null);
  }, []);

  const open = useCallback(async () => {
    afterRef.current = 0;
    const created = await scannerApi.open();
    remember(created);
    return created;
  }, [remember]);

  const close = useCallback(async () => {
    const current = session;
    remember(null);
    if (current) await scannerApi.close(current.id).catch(() => undefined);
  }, [remember, session]);

  const sessionId = session && !session.closed ? session.id : null;
  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const poll = await scannerApi.poll(sessionId, afterRef.current);
        if (stopped) return;
        for (const scan of poll.scans) {
          afterRef.current = scan.seq;
          onCodeRef.current(scan.code);
        }
        setSession((prev) => (prev && prev.connected === poll.session.connected && prev.closed === poll.session.closed ? prev : poll.session));
        saveLink(poll.session.closed ? null : { session: poll.session, after: afterRef.current });
      } catch (error) {
        // The session is gone (cleared, other organization): stop asking.
        if (!stopped && error instanceof ApiError && error.status === 404) {
          setSession(null);
          saveLink(null);
        }
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [sessionId]);

  return { session, open, close };
}

/** The QR code a phone scans to become this counter's scanner; closes itself once the phone is in. */
export function PhoneScannerDialog({
  session,
  onOpen,
  onCancel,
}: {
  session: ScannerSession | null;
  onOpen: () => Promise<ScannerSession>;
  onCancel: () => void;
}) {
  const { t } = useAppContent();
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const created = session && !session.closed ? session : await openRef.current();
        const { svg } = await scannerApi.qr(created.id, scannerLink(created.id));
        if (active) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : t('pos.offline'));
      }
    })();
    return () => {
      active = false;
    };
    // Once per opening of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const link = session ? scannerLink(session.id) : '';
  return (
    <Modal
      open
      title={t('pos.phone.title')}
      subtitle={t('pos.phone.subtitle')}
      size="sm"
      onClose={onCancel}
      footer={<Button onClick={onCancel}>{t('pos.phone.cancel')}</Button>}
    >
      <FormError message={error} />
      <div className="pos-phone-qr">
        {qr ? <img src={qr} alt={t('pos.phone.qrAlt')} width={240} height={240} /> : !error ? <p>{t('pos.phone.preparing')}</p> : null}
      </div>
      <ol className="pos-phone-steps">
        <li>{t('pos.phone.step1')}</li>
        <li>{t('pos.phone.step2')}</li>
        <li>{t('pos.phone.step3')}</li>
      </ol>
      {link ? (
        <p className="pos-phone-link">
          {t('pos.phone.orOpen')} <code>{link}</code>
        </p>
      ) : null}
      <p className="pos-phone-waiting" role="status">
        {t('pos.phone.waiting')}
      </p>
    </Modal>
  );
}
