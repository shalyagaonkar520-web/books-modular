/** Dashboard card: today's counter takings. Shown only once the counter has sold something today. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { posApi, type PosSummary } from '@/api/pos';
import { useAppContent } from '@/app/AppContentContext';
import { Card, StatTile } from '@/components/ui/Card';
import { formatCurrency } from '@/utils/format';

export function PosTodayCard({ currency }: { currency: string }) {
  const { t, isModuleEnabled } = useAppContent();
  const enabled = isModuleEnabled('pos');
  const [summary, setSummary] = useState<PosSummary | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    posApi
      .summary()
      .then((data) => active && setSummary(data))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);

  if (!enabled || !summary || summary.salesCount === 0) return null;
  const by = Object.fromEntries(summary.byMode.map((row) => [row.mode, row.total]));
  return (
    <Card
      title={t('pos.dashboard.title')}
      actions={
        <Link className="btn btn-secondary btn-sm" to="/pos/sales">
          <span>{t('pos.salesAndDayEnd')}</span>
        </Link>
      }
    >
      <div className="stat-grid">
        <StatTile label={t('pos.sales.netSales')} value={formatCurrency(summary.netSales, currency)} sublabel={t('pos.sales.bills', { count: summary.salesCount })} tone="positive" />
        <StatTile label={t('pos.mode.cash')} value={formatCurrency(by.cash ?? 0, currency)} />
        <StatTile label={t('pos.mode.upi')} value={formatCurrency(by.upi ?? 0, currency)} />
        <StatTile label={t('pos.mode.card')} value={formatCurrency(by.card ?? 0, currency)} />
      </div>
    </Card>
  );
}
