import { useEffect, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';

import { projectsApi } from '@/api/endpoints';
import type { Invoice, Project } from '@/api/types';
import { IfCanWrite } from '@/auth/RouteGuards';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Modal';
import { FilterSelect, Toolbar } from '@/components/ui/Toolbar';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatNumber, titleCase } from '@/utils/format';
import { statusLabel, statusTone } from '@/utils/status';

import { InvoiceTimeModal } from './InvoiceTimeModal';
import { ProjectModal } from './ProjectModal';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
];

export function ProjectsTab({ onProjectsChanged }: { onProjectsChanged: () => void }) {
  const { canWrite } = useAuth();
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState<{ open: boolean; project: Project | null }>({ open: false, project: null });
  const [invoiceTarget, setInvoiceTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);

  const projects = useAsync(() => projectsApi.list({ status: statusFilter || undefined }), [statusFilter]);

  const action = useSubmit();
  useEffect(() => {
    if (action.error) toast.error(action.error);
  }, [action.error, toast]);

  const refresh = () => {
    projects.reload();
    onProjectsChanged();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await action.run(() => projectsApi.remove(deleteTarget.id));
    setDeleteTarget(null);
    if (result) {
      toast.success(result.message);
      refresh();
    }
  };

  const rows = projects.data ?? [];

  return (
    <>
      <Toolbar>
        <FilterSelect label="Status" value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
        <IfCanWrite>
          <Button variant="primary" size="sm" onClick={() => setModal({ open: true, project: null })}>
            New project
          </Button>
        </IfCanWrite>
      </Toolbar>

      {lastInvoice ? (
        <Card title="Invoice created" subtitle={`${lastInvoice.invoiceNumber} · ${formatCurrency(lastInvoice.total)}`}>
          <div className="row-between">
            <span className="text-muted">Unbilled time has been billed to {lastInvoice.customerName}.</span>
            <div className="row">
              <Link className="btn btn-primary btn-sm" to={`/invoices/${lastInvoice.id}`}>
                <span>View invoice</span>
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setLastInvoice(null)}>
                Dismiss
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
          title="No projects yet"
          description="Create a project to log billable time against a customer."
          icon={<FolderKanban size={28} aria-hidden="true" />}
          action={
            <IfCanWrite>
              <Button variant="primary" onClick={() => setModal({ open: true, project: null })}>
                New project
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
                subtitle={project.customerName ?? 'No customer linked'}
                actions={<Badge tone={statusTone(project.status)}>{statusLabel(project.status)}</Badge>}
                footer={
                  canWrite ? (
                    <div className="row">
                      <Button size="sm" onClick={() => setModal({ open: true, project })}>
                        Edit
                      </Button>
                      {canInvoice ? (
                        <Button size="sm" variant="primary" onClick={() => setInvoiceTarget(project)}>
                          Invoice unbilled time
                        </Button>
                      ) : null}
                      <Button size="sm" variant="danger" onClick={() => setDeleteTarget(project)}>
                        Delete
                      </Button>
                    </div>
                  ) : null
                }
              >
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Billing</span>
                    <span className="detail-value">
                      {titleCase(project.billingMethod)}
                      {project.billingMethod === 'hourly' ? ` · ${formatCurrency(project.hourlyRate)}/hr` : ''}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Budget hours</span>
                    <span className="detail-value num">{project.budgetHours > 0 ? formatNumber(project.budgetHours) : '—'}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Logged</span>
                    <span className="detail-value num">{formatNumber(project.loggedHours)} h</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Billable</span>
                    <span className="detail-value num">{formatNumber(project.billableHours)} h</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Unbilled</span>
                    <span className="detail-value num">{formatNumber(project.unbilledHours)} h</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Unbilled amount</span>
                    <span className="detail-value num">{formatCurrency(project.unbilledAmount)}</span>
                  </div>
                </div>
                {project.budgetHours > 0 ? (
                  <>
                    <div
                      className="split-bar"
                      role="img"
                      aria-label={`${formatNumber(project.loggedHours)} of ${formatNumber(project.budgetHours)} budget hours used`}
                    >
                      <span className="split-segment segment-current" style={{ width: `${budgetUsed}%` }} />
                    </div>
                    <p className="small text-subtle">
                      {formatNumber(project.loggedHours)} of {formatNumber(project.budgetHours)} budget hours used
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
          toast.success(`Invoice ${invoice.invoiceNumber} created for ${formatCurrency(invoice.total)}.`);
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete project"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.name}? If the project already has invoiced time it will be marked completed instead of deleted.`
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
