/** Automation: workflow rules, custom fields, approvals, scheduled reports and document branding. */
import { useEffect, useState } from 'react';
import { Mail, Play, Plus, Send, Trash2, Webhook } from 'lucide-react';

import {
  approvalsApi,
  brandingApi,
  type CustomField,
  type CustomFieldEntity,
  type CustomFieldType,
  customFieldsApi,
  type ReportSchedule,
  type ScheduledReport,
  schedulesApi,
  type WorkflowAction,
  type WorkflowCondition,
  type WorkflowRule,
  workflowsApi,
} from '@/api/automation';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { Tabs } from '@/components/ui/Toolbar';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, formatDate, formatDateTime, parseNumber } from '@/utils/format';

type Tab = 'rules' | 'fields' | 'approvals' | 'schedules' | 'branding';
const ENTITIES: CustomFieldEntity[] = ['invoice', 'bill', 'estimate', 'sales_order', 'purchase_order', 'credit_note', 'vendor_credit', 'contact', 'item', 'expense'];
const REPORTS: ScheduledReport[] = ['profit_and_loss', 'balance_sheet', 'receivables', 'payables', 'cash_flow', 'gstr3b'];

export function AutomationPage() {
  const { t } = useAppContent();
  const [tab, setTab] = useState<Tab>('rules');
  return (
    <div className="stack">
      <PageHeader title={t('automation.title')} subtitle={t('automation.subtitle')} />
      <Tabs tabs={(['rules', 'fields', 'approvals', 'schedules', 'branding'] as Tab[]).map((id) => ({ id, label: t(`automation.tab.${id}`) }))} active={tab} onChange={(id) => setTab(id as Tab)} />
      {tab === 'rules' ? <RulesTab /> : null}
      {tab === 'fields' ? <FieldsTab /> : null}
      {tab === 'approvals' ? <ApprovalsTab /> : null}
      {tab === 'schedules' ? <SchedulesTab /> : null}
      {tab === 'branding' ? <BrandingTab /> : null}
    </div>
  );
}

// --------------------------------------------------------------------------- rules
function RulesTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const list = useAsync(() => workflowsApi.list(), []);
  const [editing, setEditing] = useState<WorkflowRule | 'new' | null>(null);
  const [runsFor, setRunsFor] = useState<WorkflowRule | null>(null);
  const { submitting, run, errorRef } = useSubmit();

  const act = async (label: string, action: () => Promise<unknown>) => {
    const ok = await run(action);
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(label);
      list.reload();
    }
  };

  return (
    <Card
      title={t('automation.rules.title')}
      subtitle={t('automation.rules.subtitle')}
      footer={
        isAdmin ? (
          <div className="row wrap">
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
              {t('automation.rules.new')}
            </Button>
            <Button icon={<Play size={15} />} loading={submitting} onClick={() => act(t('automation.rules.processed'), () => workflowsApi.process())}>
              {t('automation.rules.processNow')}
            </Button>
          </div>
        ) : undefined
      }
    >
      {list.loading && !list.data ? (
        <LoadingBlock />
      ) : !list.data?.length ? (
        <EmptyState title={t('automation.rules.empty')} description={t('automation.rules.emptyBody')} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('automation.rules.name')}</th>
                <th>{t('automation.rules.when')}</th>
                <th>{t('automation.rules.then')}</th>
                <th className="align-right">{t('automation.rules.runs')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong> {!r.isActive ? <Badge tone="neutral">{t('automation.off')}</Badge> : null}
                  </td>
                  <td className="small">
                    <code>{r.event}</code>
                    {r.conditions.length ? ` · ${r.conditions.map((c) => `${c.field} ${c.operator} ${c.value ?? ''}`).join(' & ')}` : ''}
                  </td>
                  <td className="small">
                    {r.actions.map((a, i) => (
                      <span key={i}>
                        {a.type === 'email' ? <Mail size={12} /> : <Webhook size={12} />} {a.type === 'email' ? a.to : a.url}{' '}
                      </span>
                    ))}
                  </td>
                  <td className="align-right">
                    <button type="button" className="btn btn-link btn-sm" onClick={() => setRunsFor(r)}>
                      {r.runCount}
                    </button>
                  </td>
                  <td className="align-right">
                    {isAdmin ? (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" onClick={() => setEditing(r)}>
                          {t('inventory.edit')}
                        </Button>
                        <button type="button" className="action-btn is-danger" aria-label={t('automation.delete')} onClick={() => act(t('automation.deleted'), () => workflowsApi.remove(r.id))}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing ? (
        <RuleModal
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
      {runsFor ? <RunsModal rule={runsFor} onClose={() => setRunsFor(null)} /> : null}
    </Card>
  );
}

function RuleModal({ rule, onClose, onSaved }: { rule: WorkflowRule | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const meta = useAsync(() => workflowsApi.meta(), []);
  const { submitting, error, run } = useSubmit();
  const [name, setName] = useState(rule?.name ?? '');
  const [eventName, setEventName] = useState(rule?.event ?? 'invoice.created');
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);
  const [conditions, setConditions] = useState<WorkflowCondition[]>(rule?.conditions ?? []);
  const [actions, setActions] = useState<WorkflowAction[]>(rule?.actions ?? [{ type: 'email', to: '', subject: '', message: '' }]);
  const entity = eventName.split('.')[0];
  const fields = meta.data?.fields[entity] ?? [];

  const save = async () => {
    const body = { name: name.trim(), event: eventName, isActive, conditions, actions };
    const saved = await run(() => (rule ? workflowsApi.update(rule.id, body) : workflowsApi.create(body)));
    if (saved) {
      toast.success(t('automation.saved'));
      onSaved();
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={rule ? rule.name : t('automation.rules.new')}
      subtitle={t('automation.rules.placeholders', { fields: fields.map((f) => `{${f}}`).join(' ') })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={save}>
            {t('inventory.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('automation.rules.name')} value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField label={t('automation.rules.when')} value={eventName} options={(meta.data?.events ?? []).map((ev) => ({ value: ev, label: ev }))} onChange={(e) => setEventName(e.target.value)} />
      </div>
      <CheckboxField label={t('automation.active')} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      <h4>{t('automation.rules.conditions')}</h4>
      {conditions.map((c, i) => (
        <div className="row wrap" key={i}>
          <select className="select" aria-label={t('automation.rules.field')} value={c.field} onChange={(e) => setConditions((cs) => cs.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}>
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select className="select" aria-label={t('automation.rules.operator')} value={c.operator} onChange={(e) => setConditions((cs) => cs.map((x, j) => (j === i ? { ...x, operator: e.target.value } : x)))}>
            {(meta.data?.operators ?? []).map((op) => (
              <option key={op} value={op}>
                {t(`automation.op.${op}`)}
              </option>
            ))}
          </select>
          <input className="input" aria-label={t('automation.rules.value')} value={c.value ?? ''} onChange={(e) => setConditions((cs) => cs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <button type="button" className="action-btn is-danger" aria-label={t('automation.delete')} onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <Button size="sm" icon={<Plus size={14} />} onClick={() => setConditions((cs) => [...cs, { field: fields[0] ?? 'status', operator: 'equals', value: '' }])}>
        {t('automation.rules.addCondition')}
      </Button>
      <h4 className="form-section">{t('automation.rules.actions')}</h4>
      {actions.map((a, i) => (
        <div className="card-inset" key={i}>
          <div className="row wrap">
            <SelectField
              label={t('automation.rules.actionType')}
              value={a.type}
              options={[
                { value: 'email', label: t('automation.action.email') },
                { value: 'webhook', label: t('automation.action.webhook') },
              ]}
              onChange={(e) => setActions((as) => as.map((x, j) => (j === i ? { ...x, type: e.target.value as WorkflowAction['type'] } : x)))}
            />
            <button type="button" className="action-btn is-danger" aria-label={t('automation.delete')} disabled={actions.length === 1} onClick={() => setActions((as) => as.filter((_, j) => j !== i))}>
              <Trash2 size={15} />
            </button>
          </div>
          {a.type === 'email' ? (
            <>
              <TextField label={t('automation.action.to')} value={a.to ?? ''} hint={t('automation.action.toHint')} onChange={(e) => setActions((as) => as.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
              <TextField label={t('automation.action.subject')} value={a.subject ?? ''} onChange={(e) => setActions((as) => as.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} />
              <TextAreaField label={t('automation.action.message')} value={a.message ?? ''} onChange={(e) => setActions((as) => as.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)))} />
            </>
          ) : (
            <TextField label={t('automation.action.url')} value={a.url ?? ''} hint={t('automation.action.urlHint')} onChange={(e) => setActions((as) => as.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          )}
        </div>
      ))}
      <Button size="sm" icon={<Plus size={14} />} onClick={() => setActions((as) => [...as, { type: 'email', to: '', subject: '', message: '' }])}>
        {t('automation.rules.addAction')}
      </Button>
    </Modal>
  );
}

function RunsModal({ rule, onClose }: { rule: WorkflowRule; onClose: () => void }) {
  const { t } = useAppContent();
  const runs = useAsync(() => workflowsApi.runs(rule.id), [rule.id]);
  return (
    <Modal open size="lg" title={t('automation.rules.runsTitle', { name: rule.name })} onClose={onClose}>
      {runs.loading ? (
        <LoadingBlock />
      ) : !runs.data?.length ? (
        <EmptyState title={t('automation.rules.noRuns')} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('automation.rules.at')}</th>
              <th>{t('automation.rules.record')}</th>
              <th>{t('docflow.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {runs.data.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.createdAt)}</td>
                <td className="small">
                  {r.entityType} {r.entityId}
                </td>
                <td>
                  <Badge tone={r.status === 'done' ? 'success' : r.status === 'failed' ? 'danger' : 'neutral'}>{t(`automation.run.${r.status}`)}</Badge>
                  {r.error ? <div className="small text-danger">{r.error}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

// --------------------------------------------------------------------------- custom fields
function FieldsTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const list = useAsync(() => customFieldsApi.list(), []);
  const [editing, setEditing] = useState<CustomField | 'new' | null>(null);
  const { run, errorRef } = useSubmit();
  const remove = async (f: CustomField) => {
    const ok = await run(() => customFieldsApi.remove(f.id));
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t('automation.deleted'));
      list.reload();
    }
  };
  return (
    <Card
      title={t('automation.fields.title')}
      subtitle={t('automation.fields.subtitle')}
      footer={
        isAdmin ? (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
            {t('automation.fields.new')}
          </Button>
        ) : undefined
      }
    >
      {!list.data?.length ? (
        <EmptyState title={t('automation.fields.empty')} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('automation.fields.label')}</th>
              <th>{t('automation.fields.on')}</th>
              <th>{t('automation.fields.type')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.map((f) => (
              <tr key={f.id}>
                <td>
                  <strong>{f.label}</strong> {f.required ? <Badge tone="warning">{t('automation.fields.required')}</Badge> : null} {!f.isActive ? <Badge tone="neutral">{t('automation.off')}</Badge> : null}
                </td>
                <td>{t(`automation.entity.${f.entity}`)}</td>
                <td>
                  {t(`automation.fieldType.${f.fieldType}`)}
                  {f.options.length ? <span className="small text-subtle"> ({f.options.join(', ')})</span> : null}
                </td>
                <td className="align-right">
                  {isAdmin ? (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" onClick={() => setEditing(f)}>
                        {t('inventory.edit')}
                      </Button>
                      <button type="button" className="action-btn is-danger" aria-label={t('automation.delete')} onClick={() => remove(f)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing ? (
        <FieldModal
          field={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function FieldModal({ field, onClose, onSaved }: { field: CustomField | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, run } = useSubmit();
  const [entity, setEntity] = useState<CustomFieldEntity>(field?.entity ?? 'invoice');
  const [label, setLabel] = useState(field?.label ?? '');
  const [fieldType, setFieldType] = useState<CustomFieldType>(field?.fieldType ?? 'text');
  const [options, setOptions] = useState((field?.options ?? []).join(', '));
  const [required, setRequired] = useState(field?.required ?? false);
  const [isActive, setIsActive] = useState(field?.isActive ?? true);
  const save = async () => {
    const body = { entity, label: label.trim(), fieldType, options: options.split(',').map((o) => o.trim()).filter(Boolean), required, isActive, showOnPdf: false, position: field?.position ?? 0 };
    const saved = await run(() => (field ? customFieldsApi.update(field.id, body) : customFieldsApi.create(body)));
    if (saved) {
      toast.success(t('automation.saved'));
      onSaved();
    }
  };
  return (
    <Modal
      open
      title={field ? field.label : t('automation.fields.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={save}>
            {t('inventory.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <SelectField label={t('automation.fields.on')} value={entity} disabled={Boolean(field)} options={ENTITIES.map((e) => ({ value: e, label: t(`automation.entity.${e}`) }))} onChange={(e) => setEntity(e.target.value as CustomFieldEntity)} />
        <TextField label={t('automation.fields.label')} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        <SelectField
          label={t('automation.fields.type')}
          value={fieldType}
          disabled={Boolean(field)}
          options={(['text', 'number', 'date', 'select', 'checkbox'] as CustomFieldType[]).map((ft) => ({ value: ft, label: t(`automation.fieldType.${ft}`) }))}
          onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
        />
        {fieldType === 'select' ? <TextField label={t('automation.fields.options')} value={options} hint={t('automation.fields.optionsHint')} onChange={(e) => setOptions(e.target.value)} /> : null}
      </div>
      <CheckboxField label={t('automation.fields.required')} checked={required} onChange={(e) => setRequired(e.target.checked)} />
      <CheckboxField label={t('automation.active')} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
    </Modal>
  );
}

// --------------------------------------------------------------------------- approvals
function ApprovalsTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const settings = useAsync(() => approvalsApi.settings(), []);
  const pending = useAsync(() => approvalsApi.pending(), []);
  const [invoice, setInvoice] = useState('');
  const [bill, setBill] = useState('');
  const { submitting, error, run, errorRef } = useSubmit();
  useEffect(() => {
    if (settings.data) {
      setInvoice(settings.data.invoiceThreshold != null ? String(settings.data.invoiceThreshold) : '');
      setBill(settings.data.billThreshold != null ? String(settings.data.billThreshold) : '');
    }
  }, [settings.data]);
  const save = async () => {
    const saved = await run(() => approvalsApi.saveSettings({ invoiceThreshold: invoice === '' ? null : parseNumber(invoice), billThreshold: bill === '' ? null : parseNumber(bill) }));
    if (saved) toast.success(t('automation.saved'));
  };
  const decide = async (kind: 'invoice' | 'bill', id: string, approve: boolean) => {
    const ok = await run(() => (approve ? approvalsApi.approve(kind, id) : approvalsApi.reject(kind, id)));
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(t(approve ? 'automation.approvals.approved' : 'automation.approvals.rejected'));
      pending.reload();
    }
  };
  return (
    <>
      <Card
        title={t('automation.approvals.title')}
        subtitle={t('automation.approvals.subtitle')}
        footer={
          isAdmin ? (
            <Button variant="primary" loading={submitting} onClick={save}>
              {t('inventory.save')}
            </Button>
          ) : undefined
        }
      >
        <FormError message={error} />
        <div className="form-grid">
          <TextField label={t('automation.approvals.invoice')} type="number" min="0" prefix="₹" value={invoice} hint={t('automation.approvals.blankHint')} disabled={!isAdmin} onChange={(e) => setInvoice(e.target.value)} />
          <TextField label={t('automation.approvals.bill')} type="number" min="0" prefix="₹" value={bill} disabled={!isAdmin} onChange={(e) => setBill(e.target.value)} />
        </div>
      </Card>
      <Card title={t('automation.approvals.pending')}>
        {!pending.data?.length ? (
          <EmptyState title={t('automation.approvals.none')} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('docflow.col.number')}</th>
                <th>{t('refunds.col.contact')}</th>
                <th>{t('docflow.col.date')}</th>
                <th className="align-right">{t('docflow.col.total')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.data.map((p) => (
                <tr key={p.id}>
                  <td>
                    {t(`automation.entity.${p.kind}`)} {p.number}
                  </td>
                  <td>{p.contactName}</td>
                  <td>{formatDate(p.date)}</td>
                  <td className="align-right">{formatCurrency(p.total)}</td>
                  <td className="align-right">
                    {isAdmin ? (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="primary" disabled={submitting} onClick={() => decide(p.kind, p.id, true)}>
                          {t('automation.approvals.approve')}
                        </Button>
                        <Button size="sm" variant="danger" disabled={submitting} onClick={() => decide(p.kind, p.id, false)}>
                          {t('automation.approvals.reject')}
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// --------------------------------------------------------------------------- schedules
function SchedulesTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const list = useAsync(() => schedulesApi.list(), []);
  const [editing, setEditing] = useState<ReportSchedule | 'new' | null>(null);
  const { submitting, run, errorRef } = useSubmit();
  const act = async (label: string, action: () => Promise<unknown>) => {
    const ok = await run(action);
    if (ok === null) toast.error(errorRef.current ?? t('common.error.generic'));
    else {
      toast.success(label);
      list.reload();
    }
  };
  return (
    <Card
      title={t('automation.schedules.title')}
      subtitle={t('automation.schedules.subtitle')}
      footer={
        isAdmin ? (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
            {t('automation.schedules.new')}
          </Button>
        ) : undefined
      }
    >
      {!list.data?.length ? (
        <EmptyState title={t('automation.schedules.empty')} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('automation.rules.name')}</th>
              <th>{t('automation.schedules.report')}</th>
              <th>{t('automation.schedules.to')}</th>
              <th>{t('automation.schedules.next')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong> {!s.isActive ? <Badge tone="neutral">{t('automation.off')}</Badge> : null}
                </td>
                <td>
                  {t(`automation.report.${s.report}`)} · {t(`recurring.frequency.${s.frequency}`)}
                </td>
                <td className="small">{s.recipients.join(', ')}</td>
                <td>{s.nextRunDate ? formatDate(s.nextRunDate) : '—'}</td>
                <td className="align-right">
                  {isAdmin ? (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" icon={<Send size={13} />} disabled={submitting} onClick={() => act(t('automation.schedules.sent'), () => schedulesApi.sendNow(s.id))}>
                        {t('automation.schedules.sendNow')}
                      </Button>
                      <Button size="sm" onClick={() => setEditing(s)}>
                        {t('inventory.edit')}
                      </Button>
                      <button type="button" className="action-btn is-danger" aria-label={t('automation.delete')} onClick={() => act(t('automation.deleted'), () => schedulesApi.remove(s.id))}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing ? (
        <ScheduleModal
          schedule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </Card>
  );
}

function ScheduleModal({ schedule, onClose, onSaved }: { schedule: ReportSchedule | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const { submitting, error, run } = useSubmit();
  const [name, setName] = useState(schedule?.name ?? '');
  const [report, setReport] = useState<ScheduledReport>(schedule?.report ?? 'profit_and_loss');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>(schedule?.frequency ?? 'monthly');
  const [recipients, setRecipients] = useState((schedule?.recipients ?? []).join(', '));
  const [isActive, setIsActive] = useState(schedule?.isActive ?? true);
  const preview = useAsync(() => schedulesApi.preview(report, frequency), [report, frequency]);
  const save = async () => {
    const body = { name: name.trim() || t(`automation.report.${report}`), report, frequency, recipients: recipients.split(',').map((r) => r.trim()).filter(Boolean), isActive };
    const saved = await run(() => (schedule ? schedulesApi.update(schedule.id, body) : schedulesApi.create(body)));
    if (saved) {
      toast.success(t('automation.saved'));
      onSaved();
    }
  };
  return (
    <Modal
      open
      size="lg"
      title={schedule ? schedule.name : t('automation.schedules.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={submitting} onClick={save}>
            {t('inventory.save')}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('automation.rules.name')} value={name} onChange={(e) => setName(e.target.value)} />
        <SelectField label={t('automation.schedules.report')} value={report} options={REPORTS.map((r) => ({ value: r, label: t(`automation.report.${r}`) }))} onChange={(e) => setReport(e.target.value as ScheduledReport)} />
        <SelectField
          label={t('recurring.field.frequency')}
          value={frequency}
          options={[
            { value: 'weekly', label: t('recurring.frequency.weekly') },
            { value: 'monthly', label: t('recurring.frequency.monthly') },
          ]}
          onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly')}
        />
        <TextField label={t('automation.schedules.to')} value={recipients} hint={t('automation.schedules.toHint')} onChange={(e) => setRecipients(e.target.value)} />
      </div>
      <CheckboxField label={t('automation.active')} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      {preview.data ? (
        <div className="card-inset form-section">
          <strong>{t('automation.schedules.preview', { from: formatDate(preview.data.start), to: formatDate(preview.data.end) })}</strong>
          <ul className="plain-list small">
            {preview.data.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : preview.error ? (
        <ErrorBlock message={preview.error} />
      ) : null}
    </Modal>
  );
}

// --------------------------------------------------------------------------- branding
function BrandingTab() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const data = useAsync(() => brandingApi.get(), []);
  const [color, setColor] = useState('#2563eb');
  const [logo, setLogo] = useState('');
  const [footer, setFooter] = useState('');
  const [signature, setSignature] = useState('');
  const { submitting, error, run } = useSubmit();
  useEffect(() => {
    if (!data.data) return;
    setColor(data.data.brandColor ?? '#2563eb');
    setLogo(data.data.logoUrl ?? '');
    setFooter(data.data.documentFooter ?? '');
    setSignature(data.data.signatureLabel ?? '');
  }, [data.data]);
  const save = async () => {
    const saved = await run(() => brandingApi.save({ brandColor: color, logoUrl: logo.trim() || null, documentFooter: footer.trim() || null, signatureLabel: signature.trim() || null }));
    if (saved) toast.success(t('automation.saved'));
  };
  return (
    <Card
      title={t('automation.branding.title')}
      subtitle={t('automation.branding.subtitle')}
      footer={
        isAdmin ? (
          <Button variant="primary" loading={submitting} onClick={save}>
            {t('inventory.save')}
          </Button>
        ) : undefined
      }
    >
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('automation.branding.color')} type="color" value={color} disabled={!isAdmin} onChange={(e) => setColor(e.target.value)} />
        <TextField label={t('automation.branding.logo')} value={logo} placeholder="https://" hint={t('automation.branding.logoHint')} disabled={!isAdmin} onChange={(e) => setLogo(e.target.value)} />
        <TextField label={t('automation.branding.signature')} value={signature} placeholder={t('automation.branding.signaturePlaceholder')} disabled={!isAdmin} onChange={(e) => setSignature(e.target.value)} />
      </div>
      <TextAreaField label={t('automation.branding.footer')} value={footer} disabled={!isAdmin} onChange={(e) => setFooter(e.target.value)} />
      <div className="card-inset form-section" style={{ borderTop: `4px solid ${color}` }}>
        <strong style={{ color }}>{t('automation.branding.previewTitle')}</strong>
        <p className="small">{footer || t('automation.branding.previewFooter')}</p>
      </div>
    </Card>
  );
}
