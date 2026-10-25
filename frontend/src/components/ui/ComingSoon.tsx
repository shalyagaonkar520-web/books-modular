/** "Coming soon" for features that switch on once the server has their service key (AI, WhatsApp, Razorpay). */
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

import { useAppContent } from '@/app/AppContentContext';

export function ComingSoonBadge() {
  const { t } = useAppContent();
  return <span className="badge badge-coming-soon">{t('comingSoon.badge')}</span>;
}

export function ComingSoon({ title, description, icon }: { title: string; description: string; icon?: ReactNode }) {
  const { t } = useAppContent();
  return (
    <div className="coming-soon" role="status">
      <div className="coming-soon-icon" aria-hidden="true">
        {icon ?? <Sparkles size={22} />}
      </div>
      <ComingSoonBadge />
      <h3>{title}</h3>
      <p className="small text-subtle">{description}</p>
      <p className="small text-muted">{t('comingSoon.note')}</p>
    </div>
  );
}
