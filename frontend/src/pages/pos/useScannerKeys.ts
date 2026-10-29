/**
 * A Bluetooth or USB barcode scanner, wherever the cursor is.
 *
 * Such scanners pair as a keyboard: they "type" the code very fast and press
 * Enter. A run of characters arriving faster than a person types, ended by
 * Enter, is taken as a scan and handed to ``onCode`` - so the scan lands on
 * the bill even when nobody clicked into the barcode box first. Typing in a
 * text box is left alone (that box handles its own Enter).
 */
import { useEffect, useRef } from 'react';

/** A scanner sends a key every few milliseconds; people rarely type faster than one key per 60 ms. */
const MAX_GAP_MS = 45;
const MIN_LENGTH = 4;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useScannerKeys(onCode: (code: string) => void, enabled = true): void {
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let last = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || isEditable(event.target)) return;
      const now = event.timeStamp || performance.now();
      if (now - last > MAX_GAP_MS) buffer = '';
      last = now;
      if (event.key === 'Enter') {
        if (buffer.length >= MIN_LENGTH) {
          event.preventDefault();
          onCodeRef.current(buffer);
        }
        buffer = '';
        return;
      }
      if (event.key.length === 1) buffer += event.key;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
