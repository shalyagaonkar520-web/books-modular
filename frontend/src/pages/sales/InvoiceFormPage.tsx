/** Create or edit a sales invoice, with a live line editor and totals that mirror the server. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';

import { currenciesApi } from '@/api/advancedAccounting';
import { priceListsApi, warehousesApi } from '@/api/inventoryOps';
import { contactsApi, invoicesApi, itemsApi } from '@/api/endpoints';
import type { Contact, Invoice, Item } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatCurrency, formatQuantity, parseNumber, round2, round3, todayIso } from '@/utils/format';
import { stateFromGstin, stateOptions, TCS_RATES } from '@/utils/gst';
import { taxRatesWith } from '@/utils/status';
import { BranchSelect } from '@/pages/operations/BranchSelect';

interface LineDraft {
  key: string;
  itemId: string;
  /** The line's posting account, carried through so editing keeps it. */
  accountId: string;
  description: string;
  quantity: string;
  rate: string;
  taxRate: string;
  batchNumber: string;
  serialNumbers: string;
}

let lineCounter = 0;
/** Tax rate a new line starts with when the organization sets no default. */
const FALLBACK_LINE_TAX_RATE = '0';
const newLine = (taxRate: string = FALLBACK_LINE_TAX_RATE): LineDraft => ({
  key: `line-${++lineCounter}`,
  itemId: '',
  accountId: '',
  description: '',
  quantity: '1',
  rate: '0',
  taxRate,
  batchNumber: '',
  serialNumbers: '',
});

// Match the backend, which rounds quantity to 3dp and rate to 2dp before
// multiplying, so the previewed total equals the saved total.
const lineAmount = (line: LineDraft): number => round2(round3(parseNumber(line.quantity)) * round2(parseNumber(line.rate)));
const lineTax = (line: LineDraft): number => round2((lineAmount(line) * parseNumber(line.taxRate)) / 100);

export function InvoiceFormPage() {
  const { t } = useAppContent();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const isEdit = Boolean(invoiceId);
  const navigate = useNavigate();
  const toast = useToast();
  const { organization, canWrite } = useAuth();
  // New lines (never existing ones) start at the organization's default tax rate.
  const defaultLineTaxRate = organization?.defaultTaxRate !== undefined ? String(organization.defaultTaxRate) : FALLBACK_LINE_TAX_RATE;
  const { submitting, error, fieldErrors, run, setError } = useSubmit();

  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [notes, setNotes] = useState(() => organization?.invoiceNotes ?? '');
  const [terms, setTerms] = useState(() => organization?.invoiceTerms ?? '');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine(defaultLineTaxRate)]);
  const [keepSent, setKeepSent] = useState(false);
  // The form has no project/line-account pickers, but an existing invoice may
  // carry both - preserve them so editing does not silently strip them.
  const [projectId, setProjectId] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [tcsRate, setTcsRate] = useState('0');
  const [exchangeRate, setExchangeRate] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [branchId, setBranchId] = useState('');

  const customers = useAsync((signal) => contactsApi.list({ type: 'customer', page_size: 200 }, signal), []);
  const currencies = useAsync(() => currenciesApi.list(), []);
  const warehouses = useAsync(() => warehousesApi.list(), []);
  const priceListId = useMemo(() => customers.data?.items.find((c) => c.id === customerId)?.priceListId ?? null, [customers.data, customerId]);
  const priceList = useAsync(async () => (priceListId ? priceListsApi.prices(priceListId) : []), [priceListId]);
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
    setOrderNumber(loaded.orderNumber ?? '');
    setSubject(loaded.subject ?? '');
    setSalesperson(loaded.salesperson ?? '');
    setNotes(loaded.notes ?? '');
    setTerms(loaded.terms ?? '');
    setDiscountAmount(String(loaded.fcDiscountAmount ?? loaded.discountAmount));
    setKeepSent(loaded.status === 'sent' || loaded.status === 'overdue');
    setProjectId(loaded.projectId ?? '');
    setPlaceOfSupply(loaded.placeOfSupply ?? '');
    setTcsRate(String(loaded.tcsRate ?? 0));
    setExchangeRate(loaded.exchangeRate && loaded.exchangeRate !== 1 ? String(loaded.exchangeRate) : '');
    setWarehouseId(loaded.warehouseId ?? '');
    setBranchId(loaded.branchId ?? '');
    setLines(
      loaded.lines.length
        ? loaded.lines.map((line) => ({
            key: line.id ?? `line-${++lineCounter}`,
            itemId: line.itemId ?? '',
            accountId: line.accountId ?? '',
            description: line.description,
            quantity: String(line.quantity),
            // In the invoice's own currency (equal to rate for base-currency invoices).
            rate: String(line.fcRate ?? line.rate),
            taxRate: String(line.taxRate),
            batchNumber: line.batchNumber ?? '',
            serialNumbers: line.serialNumbers ?? '',
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
      rate: String(priceList.data?.find((p) => p.itemId === item.id)?.rate ?? item.sellingPrice),
      taxRate: String(item.taxRate),
    });
  };

  const subtotal = round2(lines.reduce((sum, line) => sum + lineAmount(line), 0));
  const taxTotal = round2(lines.reduce((sum, line) => sum + lineTax(line), 0));
  const discount = round2(parseNumber(discountAmount));
  const beforeTcs = round2(subtotal - discount + taxTotal);
  const tcsAmount = round2((beforeTcs * parseNumber(tcsRate)) / 100);
  const total = round2(beforeTcs + tcsAmount);
  const baseCurrency = organization?.currency ?? 'INR';
  const customerCurrency = customerList.find((c) => c.id === customerId)?.currency || baseCurrency;
  const foreign = customerCurrency !== baseCurrency;
  const money = (amount: number) => formatCurrency(amount, customerCurrency);
  const customerState = stateFromGstin(customerList.find((c) => c.id === customerId)?.gstin) ?? customerList.find((c) => c.id === customerId)?.placeOfSupply;

  const submit = async (status: 'draft' | 'sent') => {
    if (!customerId) {
      setError(t('invoices.form.selectCustomer'));
      return;
    }
    if (!lines.length) {
      setError(t('invoices.form.needLine'));
      return;
    }
    if (lines.some((line) => !line.description.trim())) {
      setError(t('invoices.form.needDescription'));
      return;
    }
    if (lines.some((line) => parseNumber(line.quantity) <= 0)) {
      setError(t('invoices.form.needQuantity'));
      return;
    }
    if (discount > subtotal) {
      setError(t('invoices.form.discountTooHigh'));
      return;
    }
    const payload = {
      customerId,
      projectId: projectId || null,
      date,
      dueDate,
      reference: reference.trim() || null,
      orderNumber: orderNumber.trim() || null,
      subject: subject.trim() || null,
      salesperson: salesperson.trim() || null,
      discountAmount: discount,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      status,
      placeOfSupply: placeOfSupply || null,
      tcsRate: parseNumber(tcsRate),
      exchangeRate: foreign && parseNumber(exchangeRate) > 0 ? parseNumber(exchangeRate) : null,
      warehouseId: warehouseId || null,
      branchId: branchId || null,
      lines: lines.map((line) => ({
        itemId: line.itemId || null,
        accountId: line.accountId || null,
        description: line.description.trim(),
        quantity: parseNumber(line.quantity),
        rate: round2(parseNumber(line.rate)),
        taxRate: parseNumber(line.taxRate),
        batchNumber: line.batchNumber.trim() || null,
        serialNumbers: line.serialNumbers.trim() || null,
      })),
    };
    const saved = await run<Invoice>(() => (invoiceId ? invoicesApi.update(invoiceId, payload) : invoicesApi.create(payload)));
    if (saved) {
      toast.success(isEdit ? t('invoices.form.updated', { number: saved.invoiceNumber }) : t('invoices.form.created', { number: saved.invoiceNumber }));
      navigate(`/invoices/${saved.id}`);
    }
  };

  if (!canWrite) {
    return (
      <>
        <PageHeader title={t('invoices.form.newTitle')} />
        <ErrorBlock message={t('invoices.form.readOnly')} />
      </>
    );
  }
  if (isEdit && existing.loading) return <LoadingBlock label={t('invoices.form.loading')} />;
  if (isEdit && existing.error) {
    return (
      <>
        <PageHeader title={t('invoices.form.editTitle')} />
        <ErrorBlock message={existing.error} onRetry={existing.reload} />
      </>
    );
  }
  if (blocked && loaded) {
    return (
      <>
        <PageHeader
          title={t('invoices.form.blockedTitle', { number: loaded.invoiceNumber })}
          actions={<Button onClick={() => navigate(`/invoices/${loaded.id}`)}>{t('invoices.form.backToInvoice')}</Button>}
        />
        <ErrorBlock
          message={
            loaded.status === 'void'
              ? t('invoices.form.voided')
              : t('invoices.form.hasPayments')
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit && loaded ? t('invoices.form.editNumberTitle', { number: loaded.invoiceNumber }) : t('invoices.form.newTitle')}
        subtitle={isEdit ? t('invoices.form.subtitleEdit') : t('invoices.form.subtitleNew')}
        breadcrumb={[t('invoices.form.breadcrumb.sales'), t('invoices.form.breadcrumb.invoices')]}
        actions={<Button onClick={() => navigate(isEdit && loaded ? `/invoices/${loaded.id}` : '/invoices')}>{t('invoices.form.cancel')}</Button>}
      />

      {customers.error ? <ErrorBlock message={customers.error} onRetry={customers.reload} /> : null}
      {items.error ? <ErrorBlock message={items.error} onRetry={items.reload} /> : null}

      <div className="stack">
        <Card title={t('invoices.form.section.details')}>
          <FormError message={error} />
          <div className="form-grid">
            <SelectField
              label={t('invoices.form.customer')}
              required
              value={customerId}
              placeholder={customers.loading ? t('invoices.form.loadingCustomers') : t('invoices.form.customerPlaceholder')}
              disabled={customers.loading}
              error={fieldErrors.customerId}
              options={customerList.map((customer) => ({ value: customer.id, label: customer.displayName }))}
              onChange={(event) => {
                setCustomerId(event.target.value);
                syncDueDate(event.target.value, date);
                const code = customerList.find((c) => c.id === event.target.value)?.currency;
                const saved = currencies.data?.find((c) => c.code === code)?.exchangeRate;
                setExchangeRate(saved ? String(saved) : '');
              }}
            />
            {foreign ? (
              <TextField
                label={`${t('invoices.form.exchangeRate')} (${customerCurrency})`}
                type="number"
                min="0"
                step="0.000001"
                required
                value={exchangeRate}
                hint={t('invoices.form.exchangeRateHint', { base: baseCurrency, code: customerCurrency })}
                error={fieldErrors.exchangeRate}
                onChange={(event) => setExchangeRate(event.target.value)}
              />
            ) : null}
            <TextField
              label={t('invoices.form.date')}
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
              label={t('invoices.form.dueDate')}
              type="date"
              required
              value={dueDate}
              min={date}
              hint={t('invoices.form.dueDateHint')}
              error={fieldErrors.dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
            <TextField
              label={t('invoices.form.reference')}
              value={reference}
              placeholder={t('invoices.form.referencePlaceholder')}
              error={fieldErrors.reference}
              onChange={(event) => setReference(event.target.value)}
            />
            <TextField
              label={t('invoices.form.orderNumber')}
              value={orderNumber}
              placeholder={t('invoices.form.orderNumberPlaceholder')}
              error={fieldErrors.orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
            />
            <TextField
              label={t('invoices.form.salesperson')}
              value={salesperson}
              error={fieldErrors.salesperson}
              onChange={(event) => setSalesperson(event.target.value)}
            />
            <TextField
              label={t('invoices.form.subject')}
              value={subject}
              maxLength={250}
              placeholder={t('invoices.form.subjectPlaceholder')}
              hint={t('invoices.form.subjectHint')}
              error={fieldErrors.subject}
              onChange={(event) => setSubject(event.target.value)}
            />
            <BranchSelect value={branchId} onChange={setBranchId} />
            {(warehouses.data?.length ?? 0) > 1 ? (
              <SelectField
                label={t('docflow.form.warehouse')}
                value={warehouseId}
                placeholder={t('docflow.form.warehouseDefault')}
                options={(warehouses.data ?? []).filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name }))}
                onChange={(event) => setWarehouseId(event.target.value)}
              />
            ) : null}
            <SelectField
              label={t('invoices.form.placeOfSupply')}
              value={placeOfSupply}
              placeholder={customerState ? t('invoices.form.placeOfSupplyDefault', { code: customerState }) : t('invoices.form.placeOfSupplyUnknown')}
              options={stateOptions}
              hint={t('invoices.form.placeOfSupplyHint')}
              error={fieldErrors.placeOfSupply}
              onChange={(event) => setPlaceOfSupply(event.target.value)}
            />
          </div>
        </Card>

        <Card
          title={t('invoices.form.section.lines')}
          subtitle={t('invoices.form.linesSubtitle')}
          footer={
            <Button icon={<Plus size={15} />} onClick={() => setLines((current) => [...current, newLine(defaultLineTaxRate)])}>
              {t('invoices.form.addLine')}
            </Button>
          }
        >
          <div className="table-wrap">
            <table className="line-items-table">
              <thead>
                <tr>
                  <th scope="col">{t('invoices.form.col.item')}</th>
                  <th scope="col">{t('invoices.form.col.description')}</th>
                  <th scope="col">{t('invoices.form.col.qty')}</th>
                  <th scope="col">{t('invoices.form.col.rate')}</th>
                  <th scope="col">{t('invoices.form.col.tax')}</th>
                  <th scope="col">{t('invoices.form.col.amount')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('invoices.form.col.remove')}</span>
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
                          aria-label={t('invoices.form.line.itemAria', { n: index + 1 })}
                          value={line.itemId}
                          disabled={items.loading}
                          onChange={(event) => chooseItem(line.key, event.target.value)}
                        >
                          <option value="">{t('invoices.form.line.custom')}</option>
                          {itemList.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name}
                            </option>
                          ))}
                        </select>
                        {item?.trackInventory ? (
                          <small className={item.stockOnHand > 0 ? 'text-subtle' : 'text-danger'}>
                            {t('invoices.form.line.inStock', { quantity: formatQuantity(item.stockOnHand), unit: item.unit })}
                          </small>
                        ) : null}
                        {item?.trackInventory ? (
                          <input
                            className="input input-sm"
                            placeholder={t('docflow.lines.batch')}
                            aria-label={t('docflow.lines.batch')}
                            value={line.batchNumber}
                            onChange={(event) => updateLine(line.key, { batchNumber: event.target.value })}
                          />
                        ) : null}
                        {item?.trackSerial ? (
                          <textarea
                            className="input input-sm"
                            rows={2}
                            placeholder={t('ops.serials.placeholder', { count: line.quantity })}
                            aria-label={t('ops.serials.label')}
                            value={line.serialNumbers}
                            onChange={(event) => updateLine(line.key, { serialNumbers: event.target.value })}
                          />
                        ) : null}
                      </td>
                      <td>
                        <input
                          className="input"
                          aria-label={t('invoices.form.line.descriptionAria', { n: index + 1 })}
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
                          aria-label={t('invoices.form.line.quantityAria', { n: index + 1 })}
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
                          aria-label={t('invoices.form.line.rateAria', { n: index + 1 })}
                          value={line.rate}
                          onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="select"
                          aria-label={t('invoices.form.line.taxAria', { n: index + 1 })}
                          value={line.taxRate}
                          onChange={(event) => updateLine(line.key, { taxRate: event.target.value })}
                        >
                          {taxRatesWith(organization?.defaultTaxRate, parseNumber(line.taxRate)).map((rate) => (
                            <option key={rate} value={String(rate)}>
                              {rate}%
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="align-right num">{money(lineAmount(line))}</td>
                      <td className="align-right">
                        <button
                          type="button"
                          className="action-btn is-danger"
                          aria-label={t('invoices.form.line.removeAria', { n: index + 1 })}
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
          <Card title={t('invoices.form.section.notes')}>
            <TextAreaField
              label={t('invoices.form.notes')}
              value={notes}
              hint={t('invoices.form.notesHint')}
              error={fieldErrors.notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <TextAreaField label={t('invoices.form.terms')} value={terms} error={fieldErrors.terms} onChange={(event) => setTerms(event.target.value)} />
          </Card>
          <Card title={t('invoices.form.section.totals')}>
            <TextField
              label={t('invoices.form.discount')}
              type="number"
              min="0"
              step="0.01"
              prefix="₹"
              value={discountAmount}
              error={fieldErrors.discountAmount}
              onChange={(event) => setDiscountAmount(event.target.value)}
            />
            <SelectField
              label={t('invoices.form.tcs')}
              value={tcsRate}
              options={TCS_RATES.map((rate) => ({ value: String(rate), label: rate ? `${rate}%` : t('invoices.form.tcsNone') }))}
              hint={t('invoices.form.tcsHint')}
              onChange={(event) => setTcsRate(event.target.value)}
            />
            <div className="form-section">
              <div className="totals-list">
                <div>
                  <span>{t('invoices.form.totals.subtotal')}</span>
                  <span>{money(subtotal)}</span>
                </div>
                <div>
                  <span>{t('invoices.form.totals.discount')}</span>
                  <span>{discount > 0 ? `- ${money(discount)}` : money(0)}</span>
                </div>
                <div>
                  <span>{t('invoices.form.totals.tax')}</span>
                  <span>{money(taxTotal)}</span>
                </div>
                {tcsAmount > 0 ? (
                  <div>
                    <span>{t('invoices.form.totals.tcs')}</span>
                    <span>{money(tcsAmount)}</span>
                  </div>
                ) : null}
                <div className="grand">
                  <span>{t('invoices.form.totals.total')}</span>
                  <span>{money(total)}</span>
                </div>
                {foreign && parseNumber(exchangeRate) > 0 ? (
                  <div className="text-subtle small">
                    <span>{t('invoices.form.inBase', { base: baseCurrency, amount: formatCurrency(round2(total * parseNumber(exchangeRate)), baseCurrency) })}</span>
                    <span />
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        <div className="row-between">
          <span className="text-subtle small">
            {t(lines.length === 1 ? 'invoices.form.summaryOne' : 'invoices.form.summaryMany', { count: lines.length, total: formatCurrency(total) })}
          </span>
          <div className="row">
            {keepSent ? (
              <Button variant="primary" loading={submitting} onClick={() => submit('sent')}>
                {t('invoices.form.saveChanges')}
              </Button>
            ) : (
              <>
                <Button variant="secondary" disabled={submitting} onClick={() => submit('draft')}>
                  {t('invoices.form.saveDraft')}
                </Button>
                <Button variant="primary" loading={submitting} onClick={() => submit('sent')}>
                  {t('invoices.form.saveSent')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
