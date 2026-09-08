import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/Button';
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
  label: string;
  subtitle: string;
  range: RangeKind;
}

const REPORTS: ReportMeta[] = [
  { id: 'profit_and_loss', label: 'Profit & Loss', subtitle: 'Income, cost of sales and expenses for the period', range: 'period' },
  { id: 'balance_sheet', label: 'Balance Sheet', subtitle: 'What the business owns and owes on a given date', range: 'as_of' },
  { id: 'receivables_ageing', label: 'Receivables Ageing', subtitle: 'How long customer invoices have been outstanding', range: 'as_of' },
  { id: 'payables_ageing', label: 'Payables Ageing', subtitle: 'How long vendor bills have been outstanding', range: 'as_of' },
  { id: 'sales_by_customer', label: 'Sales by Customer', subtitle: 'Invoiced, collected and outstanding per customer', range: 'period' },
  { id: 'purchases_by_vendor', label: 'Purchases by Vendor', subtitle: 'Billed, paid and outstanding per vendor', range: 'period' },
  { id: 'expenses_by_category', label: 'Expenses by Category', subtitle: 'Where operating spend goes', range: 'period' },
  { id: 'inventory_summary', label: 'Inventory Summary', subtitle: 'Stock on hand and valuation for tracked items', range: 'none' },
  { id: 'tax_summary', label: 'Tax Summary (GST)', subtitle: 'Output GST, input GST and the net position', range: 'period' },
];

/** First day of the fiscal year that contains today. */
function fiscalYearStartIso(fiscalStartMonth: number): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = month >= fiscalStartMonth ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(fiscalStartMonth).padStart(2, '0')}-01`;
}

export function ReportsPage() {
  const { organization } = useAuth();
  const fiscalStartMonth = organization?.fiscalYearStartMonth ?? 4;
  const defaultStart = useMemo(() => fiscalYearStartIso(fiscalStartMonth), [fiscalStartMonth]);

  const [activeId, setActiveId] = useState<ReportId>('profit_and_loss');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(todayIso());
  const [asOf, setAsOf] = useState(todayIso());

  const active = REPORTS.find((report) => report.id === activeId) ?? REPORTS[0];

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
        title="Reports"
        subtitle={active.subtitle}
        actions={
          <Button variant="secondary" icon={<Printer size={15} />} onClick={() => window.print()}>
            Print
          </Button>
        }
      />

      <div className="no-print">
        <Tabs tabs={REPORTS.map((report) => ({ id: report.id, label: report.label }))} active={active.id} onChange={(id) => setActiveId(id as ReportId)} />
        {active.range === 'period' ? (
          <div className="form-grid-3">
            <TextField label="From" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
            <TextField label="To" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
        ) : null}
        {active.range === 'as_of' ? (
          <div className="form-grid-3">
            <TextField label="As of" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} hint="Balances and ageing are calculated on this date" />
          </div>
        ) : null}
        {active.range === 'none' ? <p className="text-muted small">This report always shows the current position.</p> : null}
      </div>

      <div className="printable">{renderReport()}</div>
    </div>
  );
}
