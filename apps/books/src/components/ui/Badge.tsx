import type { ReactNode } from 'react';

import type { Tone } from '@/utils/status';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
