/** Customers and vendors share this page; every label follows the `type` prop. */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileDown, FileSpreadsheet, FileText, Mail, Pencil, Plus, Send, Trash2, Users } from 'lucide-react';

import { contactsApi, emailApi } from '@/api/endpoints';
import type { Contact, ContactType, GstTreatment } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/AuthContext';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDateTime, formatNumber } from '@/utils/format';
import { GST_TREATMENTS, type Tone } from '@/utils/status';

const PAGE_SIZE = 25;

const GST_OPTIONS = GST_TREATMENTS.map((treatment) => ({ value: treatment.value, label: treatment.label }));

function gstLabel(treatment: GstTreatment): string {
  return GST_TREATMENTS.find((option) => option.value === treatment)?.label ?? treatment;
}

interface Copy {
  plural: string;
  singular: string;
  documentsLabel: string;
  documentsPath: string;
  invoicedLabel: string;
}

function copyFor(type: ContactType): Copy {
  return type === 'customer'
    ? { plural: 'Customers', singular: 'customer', documentsLabel: 'invoices', documentsPath: '/invoices?customer=', invoicedLabel: 'Total invoiced' }
    : { plural: 'Vendors', singular: 'vendor', documentsLabel: 'bills', documentsPath: '/bills?vendor=', invoicedLabel: 'Total billed' };
}

function balanceTone(amount: number): string {
  if (amount > 0) return 'num text-danger';
  if (amount < 0) return 'num text-success';
  return 'num text-muted';
}

export function ContactsPage({ type }: { type: ContactType }) {
  const toast = useToast();
  const copy = copyFor(type);
  const { canWrite } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [formContact, setFormContact] = useState<Contact | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [emailContact, setEmailContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const deleteSubmit = useSubmit();

  // Reset paging and filters when switching between customers and vendors.
  useEffect(() => {
    setSearch('');
    setIncludeInactive(false);
    setPage(1);
    setSelectedIds(new Set());
    setSelectAllPages(false);
  }, [type]);

  // Reset selection when page changes
  useEffect(() => {
    if (!selectAllPages) {
      setSelectedIds(new Set());
    }
  }, [page, selectAllPages]);

  const list = useAsync(
    (signal) =>
      contactsApi.list(
        {
          type,
          search: debouncedSearch.trim() || undefined,
          include_inactive: includeInactive,
          page,
          page_size: PAGE_SIZE,
        },
        signal,
      ),
    [type, debouncedSearch, includeInactive, page],
  );

  const rows = list.data?.items ?? [];
  const outstandingTotal = rows.reduce((sum, contact) => sum + contact.outstandingBalance, 0);
  const withBalance = rows.filter((contact) => contact.outstandingBalance > 0).length;

  function openCreate() {
    setFormContact(null);
    setFormOpen(true);
  }

  const wantsNew = canWrite && searchParams.get('new') === '1';
  useEffect(() => {
    if (wantsNew) {
      setFormContact(null);
      setFormOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  function closeForm() {
    setFormOpen(false);
    setFormContact(null);
    if (searchParams.has('new')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const result = await deleteSubmit.run(() => contactsApi.remove(deleteTarget.id));
    if (!result) return;
    if (result.message.toLowerCase().includes('inactive')) toast.notify(result.message, 'warning');
    else toast.success(result.message);
    setDeleteTarget(null);
    list.reload();
  }

  async function confirmBulkDelete(allPages = false) {
    const isAll = allPages || selectAllPages;
    const totalCount = list.data?.total ?? 0;
    const count = isAll ? totalCount : selectedIds.size;
    if (count === 0) return;

    const promptMsg = isAll
      ? `Are you sure you want to delete ALL ${totalCount} ${copy.plural.toLowerCase()} across ALL pages? Contacts with existing transactions will be safely marked inactive.`
      : `Delete ${selectedIds.size} selected ${copy.plural.toLowerCase()}?`;

    if (!window.confirm(promptMsg)) return;

    setBulkDeleting(true);
    try {
      const res = await contactsApi.bulkDelete({
        all_matching: isAll,
        ids: isAll ? undefined : Array.from(selectedIds),
        type,
        search: debouncedSearch.trim() || undefined,
        include_inactive: includeInactive,
      });
      if (res.deactivated > 0) {
        toast.notify(res.message, 'warning');
      } else {
        toast.success(res.message);
      }
      setSelectedIds(new Set());
      setSelectAllPages(false);
      list.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to delete ${copy.plural.toLowerCase()}`;
      toast.error(msg);
    } finally {
      setBulkDeleting(false);
    }
  }

  const columns: Array<Column<Contact>> = [
    {
      key: 'displayName',
      header: 'Name',
      render: (contact) => (
        <div className="cell-stack">
          <span className="strong">{contact.displayName}</span>
          {contact.companyName ? <small className="text-muted">{contact.companyName}</small> : null}
          {contact.isActive ? null : <small><Badge tone="neutral">Inactive</Badge></small>}
        </div>
      ),
    },
    { key: 'contactPerson', header: 'Contact person', render: (contact) => contact.contactPerson || <span className="text-muted">—</span> },
    {
      key: 'email',
      header: 'Email',
      render: (contact) => (contact.email ? <a href={`mailto:${contact.email}`} onClick={(event) => event.stopPropagation()}>{contact.email}</a> : <span className="text-muted">—</span>),
    },
    {
      key: 'mailing',
      header: 'Mailing / Gmail',
      render: (contact) => (
        contact.email ? (
          <div className="row-actions" onClick={(event) => event.stopPropagation()} style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="action-btn"
              title={`Send Gmail to ${contact.displayName}`}
              aria-label={`Send Gmail to ${contact.displayName}`}
              onClick={() => setEmailContact(contact)}
              style={{ color: '#ea4335' }}
            >
              <Mail size={15} />
            </button>
            <a
              href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contact.email)}&su=${encodeURIComponent(`Communication from Rooman Technologies - ${contact.displayName}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="action-btn"
              title="Open directly in Gmail web"
              aria-label={`Open Gmail web compose for ${contact.displayName}`}
            >
              <Send size={13} />
            </a>
          </div>
        ) : (
          <span className="text-muted">—</span>
        )
      ),
    },
    { key: 'phone', header: 'Phone', render: (contact) => contact.phone || <span className="text-muted">—</span> },
    { key: 'gstin', header: 'GSTIN', render: (contact) => (contact.gstin ? <span className="code-tag">{contact.gstin}</span> : <span className="text-muted">—</span>) },
    { key: 'paymentTermsDays', header: 'Terms', align: 'right', render: (contact) => <span className="text-muted small">{`${formatNumber(contact.paymentTermsDays, 0)} days`}</span> },
    {
      key: 'outstandingBalance',
      header: 'Outstanding',
      align: 'right',
      render: (contact) => <span className={balanceTone(contact.outstandingBalance)}>{formatCurrency(contact.outstandingBalance)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (contact) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <Link className="action-btn" to={`${copy.documentsPath}${contact.id}`} aria-label={`View ${copy.documentsLabel} for ${contact.displayName}`}>
            <FileText size={15} />
          </Link>
          <IfCanWrite>
            <button
              type="button"
              className="action-btn"
              aria-label={`Edit ${contact.displayName}`}
              onClick={() => {
                setFormContact(contact);
                setFormOpen(true);
              }}
            >
              <Pencil size={15} />
            </button>
            <button type="button" className="action-btn is-danger" aria-label={`Delete ${contact.displayName}`} onClick={() => setDeleteTarget(contact)}>
              <Trash2 size={15} />
            </button>
          </IfCanWrite>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={copy.plural}
        subtitle={
          type === 'customer'
            ? 'Everyone you invoice, with their balances and payment terms.'
            : 'Everyone you buy from, with their balances and payment terms.'
        }
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<FileDown size={15} />}
              onClick={() =>
                contactsApi.exportPdf({
                  type,
                  include_inactive: includeInactive,
                  search: debouncedSearch.trim() || undefined,
                })
              }
            >
              Extract PDF
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={15} />}
              onClick={() =>
                contactsApi.exportExcel({
                  type,
                  include_inactive: includeInactive,
                  search: debouncedSearch.trim() || undefined,
                })
              }
            >
              Extract Excel
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
                New {copy.singular}
              </Button>
            </IfCanWrite>
          </div>
        }
      />

      {list.data ? (
        <div className="stat-grid">
          <StatTile label={copy.plural} value={formatNumber(list.data.total, 0)} sublabel={includeInactive ? 'Including inactive' : 'Active only'} icon={<Users size={16} />} />
          <StatTile
            label="Outstanding on this page"
            value={formatCurrency(outstandingTotal)}
            sublabel={type === 'customer' ? 'Receivable from these customers' : 'Payable to these vendors'}
            tone={outstandingTotal > 0 ? 'warning' : 'neutral'}
          />
          <StatTile label="With a balance" value={formatNumber(withBalance, 0)} sublabel={`of ${formatNumber(rows.length, 0)} shown`} />
        </div>
      ) : null}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={`Search ${copy.plural.toLowerCase()}…`}
          label={`Search ${copy.plural.toLowerCase()}`}
        />
        <CheckboxField
          label="Include inactive"
          checked={includeInactive}
          onChange={(event) => {
            setIncludeInactive(event.target.checked);
            setPage(1);
          }}
        />
      </Toolbar>

      <div className="card">
        {list.loading ? (
          <div className="card-body">
            <SkeletonRows rows={6} columns={6} />
          </div>
        ) : list.error ? (
          <div className="card-body">
            <ErrorBlock message={list.error} onRetry={list.reload} />
          </div>
        ) : !rows.length ? (
          <div className="card-body">
            <EmptyState
              title={`No ${copy.plural.toLowerCase()} yet`}
              description={
                type === 'customer'
                  ? 'Add a customer to start raising invoices and tracking what you are owed.'
                  : 'Add a vendor to start recording bills and tracking what you owe.'
              }
              icon={<Users size={28} aria-hidden="true" />}
              action={
                <IfCanWrite>
                  <Button variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
                    New {copy.singular}
                  </Button>
                </IfCanWrite>
              }
            />
          </div>
        ) : (
          <>
            <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-subtle, #f8fafc)', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (selectAllPages || selectedIds.size === rows.length) {
                      setSelectedIds(new Set());
                      setSelectAllPages(false);
                    } else {
                      setSelectedIds(new Set(rows.map((r) => r.id)));
                      setSelectAllPages(false);
                    }
                  }}
                >
                  {selectAllPages
                    ? 'Clear All Selection'
                    : selectedIds.size === rows.length && rows.length > 0
                    ? 'Deselect Page'
                    : `Select All on Page (${rows.length})`}
                </Button>

                {(list.data?.total ?? 0) > rows.length && (
                  <Button
                    size="sm"
                    variant={selectAllPages ? 'primary' : 'secondary'}
                    onClick={() => {
                      if (selectAllPages) {
                        setSelectAllPages(false);
                        setSelectedIds(new Set());
                      } else {
                        setSelectAllPages(true);
                        setSelectedIds(new Set(rows.map((r) => r.id)));
                      }
                    }}
                  >
                    {selectAllPages
                      ? `✓ All ${list.data?.total} Across All Pages Selected`
                      : `Select All ${list.data?.total} Across All Pages`}
                  </Button>
                )}

                {selectAllPages ? (
                  <span className="small font-medium" style={{ color: 'var(--color-primary, #2563eb)' }}>
                    All {list.data?.total} {copy.plural.toLowerCase()} selected across all pages
                  </span>
                ) : selectedIds.size > 0 ? (
                  <span className="small text-muted">{selectedIds.size} selected on this page</span>
                ) : null}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {canWrite && (list.data?.total ?? 0) > 0 && !selectedIds.size && !selectAllPages && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={bulkDeleting}
                    onClick={() => void confirmBulkDelete(true)}
                    icon={<Trash2 size={13} />}
                    style={{ color: 'var(--color-danger, #dc2626)' }}
                    title={`Delete all ${list.data?.total} ${copy.plural.toLowerCase()} across all pages at once`}
                  >
                    Delete All {copy.plural} ({list.data?.total} all pages)
                  </Button>
                )}

                {(selectAllPages || selectedIds.size > 0) && canWrite ? (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={bulkDeleting}
                    onClick={() => void confirmBulkDelete()}
                    icon={<Trash2 size={13} />}
                  >
                    {selectAllPages
                      ? `Delete All ${list.data?.total} ${copy.plural} (All Pages)`
                      : `Delete Selected (${selectedIds.size})`}
                  </Button>
                ) : null}
              </div>
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(contact) => contact.id}
              onRowClick={(contact) => setDetailsId(contact.id)}
              caption={`${copy.plural} list`}
              selectedKeys={selectedIds}
              onSelectRow={(id) => {
                const next = new Set(selectedIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setSelectedIds(next);
              }}
              onSelectAll={() => {
                if (selectedIds.size === rows.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(rows.map((r) => r.id)));
              }}
              isAllSelected={rows.length > 0 && selectedIds.size === rows.length}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} />
          </>
        )}
      </div>

      {formOpen ? (
        <ContactFormModal
          type={type}
          contact={formContact}
          copy={copy}
          onClose={closeForm}
          onSaved={(message) => {
            toast.success(message);
            closeForm();
            list.reload();
          }}
        />
      ) : null}

      {detailsId ? (
        <ContactDetailsModal
          contactId={detailsId}
          copy={copy}
          onClose={() => setDetailsId(null)}
          onEdit={(contact) => {
            setDetailsId(null);
            setFormContact(contact);
            setFormOpen(true);
          }}
          onSendEmail={(contact) => {
            setDetailsId(null);
            setEmailContact(contact);
          }}
        />
      ) : null}

      {emailContact ? (
        <SendContactEmailModal
          contact={emailContact}
          onClose={() => setEmailContact(null)}
          onSent={(message) => {
            toast.success(message);
            setEmailContact(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${copy.singular}`}
        message={
          <>
            <FormError message={deleteSubmit.error} />
            {deleteTarget
              ? `Delete “${deleteTarget.displayName}”? If this ${copy.singular} has ${copy.documentsLabel} they will be deactivated instead of deleted.`
              : ''}
          </>
        }
        confirmLabel={`Delete ${copy.singular}`}
        busy={deleteSubmit.submitting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          deleteSubmit.reset();
        }}
      />
    </>
  );
}

interface FormState {
  displayName: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  gstin: string;
  pan: string;
  gstTreatment: GstTreatment;
  paymentTermsDays: string;
  billingAddress: string;
  shippingAddress: string;
  notes: string;
}

function initialForm(contact: Contact | null): FormState {
  return {
    displayName: contact?.displayName ?? '',
    companyName: contact?.companyName ?? '',
    contactPerson: contact?.contactPerson ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    gstin: contact?.gstin ?? '',
    pan: contact?.pan ?? '',
    gstTreatment: contact?.gstTreatment ?? 'unregistered',
    paymentTermsDays: String(contact?.paymentTermsDays ?? 30),
    billingAddress: contact?.billingAddress ?? '',
    shippingAddress: contact?.shippingAddress ?? '',
    notes: contact?.notes ?? '',
  };
}

interface ContactFormModalProps {
  type: ContactType;
  contact: Contact | null;
  copy: Copy;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function ContactFormModal({ type, contact, copy, onClose, onSaved }: ContactFormModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => initialForm(contact));
  const { submitting, error, fieldErrors, run } = useSubmit();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    if (type === 'customer' && !form.email.trim()) {
      toast.error('Customer email is required for invoices and payment notifications');
      return;
    }
    const payload: Partial<Contact> = {
      type,
      displayName: form.displayName.trim(),
      companyName: form.companyName.trim() || null,
      contactPerson: form.contactPerson.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      gstin: form.gstin.trim() || null,
      pan: form.pan.trim() || null,
      gstTreatment: form.gstTreatment,
      paymentTermsDays: Number.parseInt(form.paymentTermsDays, 10) || 0,
      billingAddress: form.billingAddress.trim() || null,
      shippingAddress: form.shippingAddress.trim() || null,
      notes: form.notes.trim() || null,
    };
    const result = await run(() => (contact ? contactsApi.update(contact.id, payload) : contactsApi.create(payload)));
    if (result) onSaved(contact ? `${result.displayName} updated` : `${result.displayName} added`);
  }

  return (
    <Modal
      open
      size="lg"
      title={contact ? `Edit ${copy.singular}` : `New ${copy.singular}`}
      subtitle={contact ? contact.displayName : `Details used on ${copy.documentsLabel} and statements`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" loading={submitting} onClick={save}>
            {contact ? 'Save changes' : `Create ${copy.singular}`}
          </Button>
        </>
      }
    >
      <FormError message={error} />

      <section className="form-section">
        <h3 className="form-section-title">Identity</h3>
        <div className="form-grid">
          <TextField label="Display name" required value={form.displayName} error={fieldErrors.displayName} onChange={(event) => set('displayName', event.target.value)} />
          <TextField label="Company name" value={form.companyName} error={fieldErrors.companyName} onChange={(event) => set('companyName', event.target.value)} />
          <TextField label="Contact person" value={form.contactPerson} error={fieldErrors.contactPerson} onChange={(event) => set('contactPerson', event.target.value)} />
          <TextField label="Email" type="email" required={type === 'customer'} value={form.email} error={fieldErrors.email} onChange={(event) => set('email', event.target.value)} />
          <TextField label="Phone" type="tel" value={form.phone} error={fieldErrors.phone} onChange={(event) => set('phone', event.target.value)} />
        </div>
      </section>

      <section className="form-section">
        <h3 className="form-section-title">Tax and terms</h3>
        <div className="form-grid">
          <TextField label="GSTIN" value={form.gstin} error={fieldErrors.gstin} onChange={(event) => set('gstin', event.target.value)} />
          <TextField label="PAN" value={form.pan} error={fieldErrors.pan} onChange={(event) => set('pan', event.target.value)} />
          <SelectField
            label="GST treatment"
            value={form.gstTreatment}
            options={GST_OPTIONS}
            error={fieldErrors.gstTreatment}
            onChange={(event) => set('gstTreatment', event.target.value as GstTreatment)}
          />
          <TextField
            label="Payment terms (days)"
            type="number"
            min="0"
            max="365"
            value={form.paymentTermsDays}
            error={fieldErrors.paymentTermsDays}
            onChange={(event) => set('paymentTermsDays', event.target.value)}
          />
        </div>
      </section>

      <section className="form-section">
        <h3 className="form-section-title">Addresses</h3>
        <div className="form-grid">
          <TextAreaField label="Billing address" value={form.billingAddress} error={fieldErrors.billingAddress} onChange={(event) => set('billingAddress', event.target.value)} />
          <TextAreaField label="Shipping address" value={form.shippingAddress} error={fieldErrors.shippingAddress} onChange={(event) => set('shippingAddress', event.target.value)} />
        </div>
        <TextAreaField label="Notes" rows={2} value={form.notes} error={fieldErrors.notes} onChange={(event) => set('notes', event.target.value)} />
      </section>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

interface ContactDetailsModalProps {
  contactId: string;
  copy: Copy;
  onClose: () => void;
  onEdit: (contact: Contact) => void;
  onSendEmail?: (contact: Contact) => void;
}

function ContactDetailsModal({ contactId, copy, onClose, onEdit, onSendEmail }: ContactDetailsModalProps) {
  const summary = useAsync(() => contactsApi.summary(contactId), [contactId]);
  const contact = summary.data?.contact ?? null;
  const dash = <span className="text-muted">—</span>;

  const overdueTone: Tone = summary.data && summary.data.overdue > 0 ? 'danger' : 'success';

  return (
    <Modal
      open
      size="lg"
      title={contact?.displayName ?? copy.plural}
      subtitle={contact?.companyName ?? undefined}
      onClose={onClose}
      footer={
        <>
          <Link className="btn btn-secondary btn-md" to={`${copy.documentsPath}${contactId}`}>
            <span>View {copy.documentsLabel}</span>
          </Link>
          {contact && contact.email && onSendEmail ? (
            <Button
              variant="secondary"
              icon={<Mail size={15} style={{ color: '#ea4335' }} />}
              onClick={() => onSendEmail(contact)}
            >
              Send Gmail
            </Button>
          ) : null}
          {contact ? (
            <IfCanWrite>
              <Button variant="primary" icon={<Pencil size={15} />} onClick={() => onEdit(contact)}>
                Edit {copy.singular}
              </Button>
            </IfCanWrite>
          ) : null}
        </>
      }
    >
      {summary.loading ? (
        <SkeletonRows rows={4} columns={3} />
      ) : summary.error || !summary.data || !contact ? (
        <ErrorBlock message={summary.error ?? 'This contact could not be loaded.'} onRetry={summary.reload} />
      ) : (
        <>
          <div className="stat-grid">
            <StatTile label={copy.invoicedLabel} value={formatCurrency(summary.data.totalInvoiced)} sublabel={`${formatNumber(summary.data.documentCount, 0)} ${copy.documentsLabel}`} />
            <StatTile label="Total paid" value={formatCurrency(summary.data.totalPaid)} tone="positive" />
            <StatTile label="Outstanding" value={formatCurrency(summary.data.outstanding)} tone={summary.data.outstanding > 0 ? 'warning' : 'neutral'} />
            <StatTile label="Overdue" value={formatCurrency(summary.data.overdue)} tone={summary.data.overdue > 0 ? 'negative' : 'neutral'} />
          </div>

          <div className="detail-grid">
            <Detail label="Status" value={<Badge tone={contact.isActive ? 'success' : 'neutral'}>{contact.isActive ? 'Active' : 'Inactive'}</Badge>} />
            <Detail label="Overdue" value={<Badge tone={overdueTone}>{formatCurrency(summary.data.overdue)}</Badge>} />
            <Detail label="Contact person" value={contact.contactPerson || dash} />
            <Detail
              label="Email"
              value={
                contact.email ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <a href={`mailto:${contact.email}`}>{contact.email}</a>
                    {onSendEmail ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => onSendEmail(contact)}
                      >
                        <Mail size={12} style={{ color: '#ea4335' }} />
                        <span>Send Gmail</span>
                      </button>
                    ) : null}
                  </span>
                ) : (
                  dash
                )
              }
            />
            <Detail label="Phone" value={contact.phone || dash} />
            <Detail label="GSTIN" value={contact.gstin ? <span className="code-tag">{contact.gstin}</span> : dash} />
            <Detail label="PAN" value={contact.pan ? <span className="code-tag">{contact.pan}</span> : dash} />
            <Detail label="GST treatment" value={gstLabel(contact.gstTreatment)} />
            <Detail label="Payment terms" value={`${formatNumber(contact.paymentTermsDays, 0)} days`} />
            <Detail label="Billing address" value={contact.billingAddress || dash} />
            <Detail label="Shipping address" value={contact.shippingAddress || dash} />
            <Detail label="Notes" value={contact.notes || dash} />
            <Detail label="Created" value={formatDateTime(contact.createdAt)} />
            <Detail label="Last updated" value={formatDateTime(contact.updatedAt)} />
          </div>

          <p className="small text-muted">
            <Link className="text-primary" to={`${copy.documentsPath}${contact.id}`}>
              Open all {copy.documentsLabel} for {contact.displayName}
            </Link>
          </p>
        </>
      )}
    </Modal>
  );
}

interface SendContactEmailModalProps {
  contact: Contact;
  onClose: () => void;
  onSent: (message: string) => void;
}

function SendContactEmailModal({ contact, onClose, onSent }: SendContactEmailModalProps) {
  const [subject, setSubject] = useState(`Communication from Rooman Technologies - ${contact.displayName}`);
  const [message, setMessage] = useState(
    `Dear ${contact.contactPerson || contact.displayName},\n\nWe are reaching out to you from Rooman Technologies regarding your account. Please feel free to get in touch if you have any questions.\n\nWarm regards,\nAccounts & Client Relations\nRooman Technologies Pvt Ltd`
  );
  const { submitting, error, run } = useSubmit();

  async function handleSend() {
    if (!contact.email) return;
    const result = await run(() =>
      emailApi.sendMessage({
        to_email: contact.email!,
        subject: subject.trim(),
        message: message.trim(),
        recipient_name: contact.contactPerson || contact.displayName,
      })
    );
    if (result) {
      onSent(`Email sent to ${contact.email} successfully via Gmail`);
    }
  }

  const gmailWebUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contact.email ?? '')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

  return (
    <Modal
      open
      size="md"
      title="Send Email via Gmail"
      subtitle={`To: ${contact.displayName} (${contact.email})`}
      onClose={onClose}
      footer={
        <>
          <a
            href={gmailWebUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-md"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Send size={14} />
            <span>Open in Gmail Web</span>
          </a>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            icon={<Mail size={15} />}
            onClick={handleSend}
          >
            Send via Gmail
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField
          label="To Email"
          value={contact.email ?? ''}
          disabled
        />
        <TextField
          label="Subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <TextAreaField
        label="Email Message"
        rows={6}
        required
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
    </Modal>
  );
}
