/** Customers and vendors share this page; every label follows the `type` prop. */
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileDown, FileSpreadsheet, FileText, Mail, Pencil, Plus, Trash2, Users } from 'lucide-react';

import { contactsApi } from '@/api/endpoints';
import type { Contact, ContactType, GstTreatment } from '@/api/types';
import { useAsync } from '@/hooks/useAsync';
import { useDebounced } from '@/hooks/useDebounced';
import { useDownload } from '@/hooks/useDownload';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/AuthContext';
import { IfCanWrite } from '@/auth/RouteGuards';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StatTile } from '@/components/ui/Card';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { CheckboxField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDateTime, formatNumber } from '@/utils/format';
import { gstTreatmentLabel, type Tone, type Translate } from '@/utils/status';

const PAGE_SIZE = 25;


function gstLabel(treatment: GstTreatment, t: Translate): string {
  return gstTreatmentLabel(treatment, t);
}

interface Copy {
  /** Text-catalog group whose kind-specific strings this page shows. */
  group: 'customers' | 'vendors';
  documentsPath: string;
}

function copyFor(type: ContactType): Copy {
  return type === 'customer'
    ? { group: 'customers', documentsPath: '/invoices?customer=' }
    : { group: 'vendors', documentsPath: '/bills?vendor=' };
}

function balanceTone(amount: number): string {
  if (amount > 0) return 'num text-danger';
  if (amount < 0) return 'num text-success';
  return 'num text-muted';
}

function formatVendorMaskedName(name: string | null | undefined, isVendor: boolean): string {
  if (!name) return '';
  if (!isVendor || name.length <= 10) return name;
  return name.slice(0, 10) + '*'.repeat(name.length - 10);
}

export function ContactsPage({ type }: { type: ContactType }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { download } = useDownload();
  const copy = copyFor(type);
  const textGroup = type === 'customer' ? 'customers' : 'vendors';
  const { canWrite } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);

  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [emailContact, setEmailContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllPages, setSelectAllPages] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<{ allPages: boolean } | null>(null);
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

  const basePath = type === 'customer' ? '/customers' : '/vendors';

  function openCreate() {
    navigate(`${basePath}/new`);
  }

  // The header's Create menu links here with ?new=1; send it on to the form page.
  const wantsNew = canWrite && searchParams.get('new') === '1';
  useEffect(() => {
    if (wantsNew) navigate(`${basePath}/new`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

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
      const msg = err instanceof Error ? err.message : t(`${textGroup}.list.deleteFailed`);
      toast.error(msg);
    } finally {
      setBulkDeleting(false);
    }
  }

  const columns: Array<Column<Contact>> = [
    {
      key: 'displayName',
      header: t('customers.col.name'),
      render: (contact) => {
        const maskedName = formatVendorMaskedName(contact.displayName, type === 'vendor');
        return (
          <div className="cell-stack">
            <span className="strong" title={contact.displayName}>{maskedName}</span>
            {contact.companyName ? <small className="text-muted">{contact.companyName}</small> : null}
            {contact.isActive ? null : <small><Badge tone="neutral">{t('customers.status.inactive')}</Badge></small>}
          </div>
        );
      },
    },
    {
      key: 'contactPerson',
      header: t('customers.col.contactPerson'),
      render: (contact) => {
        if (!contact.contactPerson) return <span className="text-muted">—</span>;
        const maskedPerson = formatVendorMaskedName(contact.contactPerson, type === 'vendor');
        return <span title={contact.contactPerson}>{maskedPerson}</span>;
      },
    },
    {
      key: 'email',
      header: t('customers.col.email'),
      render: (contact) => (contact.email ? <a href={`mailto:${contact.email}`} onClick={(event) => event.stopPropagation()}>{contact.email}</a> : <span className="text-muted">—</span>),
    },
    {
      key: 'mailing',
      header: t('customers.col.mailing'),
      render: (contact) => (
        contact.email ? (
          <div className="row-actions" onClick={(event) => event.stopPropagation()} style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="action-btn"
              title={t('customers.action.sendGmail', { name: contact.displayName })}
              aria-label={t('customers.action.sendGmail', { name: contact.displayName })}
              onClick={() => setEmailContact(contact)}
              style={{ color: '#ea4335' }}
            >
              <Mail size={15} />
            </button>
          </div>
        ) : (
          <span className="text-muted">—</span>
        )
      ),
    },
    { key: 'phone', header: t('customers.col.phone'), render: (contact) => contact.phone || <span className="text-muted">—</span> },
    { key: 'gstin', header: t('customers.col.gstin'), render: (contact) => (contact.gstin ? <span className="code-tag">{contact.gstin}</span> : <span className="text-muted">—</span>) },
    { key: 'paymentTermsDays', header: t('customers.col.terms'), align: 'right', render: (contact) => <span className="text-muted small">{t('customers.col.termsDays', { days: formatNumber(contact.paymentTermsDays, 0) })}</span> },
    {
      key: 'outstandingBalance',
      header: t('customers.col.outstanding'),
      align: 'right',
      render: (contact) => <span className={balanceTone(contact.outstandingBalance)}>{formatCurrency(contact.outstandingBalance)}</span>,
    },
    {
      key: 'actions',
      header: t('customers.col.actions'),
      align: 'right',
      render: (contact) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <Link className="action-btn" to={`${copy.documentsPath}${contact.id}`} aria-label={t(`${textGroup}.action.viewDocuments`, { name: contact.displayName })}>
            <FileText size={15} />
          </Link>
          <IfCanWrite>
            <button
              type="button"
              className="action-btn"
              aria-label={t('customers.action.edit', { name: contact.displayName })}
              onClick={() => navigate(`${basePath}/${contact.id}/edit`)}
            >
              <Pencil size={15} />
            </button>
            <button type="button" className="action-btn is-danger" aria-label={t('customers.action.delete', { name: contact.displayName })} onClick={() => setDeleteTarget(contact)}>
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
        title={t(`${textGroup}.title`)}
        subtitle={t(`${textGroup}.subtitle`)}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={<FileDown size={15} />}
              onClick={() =>
                void download(() => contactsApi.exportPdf({
                  type,
                  include_inactive: includeInactive,
                  search: debouncedSearch.trim() || undefined,
                }))
              }
            >
              {t('common.extractPdf')}
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet size={15} />}
              onClick={() =>
                void download(() => contactsApi.exportExcel({
                  type,
                  include_inactive: includeInactive,
                  search: debouncedSearch.trim() || undefined,
                }))
              }
            >
              {t('common.extractExcel')}
            </Button>
            <IfCanWrite>
              <Button variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
                {t(`${textGroup}.new`)}
              </Button>
            </IfCanWrite>
          </div>
        }
      />

      {list.data ? (
        <div className="stat-grid">
          <StatTile label={t(`${textGroup}.stat.count`)} value={formatNumber(list.data.total, 0)} sublabel={includeInactive ? t('customers.stat.includingInactive') : t('customers.stat.activeOnly')} icon={<Users size={16} />} />
          <StatTile
            label={t('customers.stat.outstandingPage')}
            value={formatCurrency(outstandingTotal)}
            sublabel={t(`${textGroup}.stat.outstandingSub`)}
            tone={outstandingTotal > 0 ? 'warning' : 'neutral'}
          />
          <StatTile label={t('customers.stat.withBalance')} value={formatNumber(withBalance, 0)} sublabel={t('customers.stat.withBalanceSub', { count: formatNumber(rows.length, 0) })} />
        </div>
      ) : null}

      <Toolbar>
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t(`${textGroup}.search.placeholder`)}
          label={t(`${textGroup}.search.label`)}
        />
        <CheckboxField
          label={t('customers.filter.includeInactive')}
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
              title={t(`${textGroup}.empty.title`)}
              description={t(`${textGroup}.empty.body`)}
              icon={<Users size={28} aria-hidden="true" />}
              action={
                <IfCanWrite>
                  <Button variant="primary" icon={<Plus size={15} />} onClick={openCreate}>
                    {t(`${textGroup}.new`)}
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
                    ? t('customers.bulk.clearAll')
                    : selectedIds.size === rows.length && rows.length > 0
                    ? t('customers.bulk.deselectPage')
                    : t('customers.bulk.selectAllOnPage', { count: rows.length })}
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
                      ? t('customers.bulk.allPagesSelected', { count: list.data?.total ?? 0 })
                      : t('customers.bulk.selectAllPages', { count: list.data?.total ?? 0 })}
                  </Button>
                )}

                {selectAllPages ? (
                  <span className="small font-medium" style={{ color: 'var(--primary)' }}>
                    {t(`${textGroup}.bulk.allSelected`, { count: list.data?.total ?? 0 })}
                  </span>
                ) : selectedIds.size > 0 ? (
                  <span className="small text-muted">{t('customers.bulk.selectedOnPage', { count: selectedIds.size })}</span>
                ) : null}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {canWrite && (list.data?.total ?? 0) > 0 && !selectedIds.size && !selectAllPages && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={bulkDeleting}
                    onClick={() => setBulkDeleteConfirm({ allPages: true })}
                    icon={<Trash2 size={13} />}
                    style={{ color: 'var(--color-danger, #dc2626)' }}
                    title={t(`${textGroup}.bulk.deleteAllTitle`, { count: list.data?.total ?? 0 })}
                  >
                    {t(`${textGroup}.bulk.deleteAll`, { count: list.data?.total ?? 0 })}
                  </Button>
                )}

                {(selectAllPages || selectedIds.size > 0) && canWrite ? (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={bulkDeleting}
                    onClick={() => setBulkDeleteConfirm({ allPages: false })}
                    icon={<Trash2 size={13} />}
                  >
                    {selectAllPages
                      ? t(`${textGroup}.bulk.deleteAllPages`, { count: list.data?.total ?? 0 })
                      : t('customers.bulk.deleteSelected', { count: selectedIds.size })}
                  </Button>
                ) : null}
              </div>
            </div>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(contact) => contact.id}
              onRowClick={(contact) => setDetailsId(contact.id)}
              caption={t(`${textGroup}.table.caption`)}
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

      {detailsId ? (
        <ContactDetailsModal
          contactId={detailsId}
          copy={copy}
          onClose={() => setDetailsId(null)}
          onEdit={(contact) => {
            setDetailsId(null);
            navigate(`${basePath}/${contact.id}/edit`);
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
        title={t(`${textGroup}.delete.title`)}
        message={
          <>
            <FormError message={deleteSubmit.error} />
            {deleteTarget
              ? t(`${textGroup}.delete.body`, { name: formatVendorMaskedName(deleteTarget.displayName, type === 'vendor') })
              : ''}
          </>
        }
        confirmLabel={t(`${textGroup}.delete.confirm`)}
        busy={deleteSubmit.submitting}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          deleteSubmit.reset();
        }}
      />

      <ConfirmDialog
        open={!!bulkDeleteConfirm}
        title={t(`${textGroup}.bulkDelete.title`)}
        message={
          <p>
            {bulkDeleteConfirm?.allPages || selectAllPages
              ? t(`${textGroup}.bulkDelete.allBody`, { count: list.data?.total ?? 0 })
              : t(`${textGroup}.bulkDelete.selectedBody`, { count: selectedIds.size })}
          </p>
        }
        confirmLabel={t('customers.bulkDelete.confirm')}
        busy={bulkDeleting}
        onCancel={() => setBulkDeleteConfirm(null)}
        onConfirm={() => {
          if (!bulkDeleteConfirm) return;
          const { allPages } = bulkDeleteConfirm;
          setBulkDeleteConfirm(null);
          void confirmBulkDelete(allPages);
        }}
      />
    </>
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
  const { t } = useAppContent();
  const g = copy.group;
  const summary = useAsync(() => contactsApi.summary(contactId), [contactId]);
  const contact = summary.data?.contact ?? null;
  const dash = <span className="text-muted">—</span>;

  const overdueTone: Tone = summary.data && summary.data.overdue > 0 ? 'danger' : 'success';

  return (
    <Modal
      open
      size="lg"
      title={contact ? formatVendorMaskedName(contact.displayName, contact.type === 'vendor') : t(`${g}.details.fallbackTitle`)}
      subtitle={contact?.companyName ?? undefined}
      onClose={onClose}
      footer={
        <>
          <Link className="btn btn-secondary btn-md" to={`${copy.documentsPath}${contactId}`}>
            <span>{t(`${g}.details.viewDocuments`)}</span>
          </Link>
          {contact && contact.email && onSendEmail ? (
            <Button
              variant="secondary"
              icon={<Mail size={15} style={{ color: '#ea4335' }} />}
              onClick={() => onSendEmail(contact)}
            >
              {t('customers.details.sendGmail')}
            </Button>
          ) : null}
          {contact ? (
            <IfCanWrite>
              <Button variant="primary" icon={<Pencil size={15} />} onClick={() => onEdit(contact)}>
                {t(`${g}.details.edit`)}
              </Button>
            </IfCanWrite>
          ) : null}
        </>
      }
    >
      {summary.loading ? (
        <SkeletonRows rows={4} columns={3} />
      ) : summary.error || !summary.data || !contact ? (
        <ErrorBlock message={summary.error ?? t('customers.details.loadError')} onRetry={summary.reload} />
      ) : (
        <>
          <div className="stat-grid">
            <StatTile label={t(`${g}.details.totalInvoiced`)} value={formatCurrency(summary.data.totalInvoiced)} sublabel={t(`${g}.details.documentCount`, { count: formatNumber(summary.data.documentCount, 0) })} />
            <StatTile label={t('customers.details.totalPaid')} value={formatCurrency(summary.data.totalPaid)} tone="positive" />
            <StatTile label={t('customers.details.outstanding')} value={formatCurrency(summary.data.outstanding)} tone={summary.data.outstanding > 0 ? 'warning' : 'neutral'} />
            <StatTile label={t('customers.details.overdue')} value={formatCurrency(summary.data.overdue)} tone={summary.data.overdue > 0 ? 'negative' : 'neutral'} />
          </div>

          <div className="detail-grid">
            <Detail label={t('customers.details.status')} value={<Badge tone={contact.isActive ? 'success' : 'neutral'}>{contact.isActive ? t('customers.status.active') : t('customers.status.inactive')}</Badge>} />
            <Detail label={t('customers.details.overdue')} value={<Badge tone={overdueTone}>{formatCurrency(summary.data.overdue)}</Badge>} />
            <Detail label={t('customers.details.contactPerson')} value={contact.contactPerson ? formatVendorMaskedName(contact.contactPerson, contact.type === 'vendor') : dash} />
            <Detail
              label={t('customers.details.email')}
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
                        <span>{t('customers.details.sendGmail')}</span>
                      </button>
                    ) : null}
                  </span>
                ) : (
                  dash
                )
              }
            />
            <Detail label={t('customers.details.phone')} value={contact.phone || dash} />
            <Detail label={t('customers.details.gstin')} value={contact.gstin ? <span className="code-tag">{contact.gstin}</span> : dash} />
            <Detail label={t('customers.details.pan')} value={contact.pan ? <span className="code-tag">{contact.pan}</span> : dash} />
            <Detail label={t('customers.details.gstTreatment')} value={gstLabel(contact.gstTreatment, t)} />
            <Detail label={t('customers.details.paymentTerms')} value={t('customers.details.paymentTermsDays', { days: formatNumber(contact.paymentTermsDays, 0) })} />
            <Detail label={t('customers.details.billingAddress')} value={contact.billingAddress || dash} />
            <Detail label={t('customers.details.shippingAddress')} value={contact.shippingAddress || dash} />
            <Detail label={t('customers.details.notes')} value={contact.notes || dash} />
            <Detail label={t('customers.details.created')} value={formatDateTime(contact.createdAt)} />
            <Detail label={t('customers.details.lastUpdated')} value={formatDateTime(contact.updatedAt)} />
          </div>

          <p className="small text-muted">
            <Link className="text-primary" to={`${copy.documentsPath}${contact.id}`}>
              {t(`${g}.details.openAll`, { name: formatVendorMaskedName(contact.displayName, contact.type === 'vendor') })}
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
  const { t } = useAppContent();
  const [subject, setSubject] = useState(() => t('customers.email.defaultSubject', { name: contact.displayName }));
  const [message, setMessage] = useState(() => t('customers.email.defaultBody', { name: contact.contactPerson || contact.displayName }));
  const { submitting, error, run } = useSubmit();

  async function handleSend() {
    if (!contact.email) return;
    const result = await run(() =>
      contactsApi.sendGmail(contact.id, {
        to_email: contact.email!,
        subject: subject.trim(),
        message: message.trim(),
      })
    );
    if (result) {
      onSent(t('customers.email.sent', { email: contact.email }));
    }
  }

  return (
    <Modal
      open
      size="md"
      title={t('customers.email.title')}
      subtitle={t('customers.email.subtitle', { name: contact.displayName, email: contact.email ?? '' })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('customers.email.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            icon={<Mail size={15} />}
            onClick={handleSend}
          >
            {t('customers.email.send')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField
          label={t('customers.email.to')}
          value={contact.email ?? ''}
          disabled
        />
        <TextField
          label={t('customers.email.subject')}
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <TextAreaField
        label={t('customers.email.message')}
        rows={6}
        required
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
    </Modal>
  );
}
