/** Browser voice and camera helpers shared by Buddy and the employee workspace. */

export interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
export type RecognitionCtor = new () => Recognition;

export function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** A plain-words reason the microphone did not work, from the browser's error code. */
export function micProblem(code?: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'The microphone is blocked. Click the lock icon in the address bar, set Microphone to Allow, then try again.';
    case 'no-speech':
      return "I didn't hear anything. Tap the mic and speak a little louder.";
    case 'audio-capture':
      return 'No microphone was found. Plug one in or check your device settings.';
    case 'network':
      return 'Voice needs an internet connection (the browser sends the audio to its speech service). Check your connection.';
    case 'aborted':
      return '';
    default:
      return 'The microphone could not start. Try again, or type your message.';
  }
}

/** Why voice or camera cannot work here at all (not https, unsupported browser), or null. */
export function mediaUnavailable(kind: 'mic' | 'camera'): string | null {
  if (!window.isSecureContext) return `${kind === 'mic' ? 'Voice' : 'The camera'} only works on a secure (https) address.`;
  if (kind === 'mic' && !recognitionCtor()) return 'Voice input needs Chrome, Edge or Safari.';
  if (kind === 'camera' && !navigator.mediaDevices?.getUserMedia) return 'This browser cannot open the camera. Use the gallery button instead.';
  return null;
}

/** Plain words for a getUserMedia failure. */
export function cameraProblem(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The camera is blocked. Click the lock icon in the address bar, set Camera to Allow, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'The camera could not start. Use the gallery button to pick a photo instead.';
}
