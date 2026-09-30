import type { BankAccount } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, titleCase } from '@/utils/format';

interface BankAccountCardsProps {
  accounts: BankAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
}

/** One selectable card per bank/cash/credit-card account. */
export function BankAccountCards({ accounts, selectedAccountId, onSelect }: BankAccountCardsProps) {
  const { t } = useAppContent();
  return (
    <div className="grid-3">
      {accounts.map((account) => {
        const isSelected = account.id === selectedAccountId;
        return (
          <div
            key={account.id}
            className="card"
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onClick={() => onSelect(account.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(account.id);
              }
            }}
          >
            <div className="card-body stack">
              <div className="row-between">
                <div className="cell-stack">
                  <span className="strong">{account.name}</span>
                  <small>
                    {titleCase(account.type)}
                    {account.bankName ? ` · ${account.bankName}` : ''}
                  </small>
                </div>
                <div className="row">
                  {account.isPrimary ? <Badge tone="info">{t('banking.cards.primary')}</Badge> : null}
                  {isSelected ? <Badge tone="success">{t('banking.cards.viewing')}</Badge> : null}
                </div>
              </div>
              <div className="stat-value num">{formatCurrency(account.currentBalance, account.currency)}</div>
              <div className="small text-subtle mono">{account.accountNumberMasked ?? t('banking.cards.noAccountNumber')}</div>
              <div className="small text-muted">{t('banking.cards.unreconciled', { count: account.unreconciledCount })}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
