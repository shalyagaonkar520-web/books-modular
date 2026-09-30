import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs } from '@/components/ui/Toolbar';
import { TextField } from '@/components/ui/Field';
import { useAuth } from '@/auth/AuthContext';
import { todayIso } from '@/utils/format';

import { AgeingReportView } from './AgeingReportView';
import { BalanceSheetReport } from './BalanceSheetReport';
import { ContactTotalsReportView } from './ContactTotalsReportView';
import { ExpensesByCategoryReport } from './ExpensesByCategoryReport';
import { InventorySummaryReportView } from './InventorySummaryReportView';
import { ProfitAndLossReport } from './ProfitAndLossReport';
import { TaxSummaryReport } from './TaxSummaryReport';

type RangeKind = 'period' | 'as_of' | 'none';

type ReportId =
  | 'profit_and_loss'
  | 'balance_sheet'
  | 'receivables_ageing'
  | 'payables_ageing'
  | 'sales_by_customer'
  | 'purchases_by_vendor'
  | 'expenses_by_category'
  | 'inventory_summary'
  | 'tax_summary';

interface ReportMeta {
  id: ReportId;
  /** Text-key prefix: `${textKey}.label` and `${textKey}.subtitle` (see content/appContentDefault.json). */
  textKey: string;
  /** Built from ledger balances; the API restricts these to admin/viewer. */
  financialOnly?: boolean;
  range: RangeKind;
}

const REPORTS: ReportMeta[] = [
  { id: 'profit_and_loss', textKey: 'reports.profitAndLoss', range: 'period', financialOnly: true },
  { id: 'balance_sheet', textKey: 'reports.balanceSheet', range: 'as_of', financialOnly: true },
  { id: 'receivables_ageing', textKey: 'reports.receivablesAgeing', range: 'as_of' },
  { id: 'payables_ageing', textKey: 'reports.payablesAgeing', range: 'as_of' },
  { id: 'sales_by_customer', textKey: 'reports.salesByCustomer', range: 'period' },
  { id: 'purchases_by_vendor', textKey: 'reports.purchasesByVendor', range: 'period' },
  { id: 'expenses_by_category', textKey: 'reports.expensesByCategory', range: 'period' },
  { id: 'inventory_summary', textKey: 'reports.inventorySummary', range: 'none' },
  { id: 'tax_summary', textKey: 'reports.taxSummary', range: 'period' },
];

/** First day of the fiscal year that contains today. */
function fiscalYearStartIso(fiscalStartMonth: number): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = month >= fiscalStartMonth ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(fiscalStartMonth).padStart(2, '0')}-01`;
}

export function ReportsPage() {
  const { t } = useAppContent();
  const { organization, can } = useAuth();
  const fiscalStartMonth = organization?.fiscalYearStartMonth ?? 4;
  const defaultStart = useMemo(() => fiscalYearStartIso(fiscalStartMonth), [fiscalStartMonth]);

  // Profit & Loss and the Balance Sheet read ledger balances, which the API
  // serves only to admin and viewer; hide them from staff so they don't land
  // on a report that 403s.
  const visibleReports = useMemo(() => REPORTS.filter((report) => !report.financialOnly || can('admin', 'viewer')), [can]);

  const [activeId, setActiveId] = useState<ReportId>(() => (can('admin', 'viewer') ? 'profit_and_loss' : 'receivables_ageing'));
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(todayIso());
  const [asOf, setAsOf] = useState(todayIso());

  const active = visibleReports.find((report) => report.id === activeId) ?? visibleReports[0];

  const renderReport = () => {
    switch (active.id) {
      case 'profit_and_loss':
        return <ProfitAndLossReport startDate={startDate} endDate={endDate} />;
      case 'balance_sheet':
        return <BalanceSheetReport asOf={asOf} />;
      case 'receivables_ageing':
        return <AgeingReportView kind="receivables" asOf={asOf} />;
      case 'payables_ageing':
        return <AgeingReportView kind="payables" asOf={asOf} />;
      case 'sales_by_customer':
        return <ContactTotalsReportView kind="sales" startDate={startDate} endDate={endDate} />;
      case 'purchases_by_vendor':
        return <ContactTotalsReportView kind="purchases" startDate={startDate} endDate={endDate} />;
      case 'expenses_by_category':
        return <ExpensesByCategoryReport startDate={startDate} endDate={endDate} />;
      case 'inventory_summary':
        return <InventorySummaryReportView />;
      case 'tax_summary':
        return <TaxSummaryReport startDate={startDate} endDate={endDate} />;
      default:
        return null;
    }
  };

  return (
    <div className="stack">
      <PageHeader
        title={t('reports.title')}
        subtitle={t(`${active.textKey}.subtitle`)}
        actions={
          <Button variant="secondary" icon={<Printer size={15} />} onClick={() => window.print()}>
            {t('reports.print')}
          </Button>
        }
      />

      <div className="no-print">
        <Tabs tabs={visibleReports.map((report) => ({ id: report.id, label: t(`${report.textKey}.label`) }))} active={active.id} onChange={(id) => setActiveId(id as ReportId)} />
        {active.range === 'period' ? (
          <div className="form-grid-3">
            <TextField label={t('reports.range.from')} type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
            <TextField label={t('reports.range.to')} type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        ) : null}
        {active.range === 'as_of' ? (
          <div className="form-grid-3">
            <TextField
              label={t('reports.range.asOf')}
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
              hint={t('reports.range.asOfHint')}
            />
          </div>
        ) : null}
        {active.range === 'none' ? <p className="text-muted small">{t('reports.range.currentPosition')}</p> : null}
      </div>

      <div className="printable">{renderReport()}</div>
    </div>
  );
}
