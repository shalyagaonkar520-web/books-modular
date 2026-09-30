import { useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';

import { projectsApi } from '@/api/endpoints';
import type { Invoice, Project } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAppContent } from '@/app/AppContentContext';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatNumber, titleCase } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

import { InvoiceTimeModal } from './InvoiceTimeModal';
import { ProjectModal } from './ProjectModal';

/** `label` values are content keys; resolve them with `t()` at render. */
const STATUS_OPTIONS = [
  { value: '', label: 'timeTracking.projects.filter.allStatuses' },
  { value: 'active', label: 'timeTracking.projectStatus.active' },
  { value: 'on_hold', label: 'timeTracking.projectStatus.onHold' },
  { value: 'completed', label: 'timeTracking.projectStatus.completed' },
];

export function ProjectsTab({ onProjectsChanged }: { onProjectsChanged: () => void }) {
  const { t } = useAppContent();
  const { canWrite } = useAuth();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState<{ open: boolean; project: Project | null }>({ open: false, project: null });
  const [invoiceTarget, setInvoiceTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);

  const projects = useAsync(() => projectsApi.list({ status: statusFilter || undefined }), [statusFilter]);

  const action = useSubmit();

  const refresh = () => {
    projects.reload();
    onProjectsChanged();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await action.run(() => projectsApi.remove(deleteTarget.id));
    if (result) {
      setDeleteTarget(null);
      toast.success(result.message);
      refresh();
    }
  };

  const rows = projects.data ?? [];

  return (
    <>
      <Toolbar>
        <FilterSelect
          label={t('timeTracking.projects.filter.status')}
          value={statusFilter}
          options={STATUS_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
          onChange={setStatusFilter}
        />
        <IfCanWrite>
          <Button variant="primary" size="sm" onClick={() => setModal({ open: true, project: null })}>
            {t('timeTracking.newProject')}
          </Button>
        </IfCanWrite>
      </Toolbar>

      {lastInvoice ? (
        <Card title={t('timeTracking.projects.invoiceCreated.title')} subtitle={`${lastInvoice.invoiceNumber} · ${formatCurrency(lastInvoice.total)}`}>
          <div className="row-between">
            <span className="text-muted">{t('timeTracking.projects.invoiceCreated.body', { customer: lastInvoice.customerName })}</span>
            <div className="row">
              <Link className="btn btn-primary btn-sm" to={`/invoices/${lastInvoice.id}`}>
                <span>{t('timeTracking.projects.invoiceCreated.view')}</span>
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setLastInvoice(null)}>
                {t('timeTracking.projects.invoiceCreated.dismiss')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {projects.loading ? (
        <SkeletonRows rows={4} columns={4} />
      ) : projects.error ? (
        <ErrorBlock message={projects.error} onRetry={projects.reload} />
      ) : !rows.length ? (
        <EmptyState
          title={t('timeTracking.empty.title')}
          description={t('timeTracking.empty.body')}
          icon={<FolderKanban size={28} aria-hidden="true" />}
          action={
            <IfCanWrite>
              <Button variant="primary" onClick={() => setModal({ open: true, project: null })}>
                {t('timeTracking.newProject')}
              </Button>
            </IfCanWrite>
          }
        />
      ) : (
        <div className="grid-2">
          {rows.map((project) => {
            const budgetUsed = project.budgetHours > 0 ? Math.min(100, (project.loggedHours / project.budgetHours) * 100) : 0;
            const canInvoice = project.billingMethod === 'hourly' && project.unbilledHours > 0;
            return (
              <Card
                key={project.id}
                title={project.name}
                subtitle={project.customerName ?? t('timeTracking.projects.noCustomerLinked')}
                actions={<Badge tone={statusTone(project.status)}>{statusLabel(project.status, t)}</Badge>}
                footer={
                  canWrite ? (
                    <div className="row">
                      <Button size="sm" onClick={() => setModal({ open: true, project })}>
                        {t('timeTracking.projects.editButton')}
                      </Button>
                      {canInvoice ? (
                        <Button size="sm" variant="primary" onClick={() => setInvoiceTarget(project)}>
                          {t('timeTracking.projects.invoiceUnbilled')}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(project)}>
                        {t('timeTracking.projects.deleteButton')}
                      </Button>
                    </div>
                  ) : null
                }
              >
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">{t('timeTracking.projects.detail.billing')}</span>
                    <span className="detail-value">
                      {titleCase(project.billingMethod)}
                      {project.billingMethod === 'hourly' ? ` · ${t('timeTracking.projects.perHour', { rate: formatCurrency(project.hourlyRate) })}` : ''}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">{t('timeTracking.projects.detail.budgetHours')}</span>
                    <span className="detail-value num">{project.budgetHours > 0 ? formatNumber(project.budgetHours) : '—'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">{t('timeTracking.projects.detail.logged')}</span>
                    <span className="detail-value num">{t('timeTracking.hoursShort', { hours: formatNumber(project.loggedHours) })}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">{t('timeTracking.projects.detail.billable')}</span>
                    <span className="detail-value num">{t('timeTracking.hoursShort', { hours: formatNumber(project.billableHours) })}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">{t('timeTracking.projects.detail.unbilled')}</span>
                    <span className="detail-value num">{t('timeTracking.hoursShort', { hours: formatNumber(project.unbilledHours) })}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">{t('timeTracking.projects.detail.unbilledAmount')}</span>
                    <span className="detail-value num">{formatCurrency(project.unbilledAmount)}</span>
                  </div>
                </div>
                {project.budgetHours > 0 ? (
                  <>
                    <div
                      className="split-bar"
                      role="img"
                      aria-label={t('timeTracking.projects.budgetUsed', { logged: formatNumber(project.loggedHours), budget: formatNumber(project.budgetHours) })}
                    >
                      <span className="split-segment segment-current" style={{ width: `${budgetUsed}%` }} />
                    </div>
                    <p className="small text-subtle">
                      {t('timeTracking.projects.budgetUsed', { logged: formatNumber(project.loggedHours), budget: formatNumber(project.budgetHours) })}
                    </p>
                  </>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <ProjectModal
        open={modal.open}
        project={modal.project}
        onClose={() => setModal({ open: false, project: null })}
        onSaved={(message) => {
          setModal({ open: false, project: null });
          toast.success(message);
          refresh();
        }}
      />
      <InvoiceTimeModal
        open={!!invoiceTarget}
        project={invoiceTarget}
        onClose={() => setInvoiceTarget(null)}
        onInvoiced={(invoice) => {
          setInvoiceTarget(null);
          setLastInvoice(invoice);
          toast.success(t('timeTracking.projects.toast.invoiced', { number: invoice.invoiceNumber, amount: formatCurrency(invoice.total) }));
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('timeTracking.projects.delete.title')}
        message={
          <>
            <FormError message={action.error} />
            {deleteTarget ? t('timeTracking.projects.delete.body', { name: deleteTarget.name }) : ''}
          </>
        }
        confirmLabel={t('timeTracking.projects.delete.confirm')}
        busy={action.submitting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setDeleteTarget(null);
          action.reset();
        }}
      />
    </>
  );
}
