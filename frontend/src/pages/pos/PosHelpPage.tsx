/** The Point of Sale manual inside the app (also printable / savable as PDF from the browser). */
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';

import manual from '@/content/pointOfSaleManual.md?raw';
import { useAppContent } from '@/app/AppContentContext';
import { Button } from '@/components/ui/Button';

import { renderManual } from './Manual';

const BLOCKS = renderManual(manual);

export function PosHelpPage() {
  const { t } = useAppContent();
  return (
    <div className="pos-help">
      <div className="pos-header-actions no-print">
        <Link className="btn btn-secondary btn-sm" to="/pos">
          <span>{t('pos.backToCounter')}</span>
        </Link>
        <Button size="sm" icon={<Printer size={15} />} onClick={() => window.print()}>
          {t('pos.help.print')}
        </Button>
      </div>
      <article className="pos-manual card">{BLOCKS}</article>
    </div>
  );
}
