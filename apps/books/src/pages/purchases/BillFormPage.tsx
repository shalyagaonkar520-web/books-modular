import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';

import { accountingApi, billsApi, contactsApi, itemsApi } from '@/api/endpoints';
import type { Account, Contact, Item } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatCurrency, parseNumber, round2, todayIso } from '@/utils/format';
import { TAX_RATES } from '@/utils/status';

interface LineDraft {
  key: string;
  itemId: string;
  accountId: string;
  description: string;
  quantity: string;
  rate: string;
  taxRate: string;
}

let nextLineKey = 1;

function emptyLine(): LineDraft {
  return { key: `line-${nextLineKey++}`, itemId: '', accountId: '', description: '', quantity: '1', rate: '0', taxRate: '0' };
}

const TAX_OPTIONS = TAX_RATES.map((rate) => ({ value: String(rate), label: `${rate}%` }));

function lineAmount(line: LineDraft): number {
  return round2(parseNumber(line.quantity, 0) * parseNumber(line.rate, 0));
}

export function BillFormPage() {
  const { billId } = useParams<{ billId: string }>();
  const isEdit = Boolean(billId);
  const navigate = useNavigate();
  const toast = useToast();
  const { submitting, error, fieldErrors, run, setError } = useSubmit();

  const refs = useAsync(async () => {
    const [vendorPage, itemPage, accounts] = await Promise.all([
      contactsApi.list({ type: 'vendor', page_size: 200 }),
      itemsApi.list({ page_size: 200 }),
      accountingApi.accounts(),
    ]);
    return {
      vendors: vendorPage.items as Contact[],
      items: itemPage.items as Item[],
      accounts: accounts.filter((account: Account) => account.type === 'expense' || account.type === 'asset'),
    };
  }, []);

  const existing = useAsync(async () => (billId ? billsApi.get(billId) : null), [billId]);

  const [vendorId, setVendorId] = useState('');
  const [vendorBillNumber, setVendorBillNumber] = useState('');
  const [date, setDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState('');
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine()]);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const bill = existing.data;
  const editBlocked = bill ? bill.status === 'paid' || bill.status === 'partially_paid' || bill.status === 'void' || bill.amountPaid > 0 : false;

  // Hydrate the form once the bill arrives.
  useEffect(() => {
    if (!bill || loadedId === bill.id) return;
    setLoadedId(bill.id);
    setVendorId(bill.vendorId);
    setVendorBillNumber(bill.vendorBillNumber ?? '');
    setDate(bill.date);
    setDueDate(bill.dueDate);
    setDueDateTouched(true);
    setDiscountAmount(String(bill.discountAmount));
    setNotes(bill.notes ?? '');
    setLines(
      bill.lines.length > 0
        ? bill.lines.map((line) => ({
            key: `line-${nextLineKey++}`,
            itemId: line.itemId ?? '',
            accountId: line.accountId ?? '',
            description: line.description,
            quantity: String(line.quantity),
            rate: String(line.rate),
            taxRate: String(line.taxRate),
          }))
        : [emptyLine()],
    );
  }, [bill, loadedId]);

  const vendor = useMemo(() => refs.data?.vendors.find((candidate) => candidate.id === vendorId) ?? null, [refs.data, vendorId]);

  // Default the due date from the vendor's payment terms until the user edits it.
  useEffect(() => {
    if (dueDateTouched || !vendor || !date) return;
    setDueDate(addDaysIso(date, vendor.paymentTermsDays));
  }, [vendor, date, dueDateTouched]);

  const subtotal = round2(lines.reduce((sum, line) => sum + lineAmount(line), 0));
  const taxTotal = round2(lines.reduce((sum, line) => sum + round2((lineAmount(line) * parseNumber(line.taxRate, 0)) / 100), 0));
  const discount = round2(parseNumber(discountAmount, 0));
  const grandTotal = round2(subtotal - discount + taxTotal);

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const pickItem = (key: string, itemId: string) => {
    const item = refs.data?.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      updateLine(key, { itemId: '' });
      return;
    }
    updateLine(key, {
      itemId,
      description: item.purchaseDescription || item.description || item.name,
      rate: String(item.costPrice),
      taxRate: String(item.taxRate),
    });
  };

  const validate = (): string | null => {
    if (!vendorId) return 'Choose the vendor this bill is from.';
    if (lines.length === 0) return 'Add at least one line item.';
    for (const [index, line] of lines.entries()) {
      if (!line.description.trim()) return `Line ${index + 1}: enter a description.`;
      if (parseNumber(line.quantity, 0) <= 0) return `Line ${index + 1}: quantity must be greater than zero.`;
    }
    if (discount > subtotal) return 'Discount cannot exceed the subtotal.';
    return null;
  };

  const save = async (status: 'draft' | 'open') => {
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    const body = {
      vendorId,
      vendorBillNumber: vendorBillNumber.trim() || null,
      date,
      dueDate: dueDate || null,
      discountAmount: discount,
      notes: notes.trim() || null,
      status,
      lines: lines.map((line) => ({
        itemId: line.itemId || null,
        accountId: line.accountId || null,
        description: line.description.trim(),
        quantity: parseNumber(line.quantity, 0),
        rate: parseNumber(line.rate, 0),
        taxRate: parseNumber(line.taxRate, 0),
      })),
    };
    const result = await run(() => (billId ? billsApi.update(billId, body) : billsApi.create(body)));
    if (result) {
      toast.success(isEdit ? `Bill ${result.billNumber} updated` : `Bill ${result.billNumber} saved as ${result.status}`);
      navigate('/bills');
    }
  };

  if (refs.loading || (isEdit && existing.loading)) return <LoadingBlock label="Loading bill form…" />;
  if (refs.error) return <ErrorBlock message={refs.error} onRetry={refs.reload} />;
  if (isEdit && existing.error) return <ErrorBlock message={existing.error} onRetry={existing.reload} />;
  if (isEdit && editBlocked) {
    return (
      <>
        <PageHeader
          title={`Bill ${bill?.billNumber ?? ''}`.trim()}
          subtitle="This bill can no longer be edited."
          breadcrumb={['Purchases', 'Bills']}
          actions={
            <Button variant="secondary" onClick={() => navigate('/bills')}>
              Back to bills
            </Button>
          }
        />
        <ErrorBlock
          message={
            bill?.status === 'void'
              ? 'This bill has been voided, so it can no longer be edited. Create a new bill instead.'
              : 'This bill already has payments recorded against it. Delete the payments first, or create a new bill.'
          }
        />
      </>
    );
  }

  const isOpenBill = bill?.status === 'open' || bill?.status === 'overdue';

  return (
    <>
      <PageHeader
        title={isEdit ? `Edit bill ${bill?.billNumber ?? ''}`.trim() : 'New bill'}
        subtitle="Record what you owe a vendor. Opening a bill posts it to the ledger."
        breadcrumb={['Purchases', 'Bills']}
        actions={
          <Button variant="secondary" onClick={() => navigate('/bills')} disabled={submitting}>
            Cancel
          </Button>
        }
      />

      <Card>
        <FormError message={error} />

        <div className="form-section">
          <div className="form-grid">
            <SelectField
              label="Vendor"
              required
              value={vendorId}
              placeholder="Select a vendor"
              error={fieldErrors.vendorId}
              options={(refs.data?.vendors ?? []).map((option) => ({ value: option.id, label: option.displayName }))}
              onChange={(event) => setVendorId(event.target.value)}
            />
            <TextField
              label="Vendor bill number"
              value={vendorBillNumber}
              error={fieldErrors.vendorBillNumber}
              hint="The number printed on the vendor's invoice."
              onChange={(event) => setVendorBillNumber(event.target.value)}
            />
          </div>
          <div className="form-grid">
            <TextField
              label="Bill date"
              type="date"
              required
              value={date}
              error={fieldErrors.date}
              onChange={(event) => setDate(event.target.value)}
            />
            <TextField
              label="Due date"
              type="date"
              value={dueDate}
              error={fieldErrors.dueDate}
              hint={vendor ? `${vendor.displayName} terms: ${vendor.paymentTermsDays} days` : 'Defaults from the vendor payment terms.'}
              onChange={(event) => {
                setDueDateTouched(true);
                setDueDate(event.target.value);
              }}
            />
          </div>
        </div>

        <div className="form-section">
          <h2 className="form-section-title">Line items</h2>
          <table className="line-items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Account</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Tax</th>
                <th>Amount</th>
                <th>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const item = refs.data?.items.find((candidate) => candidate.id === line.itemId) ?? null;
                return (
                  <tr key={line.key}>
                    <td>
                      <select
                        className="select"
                        value={line.itemId}
                        aria-label={`Line ${index + 1} item`}
                        onChange={(event) => pickItem(line.key, event.target.value)}
                      >
                        <option value="">No item</option>
                        {(refs.data?.items ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      {item?.trackInventory ? <small className="text-muted">Stock will increase when this bill is opened.</small> : null}
                    </td>
                    <td>
                      <select
                        className="select"
                        value={line.accountId}
                        aria-label={`Line ${index + 1} account`}
                        onChange={(event) => updateLine(line.key, { accountId: event.target.value })}
                      >
                        <option value="">Default expense account</option>
                        {(refs.data?.accounts ?? []).map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} · {account.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input"
                        value={line.description}
                        required
                        aria-label={`Line ${index + 1} description`}
                        onChange={(event) => updateLine(line.key, { description: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input num"
                        type="number"
                        min="0"
                        step="0.001"
                        value={line.quantity}
                        aria-label={`Line ${index + 1} quantity`}
                        onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="input num"
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.rate}
                        aria-label={`Line ${index + 1} rate`}
                        onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="select"
                        value={line.taxRate}
                        aria-label={`Line ${index + 1} tax rate`}
                        onChange={(event) => updateLine(line.key, { taxRate: event.target.value })}
                      >
                        {TAX_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">{formatCurrency(lineAmount(line))}</td>
                    <td>
                      <button
                        type="button"
                        className="action-btn is-danger"
                        aria-label={`Remove line ${index + 1}`}
                        disabled={lines.length === 1}
                        onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row">
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setLines((current) => [...current, emptyLine()])}>
              Add line
            </Button>
          </div>
        </div>

        <div className="form-section">
          <div className="form-grid">
            <TextField
              label="Discount amount"
              type="number"
              min="0"
              step="0.01"
              value={discountAmount}
              error={fieldErrors.discountAmount}
              hint={`Cannot exceed the subtotal of ${formatCurrency(subtotal)}.`}
              onChange={(event) => setDiscountAmount(event.target.value)}
            />
            <TextAreaField label="Notes" value={notes} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <div className="totals-list">
            <div>
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div>
              <span>Discount</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
            <div>
              <span>Tax total</span>
              <span>{formatCurrency(taxTotal)}</span>
            </div>
            <div className="grand">
              <span>Grand total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>

        <div className="row-between">
          <span className="text-subtle small">
            {isEdit ? 'Saving re-posts the ledger entries for this bill.' : 'Drafts stay out of the ledger until you open them.'}
          </span>
          <div className="row">
            {isEdit && isOpenBill ? (
              <Button variant="primary" loading={submitting} onClick={() => void save('open')}>
                Save changes
              </Button>
            ) : (
              <>
                <Button variant="secondary" loading={submitting} onClick={() => void save('draft')}>
                  Save as draft
                </Button>
                <Button variant="primary" loading={submitting} onClick={() => void save('open')}>
                  Save and open
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
