/**
 * "Add items with phone" on the Items screen: the same QR link as the
 * counter's phone scanner, for a phone that counts goods onto the shelf and
 * creates items it does not know. Each scan refreshes the item list here.
 */
import { useRef, useState } from 'react';
import { Smartphone } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

import { PhoneScannerDialog, usePhoneLink } from './PhoneScanner';

/** How long to wait after the last scan before reloading the list (a burst of scans reloads once). */
const RELOAD_AFTER_MS = 700;

export function PhoneItemsLink({ onChanged }: { onChanged: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const [dialog, setDialog] = useState(false);
  const [count, setCount] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const phone = usePhoneLink(
    () => {
      setCount((n) => n + 1);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(onChanged, RELOAD_AFTER_MS);
    },
    'items',
    () => toast.notify(t('pos.phone.ended'), 'info'),
  );
  const connected = Boolean(phone.session && phone.session.connected && !phone.session.closed);
  // The QR window has done its job once the phone opens it.
  if (dialog && connected) setDialog(false);

  return (
    <>
      {connected ? (
        <div className="pos-phone-banner phone-items-banner" role="status">
          <Smartphone size={18} aria-hidden="true" />
          <span>{t('pos.phone.itemsLinked', { count })}</span>
          <Button size="sm" variant="ghost" onClick={() => void phone.close()}>
            {t('pos.phone.disconnect')}
          </Button>
        </div>
      ) : (
        <Button icon={<Smartphone size={15} />} onClick={() => setDialog(true)}>
          {t('pos.phone.itemsUse')}
        </Button>
      )}
      {dialog ? (
        <PhoneScannerDialog
          purpose="items"
          link={phone.link}
          onOpen={phone.open}
          onCancel={() => {
            setDialog(false);
            if (!connected) void phone.close();
          }}
        />
      ) : null}
    </>
  );
}
