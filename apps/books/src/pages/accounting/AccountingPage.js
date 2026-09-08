import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { accountingApi } from '@/api/endpoints';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { ChartOfAccountsTab } from './ChartOfAccountsTab';
import { GeneralLedgerTab } from './GeneralLedgerTab';
import { ManualJournalsTab } from './ManualJournalsTab';
import { TrialBalanceTab } from './TrialBalanceTab';
const TABS = [
    { id: 'accounts', label: 'Chart of accounts' },
    { id: 'journals', label: 'Manual journals' },
    { id: 'ledger', label: 'General ledger' },
    { id: 'trial-balance', label: 'Trial balance' },
];
export function AccountingPage() {
    const [tab, setTab] = useState('accounts');
    // Shared across the journal editor and the ledger picker.
    const accounts = useAsync(() => accountingApi.accounts(), []);
    return (_jsxs(_Fragment, { children: [_jsx(PageHeader, { title: "Accountant", subtitle: "Chart of accounts, manual journals, general ledger and trial balance." }), _jsx(Tabs, { tabs: TABS, active: tab, onChange: setTab }), tab === 'accounts' ? _jsx(ChartOfAccountsTab, {}) : null, tab === 'journals' ? _jsx(ManualJournalsTab, { accounts: accounts.data ?? [] }) : null, tab === 'ledger' ? (_jsx(GeneralLedgerTab, { accounts: accounts.data ?? [], accountsLoading: accounts.loading, accountsError: accounts.error, onRetryAccounts: accounts.reload })) : null, tab === 'trial-balance' ? _jsx(TrialBalanceTab, {}) : null] }));
}
