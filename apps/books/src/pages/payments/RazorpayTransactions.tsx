import { useMemo, useState } from 'react';

import {
  razorpaySyncApi,
  type CategoryOption,
  type PagedResult,
  type RazorpayTransaction,
} from '@/api/razorpay';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { formatCurrency, formatDate } from '@/utils/format';

import { RazorpayTransactionDetail } from './RazorpayTransactionDetail';
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  RECONCILIATION_OPTIONS,
  categoryTone,
  reconciliationTone,
  statusToneFor,
} from './razorpayStatus';

const PAGE_SIZE = 25;

export function RazorpayTransactions({ categories }: { categories: CategoryOption[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [category, setCategory] = useState('');
  const [reconciliation, setReconciliation] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search);
  const debouncedMin = useDebounced(amountMin);
  const debouncedMax = useDebounced(amountMax);

  const { data, loading, error, reload } = useAsync<PagedResult<RazorpayTransaction>>(
    () =>
      razorpaySyncApi.listTransactions({
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: status || undefined,
        method: method || undefined,
        category: category || undefined,
        reconciliation_status: reconciliation || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        amount_min: debouncedMin ? Number(debouncedMin) : undefined,
        amount_max: debouncedMax ? Number(debouncedMax) : undefined,
      }),
    [page, debouncedSearch, status, method, category, reconciliation, dateFrom, dateTo, debouncedMin, debouncedMax],
  );

  const categoryOptions = useMemo(
    () => [{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.value, label: c.label }))],
    [categories],
  );

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setPage(1);
    setter(value);
  };

  const columns: Array<Column<RazorpayTransaction>> = [
    {
      key: 'date',
      header: 'Date',
      render: (row) => formatDate(row.transaction_date ?? row.created_at),
    },
    {
      key: 'description',
      header: 'Description',
      render: (row) => (
        <div className="cell-stack">
          {/* React escapes this, so a hostile description cannot inject markup. */}
          <span>{row.description || row.razorpay_payment_id}</span>
          <span className="small mono">{row.razorpay_payment_id}</span>
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', render: (row) => row.customer_name ?? '—' },
    {
      key: 'method',
      header: 'Method',
      render: (row) => (
        <div className="cell-stack">
          <span>{row.payment_method.toUpperCase()}</span>
          {row.method_detail ? <span className="small">{row.method_detail}</span> : null}
        </div>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount, row.currency) },
    { key: 'fee', header: 'Fee', align: 'right', render: (row) => formatCurrency(row.razorpay_fee + row.tax_on_fee) },
    {
      key: 'net',
      header: 'Net amount',
      align: 'right',
      render: (row) => <strong className="num">{formatCurrency(row.net_amount)}</strong>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={statusToneFor(row.payment_status)}>{row.payment_status.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <div className="cell-stack">
          <Badge tone={categoryTone(row.category)}>{row.category_label}</Badge>
          {row.category_status === 'suggested' && row.category_confidence != null ? (
            <span className="small">Suggested · {Math.round(row.category_confidence * 100)}%</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'reconciliation',
      header: 'Reconciliation',
      render: (row) => (
        <Badge tone={reconciliationTone(row.reconciliation_status)}>
          {row.reconciliation_status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
  ];

  return (
    <div className="stack">
      <Card>
        <Toolbar>
          <SearchInput
            value={search}
            onChange={resetPage(setSearch)}
            placeholder="Payment ID, order ID, customer or description…"
            label="Search Razorpay transactions"
          />
          <FilterSelect label="Status" value={status} onChange={resetPage(setStatus)} options={PAYMENT_STATUS_OPTIONS} />
          <FilterSelect label="Method" value={method} onChange={resetPage(setMethod)} options={PAYMENT_METHOD_OPTIONS} />
          <FilterSelect label="Category" value={category} onChange={resetPage(setCategory)} options={categoryOptions} />
          <FilterSelect
            label="Reconciliation"
            value={reconciliation}
            onChange={resetPage(setReconciliation)}
            options={RECONCILIATION_OPTIONS}
          />
          <label className="filter-select">
            <span>From</span>
            <input
              type="date"
              className="input"
              value={dateFrom}
              onChange={(event) => resetPage(setDateFrom)(event.target.value)}
            />
          </label>
          <label className="filter-select">
            <span>To</span>
            <input
              type="date"
              className="input"
              value={dateTo}
              onChange={(event) => resetPage(setDateTo)(event.target.value)}
            />
          </label>
          <label className="filter-select">
            <span>Min amount</span>
            <input
              type="number"
              min={0}
              className="input"
              value={amountMin}
              onChange={(event) => resetPage(setAmountMin)(event.target.value)}
            />
          </label>
          <label className="filter-select">
            <span>Max amount</span>
            <input
              type="number"
              min={0}
              className="input"
              value={amountMax}
              onChange={(event) => resetPage(setAmountMax)(event.target.value)}
            />
          </label>
        </Toolbar>

        {loading ? (
          <SkeletonRows rows={8} columns={10} />
        ) : error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title="No transactions match these filters"
            description="Clear the filters, or run a synchronisation from Settings → Integrations → Razorpay."
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data.items}
              rowKey={(row) => row.id}
              onRowClick={(row) => setSelected(row.id)}
              caption="Razorpay transactions"
            />
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      {selected ? (
        <RazorpayTransactionDetail
          paymentId={selected}
          categories={categories}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      ) : null}
    </div>
  );
}
