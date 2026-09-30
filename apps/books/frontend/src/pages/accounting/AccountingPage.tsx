import { useState } from 'react';

import { accountingApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';

import { ChartOfAccountsTab } from './ChartOfAccountsTab';
import { GeneralLedgerTab } from './GeneralLedgerTab';
import { ManualJournalsTab } from './ManualJournalsTab';
import { TrialBalanceTab } from './TrialBalanceTab';

const TABS = [
  { id: 'accounts', label: 'accounting.tab.accounts' },
  { id: 'journals', label: 'accounting.tab.journals' },
  { id: 'ledger', label: 'accounting.tab.ledger' },
  { id: 'trial-balance', label: 'accounting.tab.trialBalance' },
];

export function AccountingPage() {
  const { t } = useAppContent();
  const [tab, setTab] = useState('accounts');

  // Shared across the journal editor and the ledger picker.
  const accounts = useAsync(() => accountingApi.accounts(), []);

  return (
    <>
      <PageHeader title={t('accounting.title')} subtitle={t('accounting.subtitle')} />
      <Tabs tabs={TABS.map((entry) => ({ ...entry, label: t(entry.label) }))} active={tab} onChange={setTab} />

      {tab === 'accounts' ? <ChartOfAccountsTab /> : null}
      {tab === 'journals' ? <ManualJournalsTab accounts={accounts.data ?? []} /> : null}
      {tab === 'ledger' ? (
        <GeneralLedgerTab
          accounts={accounts.data ?? []}
          accountsLoading={accounts.loading}
          accountsError={accounts.error}
          onRetryAccounts={accounts.reload}
        />
      ) : null}
      {tab === 'trial-balance' ? <TrialBalanceTab /> : null}
    </>
  );
}
