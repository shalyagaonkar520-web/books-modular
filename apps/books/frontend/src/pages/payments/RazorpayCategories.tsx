import { useCallback, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';

import { razorpaySyncApi, type CategoryOption, type CategoryRule } from '@/api/razorpay';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, ErrorBlock, FormError, SkeletonRows } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

import { categoryTone } from './razorpayStatus';

const MATCH_TYPE_LABELS: Record<string, string> = {
  description_contains: 'Description contains',
  method_is: 'Payment method is',
  email_contains: 'Customer email contains',
  notes_contains: 'Notes contain',
  status_is: 'Payment status is',
};

interface Props {
  categories: CategoryOption[];
  matchTypes: string[];
}

export function RazorpayCategories({ categories, matchTypes }: Props) {
  const toast = useToast();
  const { submitting, error: submitError, run, reset } = useSubmit();
  const [open, setOpen] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [form, setForm] = useState({
    name: '',
    match_type: matchTypes[0] ?? 'description_contains',
    match_value: '',
    category: categories[0]?.value ?? 'customer_payment',
    priority: 100,
  });

  const { data, loading, error, reload } = useAsync(() => razorpaySyncApi.listRules(), []);

  const submit = useCallback(async () => {
    const result = await run(() =>
      razorpaySyncApi.createRule({
        name: form.name.trim(),
        match_type: form.match_type,
        match_value: form.match_value.trim(),
        category: form.category,
        priority: Number(form.priority) || 100,
        is_active: true,
      }),
    );
    if (result) {
      toast.success(`Rule "${result.name}" created.`);
      setOpen(false);
      setForm((current) => ({ ...current, name: '', match_value: '' }));
      reload();
    }
  }, [form, reload, run, toast]);

  const remove = useCallback(
    async (rule: CategoryRule) => {
      try {
        await razorpaySyncApi.deleteRule(rule.id);
        toast.success(`Rule "${rule.name}" deleted.`);
        reload();
      } catch {
        toast.error('Could not delete this rule.');
      }
    },
    [reload, toast],
  );

  const reapply = useCallback(async () => {
    setReapplying(true);
    try {
      const result = await razorpaySyncApi.reapplyRules();
      toast.success(
        `${result.recategorised} of ${result.evaluated} undecided transactions were recategorised.`,
      );
    } catch {
      toast.error('Could not re-run categorisation.');
    } finally {
      setReapplying(false);
    }
  }, [toast]);

  const columns: Array<Column<CategoryRule>> = [
    { key: 'priority', header: 'Priority', align: 'right', render: (row) => row.priority },
    { key: 'name', header: 'Rule', render: (row) => row.name },
    {
      key: 'condition',
      header: 'Condition',
      render: (row) => (
        <span>
          {MATCH_TYPE_LABELS[row.match_type] ?? row.match_type}{' '}
          <span className="mono">{row.match_value}</span>
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <Badge tone={categoryTone(row.category)}>{row.category_label}</Badge>,
    },
    {
      key: 'active',
      header: 'Active',
      render: (row) => <Badge tone={row.is_active ? 'success' : 'neutral'}>{row.is_active ? 'Yes' : 'No'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(row)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div className="stack">
      <Card
        title="Categorisation rules"
        subtitle="Rules run before any automatic guess, so they always win. Lower priority numbers run first."
        actions={
          <div className="row">
            <Button variant="secondary" icon={<RefreshCw size={14} />} loading={reapplying} onClick={reapply}>
              Re-run categorisation
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => {
                reset();
                setOpen(true);
              }}
            >
              New rule
            </Button>
          </div>
        }
      >
        {loading ? (
          <SkeletonRows rows={4} columns={6} />
        ) : error ? (
          <ErrorBlock message={error} onRetry={reload} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title="No rules yet"
            description="Without a rule, transactions are categorised from the customer link, then the description, then automatically — always as a suggestion you confirm."
          />
        ) : (
          <DataTable columns={columns} rows={data.items} rowKey={(row) => row.id} caption="Categorisation rules" />
        )}
      </Card>

      <Card title="How a transaction is categorised" subtitle="Applied in this order; the first match wins.">
        <ol className="plain-list">
          <li>A rule on this page — always accepted outright.</li>
          <li>A linked invoice or a matched customer — accepted outright.</li>
          <li>Keywords in the description or Razorpay notes — offered as a suggestion.</li>
          <li>The payment&apos;s own attributes — offered as a low-confidence suggestion.</li>
          <li>Otherwise left uncategorised for someone to decide.</li>
        </ol>
        <p className="small">
          Only the first two ever post accounting entries on their own. A suggestion stays a suggestion until
          somebody accepts it, so a low-confidence guess never turns into a journal entry.
        </p>
      </Card>

      <Modal
        open={open}
        title="New categorisation rule"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={submitting}>
              Create rule
            </Button>
          </>
        }
      >
        <div className="stack">
          <FormError message={submitError} />
          <TextField
            label="Rule name"
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Course fees are income"
          />
          <SelectField
            label="Condition"
            value={form.match_type}
            onChange={(event) => setForm({ ...form, match_type: event.target.value })}
            options={matchTypes.map((type) => ({ value: type, label: MATCH_TYPE_LABELS[type] ?? type }))}
          />
          <TextField
            label="Value to match"
            required
            value={form.match_value}
            onChange={(event) => setForm({ ...form, match_value: event.target.value })}
            hint="Matching is case-insensitive."
          />
          <SelectField
            label="Category"
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
            options={categories.map((option) => ({ value: option.value, label: option.label }))}
          />
          <TextField
            label="Priority"
            type="number"
            min={1}
            max={9999}
            value={form.priority}
            onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
            hint="Lower numbers are evaluated first."
          />
        </div>
      </Modal>
    </div>
  );
}
