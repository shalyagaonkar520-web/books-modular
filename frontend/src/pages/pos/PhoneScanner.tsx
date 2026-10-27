/**
 * A phone as the counter's barcode scanner.
 *
 * The counter opens a scanner session and shows its link as a QR code. The
 * link carries a secret key, so the phone opens a camera page straight away
 * with no sign-in (PhoneScanPage); what it sends lands here, where the counter
 * asks for new scans about once a second and adds them to the bill. The key
 * stops working after 12 hours or when the counter disconnects. The session
 * survives a page reload.
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

/** The counter's session; ``token`` is the QR link's key (kept on this device only, for showing the QR again). */
export interface PhoneLink {
  session: ScannerSession;
  token: string;
  after: number;
}

function loadLink(): PhoneLink | null {
  try {
    const raw = sessionStorage.getItem(PHONE_LINK_KEY);
    return raw ? (JSON.parse(raw) as PhoneLink) : null;
  } catch {
    return null;
  }
}

function saveLink(link: PhoneLink | null): void {
  try {
    if (link) sessionStorage.setItem(PHONE_LINK_KEY, JSON.stringify(link));
    else sessionStorage.removeItem(PHONE_LINK_KEY);
  } catch {
    // Private mode: the link just doesn't survive a reload.
  }
}

/** The counter's end: open / close the session and feed the phone's scans to ``onScan``. */
export function usePhoneLink(onScan: (code: string, quantity: number) => void) {
  const [link, setLink] = useState<PhoneLink | null>(loadLink);
  const afterRef = useRef(link?.after ?? 0);
  const tokenRef = useRef(link?.token ?? '');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const remember = useCallback((next: PhoneLink | null) => {
    setLink(next);
    saveLink(next);
  }, []);

  const open = useCallback(async () => {
    const opened = await scannerApi.open();
    const { token, ...session } = opened;
    afterRef.current = 0;
    tokenRef.current = token;
    const next = { session, token, after: 0 };
    remember(next);
    return next;
  }, [remember]);

  const close = useCallback(async () => {
    const current = link;
    remember(null);
    if (current) await scannerApi.close(current.session.id).catch(() => undefined);
  }, [link, remember]);

  const sessionId = link && !link.session.closed ? link.session.id : null;
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
          onScanRef.current(scan.code, scan.quantity);
        }
        const next = poll.session.closed ? null : { session: poll.session, token: tokenRef.current, after: afterRef.current };
        setLink((prev) =>
          next && prev && prev.session.connected === next.session.connected && prev.session.closed === next.session.closed ? prev : next,
        );
        saveLink(next);
      } catch (error) {
        // The session is gone (cleared, other organization): stop asking.
        if (!stopped && error instanceof ApiError && error.status === 404) {
          setLink(null);
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

  return { link, session: link?.session ?? null, open, close };
}

/** The QR code a phone scans to become this counter's scanner; closes itself once the phone opens it. */
export function PhoneScannerDialog({
  link,
  onOpen,
  onCancel,
}: {
  link: PhoneLink | null;
  onOpen: () => Promise<PhoneLink>;
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
        const current = link && !link.session.closed && link.token ? link : await openRef.current();
        const { svg } = await scannerApi.qr(current.session.id, scannerLink(current.token));
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

  const url = link?.token ? scannerLink(link.token) : '';
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
      {url ? (
        <p className="pos-phone-link">
          {t('pos.phone.orOpen')} <code>{url}</code>
        </p>
      ) : null}
      <p className="pos-phone-waiting" role="status">
        {t('pos.phone.waiting')}
      </p>
    </Modal>
  );
}
