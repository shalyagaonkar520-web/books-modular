/**
 * The phone camera as a barcode scanner for the Point of Sale.
 *
 * Uses the browser's own BarcodeDetector where there is one (Chrome on
 * Android) and falls back to ZXing, loaded only when needed, elsewhere
 * (iPhone Safari, Firefox). The back camera is asked for; the torch is offered
 * when the camera has one. The same code seen again within `dedupeMs` is
 * ignored, so holding a product in front of the camera adds it once.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type ScannerError = 'insecure' | 'unsupported' | 'denied' | 'noCamera' | 'failed';

/** Retail barcodes plus the 2D codes some shops print on their own labels. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];
const DETECT_EVERY_MS = 120;

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorClass {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

/** A short beep and a buzz, so the cashier knows the scan was taken without looking. */
export function scanFeedback(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1200;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
      osc.onended = () => void ctx.close();
    }
  } catch {
    // No sound is fine.
  }
  navigator.vibrate?.(60);
}

async function nativeDetector(): Promise<BarcodeDetectorLike | null> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported = (await Detector.getSupportedFormats?.()) ?? FORMATS;
    const formats = FORMATS.filter((format) => supported.includes(format));
    return formats.length ? new Detector({ formats }) : null;
  } catch {
    return null;
  }
}

/** ``isPaused``: while it answers true, codes are ignored (no beep) - e.g. while a confirmation is open. */
export function useBarcodeScanner(onCode: (code: string) => void, dedupeMs = 1500, isPaused?: () => boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopLoopRef = useRef<(() => void) | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ScannerError | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const handle = useCallback(
    (raw: string) => {
      const code = raw.trim();
      if (!code || isPausedRef.current?.()) return;
      const now = Date.now();
      if (code === lastRef.current.code && now - lastRef.current.at < dedupeMs) return;
      lastRef.current = { code, at: now };
      scanFeedback();
      onCodeRef.current(code);
    },
    [dedupeMs],
  );

  const stop = useCallback(() => {
    stopLoopRef.current?.();
    stopLoopRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!window.isSecureContext) {
      setError('insecure');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('unsupported');
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play();
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
      setTorchAvailable(Boolean(caps.torch));

      const detector = await nativeDetector();
      if (detector) {
        let busy = false;
        const timer = window.setInterval(() => {
          if (busy || video.readyState < 2) return;
          busy = true;
          detector
            .detect(video)
            .then((codes) => {
              if (codes[0]?.rawValue) handle(codes[0].rawValue);
            })
            .catch(() => undefined)
            .finally(() => {
              busy = false;
            });
        }, DETECT_EVERY_MS);
        stopLoopRef.current = () => window.clearInterval(timer);
      } else {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) handle(result.getText());
        });
        stopLoopRef.current = () => controls.stop();
      }
      setActive(true);
    } catch (err) {
      stop();
      const name = (err as Error)?.name;
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'noCamera' : 'failed');
    } finally {
      setStarting(false);
    }
  }, [handle, stop]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  // Let go of the camera when the page is left.
  useEffect(() => stop, [stop]);

  return { videoRef, start, stop, active, starting, error, torchAvailable, torchOn, toggleTorch };
}
