import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { projectsApi } from '@/api/endpoints';
import type { Project, TimeEntry } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { CheckboxField } from '@/components/ui/Field';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatDate, formatNumber, round2, todayIso } from '@/utils/format';

import { TimeEntryModal } from './TimeEntryModal';

const PAGE_SIZE = 25;
const SUMMARY_PAGE_SIZE = 200;

/** Monday-to-Sunday range containing today. */
function currentWeek(): { start: string; end: string } {
  const today = todayIso();
  const mondayOffset = (new Date(`${today}T00:00:00`).getDay() + 6) % 7;
  const start = addDaysIso(today, -mondayOffset);
  return { start, end: addDaysIso(start, 6) };
}

export function TimesheetsTab({ projects, onEntriesChanged }: { projects: Project[]; onEntriesChanged: () => void }) {
  const { canWrite } = useAuth();
  const toast = useToast();
  const week = currentWeek();
  const [page, setPage] = useState(1);
  const [projectFilter, setProjectFilter] = useState('');
  const [startDate, setStartDate] = useState(week.start);
  const [endDate, setEndDate] = useState(week.end);
  const [unbilledOnly, setUnbilledOnly] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; entry: TimeEntry | null }>({ open: false, entry: null });
  const [deleteTarget, setDeleteTarget] = useState<TimeEntry | null>(null);

  const query = {
    project_id: projectFilter || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
    unbilled_only: unbilledOnly || undefined,
  };

  const entries = useAsync(
    () => projectsApi.timeEntries({ ...query, page, page_size: PAGE_SIZE }),
    [projectFilter, startDate, endDate, unbilledOnly, page],
  );

  const rangeTotals = useAsync(
    () => projectsApi.timeEntries({ ...query, page: 1, page_size: SUMMARY_PAGE_SIZE }),
    [projectFilter, startDate, endDate, unbilledOnly],
  );

  const action = useSubmit();
  useEffect(() => {
    if (action.error) toast.error(action.error);
  }, [action.error, toast]);

  const refresh = () => {
    entries.reload();
    rangeTotals.reload();
    onEntriesChanged();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await action.run(() => projectsApi.removeTime(deleteTarget.id));
    setDeleteTarget(null);
    if (result) {
      toast.success(result.message);
      refresh();
    }
  };

  const resetPage = () => setPage(1);

  const summaryRows = rangeTotals.data?.items ?? [];
  const totalHours = round2(summaryRows.reduce((sum, entry) => sum + entry.hours, 0));
  const billableHours = round2(summaryRows.filter((entry) => entry.isBillable).reduce((sum, entry) => sum + entry.hours, 0));
  const summaryTruncated = (rangeTotals.data?.total ?? 0) > summaryRows.length;

  const rows = entries.data?.items ?? [];

  const columns: Array<Column<TimeEntry>> = [
    { key: 'date', header: 'Date', render: (entry) => formatDate(entry.date) },
    {
      key: 'project',
      header: 'Project',
      render: (entry) => (
        <div className="cell-stack">
          <span>{entry.projectName}</span>
          {entry.customerName ? <small>{entry.customerName}</small> : null}
        </div>
      ),
    },
    { key: 'user', header: 'Logged by', render: (entry) => entry.userName },
    { key: 'hours', header: 'Hours', align: 'right', render: (entry) => <span className="num">{formatNumber(entry.hours)}</span> },
    { key: 'description', header: 'Description', render: (entry) => <span className="text-muted">{entry.description ?? '—'}</span> },
    {
      key: 'billable',
      header: 'Billable',
      render: (entry) => <Badge tone={entry.isBillable ? 'success' : 'neutral'}>{entry.isBillable ? 'Billable' : 'Non-billable'}</Badge>,
    },
    {
      key: 'invoiced',
      header: 'Invoiced',
      render: (entry) =>
        entry.invoiceId ? (
          <Link className="btn btn-link btn-sm" to={`/invoices/${entry.invoiceId}`}>
            <span>View invoice</span>
          </Link>
        ) : (
          <Badge tone="warning">Unbilled</Badge>
        ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            width: '80px',
            render: (entry: TimeEntry) => (
              <div className="row-actions" title={entry.invoiceId ? 'Invoiced time entries cannot be edited or deleted' : undefined}>
                <button
                  type="button"
                  className="action-btn"
                  aria-label={`Edit time entry from ${formatDate(entry.date)}`}
                  disabled={!!entry.invoiceId}
                  onClick={() => setModal({ open: true, entry })}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  className="action-btn is-danger"
                  aria-label={`Delete time entry from ${formatDate(entry.date)}`}
                  disabled={!!entry.invoiceId}
                  onClick={() => setDeleteTarget(entry)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Toolbar>
        <FilterSelect
          label="Project"
          value={projectFilter}
          options={[{ value: '', label: 'All projects' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
          onChange={(value) => {
            setProjectFilter(value);
            resetPage();
          }}
        />
        <label className="filter-select">
          <span>From</span>
          <input
            type="date"
            className="select select-sm"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              resetPage();
            }}
          />
        </label>
        <label className="filter-select">
          <span>To</span>
          <input
            type="date"
            className="select select-sm"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              resetPage();
            }}
          />
        </label>
        <CheckboxField
          label="Unbilled only"
          checked={unbilledOnly}
          onChange={(event) => {
            setUnbilledOnly(event.target.checked);
            resetPage();
          }}
        />
        <IfCanWrite>
          <Button variant="primary" size="sm" onClick={() => setModal({ open: true, entry: null })} disabled={!projects.length}>
            Log time
          </Button>
        </IfCanWrite>
      </Toolbar>

      <Card title="Timesheets" subtitle={`${entries.data?.total ?? 0} entry(s) in the selected range`}>
        <p className="small text-muted">
          {formatDate(startDate)} – {formatDate(endDate)}: <span className="strong num">{formatNumber(totalHours)} h</span> logged ·{' '}
          <span className="strong num">{formatNumber(billableHours)} h</span> billable
          {summaryTruncated ? ` (first ${summaryRows.length} entries)` : ''}
        </p>

        {entries.loading ? (
          <SkeletonRows rows={8} columns={7} />
        ) : entries.error ? (
          <ErrorBlock message={entries.error} onRetry={entries.reload} />
        ) : !rows.length ? (
          <EmptyState title="No time logged in this range" description="Change the date range or log time against a project." />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(entry) => entry.id} caption="Time entries" />
            <Pagination page={page} pageSize={PAGE_SIZE} total={entries.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>

      <TimeEntryModal
        open={modal.open}
        entry={modal.entry}
        projects={projects}
        onClose={() => setModal({ open: false, entry: null })}
        onSaved={(message) => {
          setModal({ open: false, entry: null });
          toast.success(message);
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete time entry"
        message={
          deleteTarget
            ? `Delete the ${formatNumber(deleteTarget.hours)} hour entry on ${deleteTarget.projectName} dated ${formatDate(deleteTarget.date)}?`
            : ''
        }
        confirmLabel="Delete"
        busy={action.submitting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
