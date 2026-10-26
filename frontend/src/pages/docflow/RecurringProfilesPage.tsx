/** Recurring invoices or bills: profiles that create documents on a schedule. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pause, Play, Plus, Repeat, Square, Trash2, Zap } from 'lucide-react';

import { type Frequency, recurringApi, type RecurringKind, type RecurringProfile } from '@/api/docFlow';
import { contactsApi, itemsApi } from '@/api/endpoints';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { type Column, DataTable, Pagination } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, todayIso } from '@/utils/format';

import { LineItemsEditor, type LineDraft, lineTotals, linesError, linesFrom, linesPayload, newLine } from './LineItemsEditor';
import { RecurringJournalModal } from './RecurringJournalModal';
import { flowStatusLabel, flowStatusTone } from './status';

const PAGE_SIZE = 25;
const FREQUENCIES: Frequency[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

export function RecurringProfilesPage({ kind }: { kind: RecurringKind }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { canWrite } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<RecurringProfile | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RecurringProfile | null>(null);
  const { submitting, run, errorRef } = useSubmit();
  const list = useAsync((signal) => recurringApi.list({ kind, page, page_size: PAGE_SIZE }, signal), [kind, page]);
  const p = { invoice: 'recurringInvoices', bill: 'recurringBills', journal: 'recurringJournals' }[kind];

  const act = async (label: string, action: () => Promise<unknown>) => {
    const result = await run(action);
    if (result === null) {
      toast.error(errorRef.current ?? t('common.error.generic'));
      return;
    }
    toast.success(label);
    list.reload();
  };

  const runDue = async () => {
    const result = await run(() => recurringApi.runDue());
    if (!result) {
      toast.error(errorRef.current ?? t('common.error.generic'));
      return;
    }
    if (result.errors.length) toast.error(result.errors[0]);
    toast.success(t('recurring.ranDue', { count: result.created.length }));
    list.reload();
  };

  const frequencyText = (row: RecurringProfile) =>
    row.intervalCount > 1 ? t(`recurring.every.${row.frequency}`, { n: row.intervalCount }) : t(`recurring.frequency.${row.frequency}`);

  const columns: Array<Column<RecurringProfile>> = [
    { key: 'name', header: t('recurring.col.name'), render: (row) => <strong>{row.name}</strong> },
    ...(kind === 'journal'
      ? []
      : [{ key: 'contact', header: t(kind === 'invoice' ? 'docflow.form.customer' : 'docflow.form.vendor'), render: (row: RecurringProfile) => row.contactName }]),
    { key: 'frequency', header: t('recurring.col.frequency'), render: frequencyText },
    { key: 'next', header: t('recurring.col.next'), render: (row) => (row.nextRunDate ? formatDate(row.nextRunDate) : '—') },
    { key: 'runs', header: t('recurring.col.runs'), align: 'right', render: (row) => row.runsCount },
    {
      key: 'status',
      header: t('docflow.col.status'),
      render: (row) => (
        <>
          <Badge tone={flowStatusTone(row.status)}>{flowStatusLabel(row.status, t)}</Badge>
          {row.lastError ? <small className="text-danger block">{row.lastError}</small> : null}
        </>
      ),
    },
    { key: 'total', header: t('docflow.col.total'), align: 'right', render: (row) => formatCurrency(row.total) },
  ];
  if (canWrite) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <ActionMenu
          iconOnly
          label={t('recurring.actions')}
          items={[
            { key: 'now', label: t('recurring.action.runNow'), icon: <Zap size={14} />, disabled: row.status === 'stopped', onSelect: () => act(t('recurring.createdNow'), () => recurringApi.runNow(row.id)) },
            row.status === 'paused'
              ? { key: 'resume', label: t('recurring.action.resume'), icon: <Play size={14} />, onSelect: () => act(t('recurring.resumed'), () => recurringApi.resume(row.id)) }
              : { key: 'pause', label: t('recurring.action.pause'), icon: <Pause size={14} />, disabled: row.status !== 'active', onSelect: () => act(t('recurring.paused'), () => recurringApi.pause(row.id)) },
            { key: 'stop', label: t('recurring.action.stop'), icon: <Square size={14} />, disabled: ['stopped', 'completed'].includes(row.status), onSelect: () => act(t('recurring.stopped'), () => recurringApi.stop(row.id)) },
            { key: 'delete', label: t('recurring.action.delete'), icon: <Trash2 size={14} />, danger: true, onSelect: () => setDeleting(row) },
          ]}
        />
      ),
    });
  }

  const rows = list.data?.items ?? [];
  return (
    <>
      <PageHeader
        title={t(`${p}.title`)}
        subtitle={t(`${p}.subtitle`)}
        breadcrumb={[t({ invoice: 'sidebar.sales', bill: 'sidebar.purchases', journal: 'sidebar.accounting' }[kind]), t(`${p}.title`)]}
        actions={
          canWrite ? (
            <div className="row">
              <Button icon={<Repeat size={15} />} loading={submitting} onClick={runDue}>
                {t('recurring.runDue')}
              </Button>
              <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
                {t(`${p}.new`)}
              </Button>
            </div>
          ) : null
        }
      />
      <Card>
        {list.error ? (
          <ErrorBlock message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <SkeletonRows rows={5} columns={columns.length} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Repeat size={28} />} title={t(`${p}.empty.title`)} description={t(`${p}.empty.body`)} />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={canWrite ? (row) => setEditing(row) : undefined} caption={t(`${p}.title`)} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </Card>

      {editing && kind !== 'journal' ? (
        <ProfileModal
          kind={kind}
          profile={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
          onOpenDocument={(id) => navigate(kind === 'invoice' ? `/invoices/${id}` : `/bills/${id}/edit`)}
        />
      ) : editing ? (
        <RecurringJournalModal
          profile={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={t('recurring.confirmDeleteTitle')}
        message={t('recurring.confirmDelete', { name: deleting?.name ?? '' })}
        busy={submitting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) void act(t('recurring.deleted'), () => recurringApi.remove(target.id));
        }}
      />
    </>
  );
}

interface ProfileModalProps {
  kind: Exclude<RecurringKind, 'journal'>;
  profile: RecurringProfile | null;
  onClose: () => void;
  onSaved: () => void;
  onOpenDocument: (id: string) => void;
}

function ProfileModal({ kind, profile, onClose, onSaved, onOpenDocument }: ProfileModalProps) {
  const { t } = useAppContent();
  const toast = useToast();
  const { organization } = useAuth();
  const defaultTax = organization?.defaultTaxRate;
  const party = kind === 'invoice' ? 'customer' : 'vendor';
  const { submitting, error, fieldErrors, run, setError } = useSubmit();
  const tpl = profile?.template;

  const [name, setName] = useState(profile?.name ?? '');
  const [contactId, setContactId] = useState(profile?.contactId ?? '');
  const [frequency, setFrequency] = useState<Frequency>(profile?.frequency ?? 'monthly');
  const [intervalCount, setIntervalCount] = useState(String(profile?.intervalCount ?? 1));
  const [startDate, setStartDate] = useState(profile?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(profile?.endDate ?? '');
  const [autoIssue, setAutoIssue] = useState(profile?.autoIssue ?? false);
  const [reference, setReference] = useState(tpl?.reference ?? '');
  const [subject, setSubject] = useState(tpl?.subject ?? '');
  const [notes, setNotes] = useState(tpl?.notes ?? '');
  const [discountAmount, setDiscountAmount] = useState(String(tpl?.discountAmount ?? 0));
  const [lines, setLines] = useState<LineDraft[]>(() =>
    tpl ? linesFrom(tpl.lines.map((l) => ({ ...l, itemId: l.itemId ?? null })), String(defaultTax ?? 0)) : [newLine(String(defaultTax ?? 0))],
  );

  const contacts = useAsync((signal) => contactsApi.list({ type: party, page_size: 200 }, signal), [party]);
  const items = useAsync((signal) => itemsApi.list({ page_size: 200 }, signal), []);
  const documents = useAsync(async () => (profile ? recurringApi.documents(profile.id) : []), [profile?.id]);
  const contactOptions = useMemo(() => (contacts.data?.items ?? []).map((c) => ({ value: c.id, label: c.displayName })), [contacts.data]);
  const totals = lineTotals(lines, discountAmount);

  useEffect(() => {
    if (!name && contactId && contacts.data) {
      const contact = contacts.data.items.find((c) => c.id === contactId);
      if (contact) setName(t('recurring.defaultName', { name: contact.displayName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const submit = async () => {
    if (!contactId) {
      setError(t(`docflow.form.select.${party}`));
      return;
    }
    const problem = linesError(lines);
    if (problem) {
      setError(t(problem));
      return;
    }
    const body = {
      name: name.trim() || t('recurring.untitled'),
      kind,
      frequency,
      intervalCount: Math.max(1, Number(intervalCount) || 1),
      startDate,
      endDate: endDate || null,
      autoIssue,
      template: {
        [`${party}Id`]: contactId,
        reference: reference.trim() || null,
        subject: subject.trim() || null,
        notes: notes.trim() || null,
        discountAmount: totals.discount,
        lines: linesPayload(lines),
      },
    };
    const saved = await run(() => (profile ? recurringApi.update(profile.id, body) : recurringApi.create(body)));
    if (saved) {
      toast.success(t(profile ? 'recurring.updated' : 'recurring.created', { name: saved.name }));
      onSaved();
    }
  };

  return (
    <Modal
      open
      size="xl"
      title={profile ? t('recurring.editTitle', { name: profile.name }) : t(kind === 'invoice' ? 'recurringInvoices.new' : 'recurringBills.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} disabled={profile?.status === 'stopped'} onClick={submit}>
            {t('recurring.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('recurring.field.name')} required value={name} maxLength={120} error={fieldErrors.name} onChange={(e) => setName(e.target.value)} />
        <SelectField
          label={t(`docflow.form.${party}`)}
          required
          value={contactId}
          placeholder={t(`docflow.form.select.${party}`)}
          options={contactOptions}
          onChange={(e) => setContactId(e.target.value)}
        />
        <SelectField
          label={t('recurring.field.frequency')}
          value={frequency}
          options={FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.frequency.${f}`) }))}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
        />
        <TextField label={t('recurring.field.interval')} type="number" min="1" max="12" value={intervalCount} hint={t('recurring.field.intervalHint')} onChange={(e) => setIntervalCount(e.target.value)} />
        <TextField label={t('recurring.field.start')} type="date" required value={startDate} error={fieldErrors.startDate} onChange={(e) => setStartDate(e.target.value)} />
        <TextField label={t('recurring.field.end')} type="date" value={endDate} min={startDate} hint={t('recurring.field.endHint')} onChange={(e) => setEndDate(e.target.value)} />
        <TextField label={t('docflow.form.reference')} value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField label={t('docflow.form.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <CheckboxField
        label={t(kind === 'invoice' ? 'recurring.field.autoSend' : 'recurring.field.autoOpen')}
        hint={t('recurring.field.autoHint')}
        checked={autoIssue}
        onChange={(e) => setAutoIssue(e.target.checked)}
      />
      <div className="form-section">
        <LineItemsEditor lines={lines} onChange={setLines} items={items.data?.items ?? []} itemsLoading={items.loading} party={party} defaultTaxRate={defaultTax} />
      </div>
      <div className="grid-2 form-section">
        <TextAreaField label={t('docflow.form.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div>
          <TextField label={t('docflow.form.discount')} type="number" min="0" step="0.01" prefix="₹" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
          <div className="totals-list">
            <div className="grand">
              <span>{t('recurring.eachDocument')}</span>
              <span>{formatCurrency(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>
      {profile && documents.data?.length ? (
        <div className="form-section">
          <h4>{t('recurring.generated', { count: documents.data.length })}</h4>
          <ul className="plain-list">
            {documents.data.map((doc) => (
              <li key={doc.id}>
                <button type="button" className="btn btn-link btn-sm" onClick={() => onOpenDocument(doc.id)}>
                  {doc.number}
                </button>{' '}
                · {formatDate(doc.date)} · {flowStatusLabel(doc.status, t)} · {formatCurrency(doc.total)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}
