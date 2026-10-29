/** Scan one barcode with the phone camera and hand it back (the item form's Barcode box). */
import { useEffect } from 'react';
import { Flashlight } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

import { useBarcodeScanner } from './useBarcodeScanner';

export function BarcodeScanDialog({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const { t } = useAppContent();
  const scanner = useBarcodeScanner((code) => {
    scanner.stop();
    onScan(code);
  });
  const { start } = scanner;

  // The camera opens with the dialog; the hook lets go of it when the dialog closes.
  useEffect(() => {
    void start();
  }, [start]);

  return (
    <Modal
      open
      title={t('pos.scanDialog.title')}
      subtitle={t('pos.scanDialog.subtitle')}
      size="sm"
      onClose={onClose}
      footer={
        <>
          {scanner.torchAvailable ? (
            <Button icon={<Flashlight size={16} />} onClick={() => void scanner.toggleTorch()} aria-pressed={scanner.torchOn}>
              {scanner.torchOn ? t('pos.torchOff') : t('pos.torchOn')}
            </Button>
          ) : null}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className="pos-camera">
        <video ref={scanner.videoRef} className={scanner.active ? 'is-live' : ''} muted playsInline aria-label={t('pos.camera')} />
        {!scanner.active ? (
          <div className="pos-camera-idle">
            {scanner.error ? (
              <>
                <p className="pos-camera-error">{t(`pos.cameraError.${scanner.error}`)}</p>
                <Button variant="primary" onClick={() => void scanner.start()}>
                  {t('pos.startCamera')}
                </Button>
              </>
            ) : (
              <p>{t('pos.scanDialog.starting')}</p>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
