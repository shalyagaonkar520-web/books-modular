/** Create or edit a sales invoice, with a live line editor and totals that mirror the server. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';

import { contactsApi, invoicesApi, itemsApi } from '@/api/endpoints';
import type { Contact, Invoice, Item } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatCurrency, formatQuantity, parseNumber, round2, todayIso } from '@/utils/format';
import { TAX_RATES } from '@/utils/status';

interface LineDraft {
  key: string;
  itemId: string;
  description: string;
  quantity: string;
  rate: string;
  taxRate: string;
}

let lineCounter = 0;
const newLine = (): LineDraft => ({ key: `line-${++lineCounter}`, itemId: '', description: '', quantity: '1', rate: '0', taxRate: '0' });

const lineAmount = (line: LineDraft): number => round2(parseNumber(line.quantity) * parseNumber(line.rate));
const lineTax = (line: LineDraft): number => round2((lineAmount(line) * parseNumber(line.taxRate)) / 100);

export function InvoiceFormPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const isEdit = Boolean(invoiceId);
  const navigate = useNavigate();
  const toast = useToast();
  const { organization, canWrite } = useAuth();
  const { submitting, error, fieldErrors, run, setError } = useSubmit();

  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState(() => organization?.invoiceNotes ?? '');
  const [terms, setTerms] = useState(() => organization?.invoiceTerms ?? '');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine()]);
  const [keepSent, setKeepSent] = useState(false);

  const customers = useAsync((signal) => contactsApi.list({ type: 'customer', page_size: 200 }, signal), []);
  const items = useAsync((signal) => itemsApi.list({ page_size: 200 }, signal), []);
  const existing = useAsync(async () => (invoiceId ? invoicesApi.get(invoiceId) : null), [invoiceId]);

  const customerList = useMemo<Contact[]>(() => customers.data?.items ?? [], [customers.data]);
  const itemList = useMemo<Item[]>(() => items.data?.items ?? [], [items.data]);
  const loaded = existing.data;
  const blocked = loaded ? loaded.status === 'paid' || loaded.status === 'partially_paid' || loaded.status === 'void' || loaded.amountPaid > 0 : false;

  // Prefill from the loaded invoice exactly once.
  useEffect(() => {
    if (!loaded) return;
    setCustomerId(loaded.customerId);
    setDate(loaded.date);
    setDueDate(loaded.dueDate);
    setReference(loaded.reference ?? '');
    setNotes(loaded.notes ?? '');
    setTerms(loaded.terms ?? '');
    setDiscountAmount(String(loaded.discountAmount));
    setKeepSent(loaded.status === 'sent' || loaded.status === 'overdue');
    setLines(
      loaded.lines.length
        ? loaded.lines.map((line) => ({
            key: line.id ?? `line-${++lineCounter}`,
            itemId: line.itemId ?? '',
            description: line.description,
            quantity: String(line.quantity),
            rate: String(line.rate),
            taxRate: String(line.taxRate),
          }))
        : [newLine()],
    );
  }, [loaded]);

  /** Due date follows `date` + the customer's payment terms, but stays editable. */
  const syncDueDate = (nextCustomerId: string, nextDate: string) => {
    const customer = customerList.find((entry) => entry.id === nextCustomerId);
    if (customer && nextDate) setDueDate(addDaysIso(nextDate, customer.paymentTermsDays));
  };

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const chooseItem = (key: string, itemId: string) => {
    const item = itemList.find((entry) => entry.id === itemId);
    if (!item) {
      updateLine(key, { itemId: '' });
      return;
    }
    updateLine(key, {
      itemId,
      description: item.salesDescription || item.description || item.name,
      rate: String(item.sellingPrice),
      taxRate: String(item.taxRate),
    });
  };

  const subtotal = round2(lines.reduce((sum, line) => sum + lineAmount(line), 0));
  const taxTotal = round2(lines.reduce((sum, line) => sum + lineTax(line), 0));
  const discount = round2(parseNumber(discountAmount));
  const total = round2(subtotal - discount + taxTotal);

  const submit = async (status: 'draft' | 'sent') => {
    if (!customerId) {
      setError('Select the customer this invoice is for.');
      return;
    }
    if (!lines.length) {
      setError('Add at least one line item.');
      return;
    }
    if (lines.some((line) => !line.description.trim())) {
      setError('Every line needs a description.');
      return;
    }
    if (lines.some((line) => parseNumber(line.quantity) <= 0)) {
      setError('Every line needs a quantity greater than zero.');
      return;
    }
    if (discount > subtotal) {
      setError('The discount cannot exceed the subtotal.');
      return;
    }
    const payload = {
      customerId,
      date,
      dueDate,
      reference: reference.trim() || null,
      discountAmount: discount,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      status,
      lines: lines.map((line) => ({
        itemId: line.itemId || null,
        description: line.description.trim(),
        quantity: parseNumber(line.quantity),
        rate: round2(parseNumber(line.rate)),
        taxRate: parseNumber(line.taxRate),
      })),
    };
    const saved = await run<Invoice>(() => (invoiceId ? invoicesApi.update(invoiceId, payload) : invoicesApi.create(payload)));
    if (saved) {
      toast.success(`Invoice ${saved.invoiceNumber} ${isEdit ? 'updated' : 'created'}`);
      navigate(`/invoices/${saved.id}`);
    }
  };

  if (!canWrite) {
    return (
      <>
        <PageHeader title="New invoice" />
        <ErrorBlock message="Your account has read-only access, so you cannot create or edit invoices." />
      </>
    );
  }
  if (isEdit && existing.loading) return <LoadingBlock label="Loading invoice…" />;
  if (isEdit && existing.error) {
    return (
      <>
        <PageHeader title="Edit invoice" />
        <ErrorBlock message={existing.error} onRetry={existing.reload} />
      </>
    );
  }
  if (blocked && loaded) {
    return (
      <>
        <PageHeader
          title={`Invoice ${loaded.invoiceNumber}`}
          actions={<Button onClick={() => navigate(`/invoices/${loaded.id}`)}>Back to invoice</Button>}
        />
        <ErrorBlock
          message={
            loaded.status === 'void'
              ? 'This invoice has been voided, so it can no longer be edited. Create a new invoice instead.'
              : 'This invoice already has payments recorded against it. Delete those payments first if you need to change it.'
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit && loaded ? `Edit invoice ${loaded.invoiceNumber}` : 'New invoice'}
        subtitle={isEdit ? 'Changes re-post this invoice to your books.' : 'Bill a customer for goods or services.'}
        breadcrumb={['Sales', 'Invoices']}
        actions={<Button onClick={() => navigate(isEdit && loaded ? `/invoices/${loaded.id}` : '/invoices')}>Cancel</Button>}
      />

      {customers.error ? <ErrorBlock message={customers.error} onRetry={customers.reload} /> : null}
      {items.error ? <ErrorBlock message={items.error} onRetry={items.reload} /> : null}

      <div className="stack">
        <Card title="Invoice details">
          <FormError message={error} />
          <div className="form-grid">
            <SelectField
              label="Customer"
              required
              value={customerId}
              placeholder={customers.loading ? 'Loading customers…' : 'Select a customer'}
              disabled={customers.loading}
              error={fieldErrors.customerId}
              options={customerList.map((customer) => ({ value: customer.id, label: customer.displayName }))}
              onChange={(event) => {
                setCustomerId(event.target.value);
                syncDueDate(event.target.value, date);
              }}
            />
            <TextField
              label="Invoice date"
              type="date"
              required
              value={date}
              error={fieldErrors.date}
              onChange={(event) => {
                setDate(event.target.value);
                syncDueDate(customerId, event.target.value);
              }}
            />
            <TextField
              label="Due date"
              type="date"
              required
              value={dueDate}
              min={date}
              hint="Prefilled from the customer's payment terms."
              error={fieldErrors.dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
            <TextField
              label="Reference"
              value={reference}
              placeholder="PO number or internal reference"
              error={fieldErrors.reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
        </Card>

        <Card
          title="Line items"
          subtitle="Amounts are calculated as quantity × rate, with tax applied per line."
          footer={
            <Button icon={<Plus size={15} />} onClick={() => setLines((current) => [...current, newLine()])}>
              Add line
            </Button>
          }
        >
          <div className="table-wrap">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Description</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Rate</th>
                  <th scope="col">Tax %</th>
                  <th scope="col">Amount</th>
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const item = itemList.find((entry) => entry.id === line.itemId);
                  return (
                    <tr key={line.key}>
                      <td>
                        <select
                          className="select"
                          aria-label={`Item for line ${index + 1}`}
                          value={line.itemId}
                          disabled={items.loading}
                          onChange={(event) => chooseItem(line.key, event.target.value)}
                        >
                          <option value="">Custom line</option>
                          {itemList.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name}
                            </option>
                          ))}
                        </select>
                        {item?.trackInventory ? (
                          <small className={item.stockOnHand > 0 ? 'text-subtle' : 'text-danger'}>
                            {formatQuantity(item.stockOnHand)} {item.unit} in stock
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <input
                          className="input"
                          aria-label={`Description for line ${index + 1}`}
                          value={line.description}
                          required
                          onChange={(event) => updateLine(line.key, { description: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="input num"
                          type="number"
                          min="0"
                          step="0.001"
                          aria-label={`Quantity for line ${index + 1}`}
                          value={line.quantity}
                          onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="input num"
                          type="number"
                          min="0"
                          step="0.01"
                          aria-label={`Rate for line ${index + 1}`}
                          value={line.rate}
                          onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          aria-label={`Tax rate for line ${index + 1}`}
                          value={line.taxRate}
                          onChange={(event) => updateLine(line.key, { taxRate: event.target.value })}
                        >
                          {TAX_RATES.map((rate) => (
                            <option key={rate} value={String(rate)}>
                              {rate}%
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="align-right num">{formatCurrency(lineAmount(line))}</td>
                      <td className="align-right">
                        <button
                          type="button"
                          className="action-btn is-danger"
                          aria-label={`Remove line ${index + 1}`}
                          disabled={lines.length === 1}
                          onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {fieldErrors.lines ? <FormError message={fieldErrors.lines} /> : null}
        </Card>

        <div className="grid-2">
          <Card title="Notes and terms">
            <TextAreaField
              label="Notes"
              value={notes}
              hint="Shown to the customer on the invoice."
              error={fieldErrors.notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <TextAreaField label="Terms" value={terms} error={fieldErrors.terms} onChange={(event) => setTerms(event.target.value)} />
          </Card>
          <Card title="Totals">
            <TextField
              label="Discount"
              type="number"
              min="0"
              step="0.01"
              prefix="₹"
              value={discountAmount}
              error={fieldErrors.discountAmount}
              onChange={(event) => setDiscountAmount(event.target.value)}
            />
            <div className="form-section">
              <div className="totals-list">
                <div>
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div>
                  <span>Discount</span>
                  <span>{discount > 0 ? `- ${formatCurrency(discount)}` : formatCurrency(0)}</span>
                </div>
                <div>
                  <span>Tax total</span>
                  <span>{formatCurrency(taxTotal)}</span>
                </div>
                <div className="grand">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="row-between">
          <span className="text-subtle small">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {formatCurrency(total)} payable
          </span>
          <div className="row">
            {keepSent ? (
              <Button variant="primary" loading={submitting} onClick={() => submit('sent')}>
                Save changes
              </Button>
            ) : (
              <>
                <Button variant="secondary" disabled={submitting} onClick={() => submit('draft')}>
                  Save as draft
                </Button>
                <Button variant="primary" loading={submitting} onClick={() => submit('sent')}>
                  Save and mark as sent
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
