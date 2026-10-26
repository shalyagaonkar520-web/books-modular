/** Badge tones and labels for the statuses quotes, orders, credits and recurring profiles add. */
import { statusLabel, statusTone, type Tone, type Translate } from '@/utils/status';

const TONES: Record<string, Tone> = {
  accepted: 'success',
  declined: 'danger',
  expired: 'warning',
  invoiced: 'success',
  confirmed: 'info',
  issued: 'info',
  billed: 'success',
  cancelled: 'neutral',
  closed: 'success',
  paused: 'warning',
  stopped: 'neutral',
};

export function flowStatusTone(status: string): Tone {
  return TONES[status] ?? statusTone(status);
}

export function flowStatusLabel(status: string, t?: Translate): string {
  return statusLabel(status, t);
}
