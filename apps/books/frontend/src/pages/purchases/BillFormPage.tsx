import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';

import { accountingApi, billsApi, contactsApi, itemsApi } from '@/api/endpoints';
import type { Contact, Item } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatCurrency, parseNumber, round2, round3, todayIso } from '@/utils/format';
import { taxRatesWith } from '@/utils/status';

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

/** Tax rate a new line starts with when the organization sets no default. */
const FALLBACK_LINE_TAX_RATE = '0';

function emptyLine(taxRate: string = FALLBACK_LINE_TAX_RATE): LineDraft {
  return { key: `line-${nextLineKey++}`, itemId: '', accountId: '', description: '', quantity: '1', rate: '0', taxRate };
}


function lineAmount(line: LineDraft): number {
  // Match the backend, which rounds quantity to 3dp and rate to 2dp before
  // multiplying, so the previewed total equals the saved total.
  return round2(round3(parseNumber(line.quantity, 0)) * round2(parseNumber(line.rate, 0)));
}

export function BillFormPage() {
  const { t } = useAppContent();
  const { billId } = useParams<{ billId: string }>();
  const isEdit = Boolean(billId);
  const navigate = useNavigate();
  const toast = useToast();
  const { submitting, error, fieldErrors, run, setError } = useSubmit();
  // Reading the chart of accounts is Admin/Viewer only, but Staff may record a
  // bill - so only fetch the accounts when the role can read them, otherwise the
  // whole form 403s on open. The per-line account picker then falls back to the
  // "Default expense account" option and the server applies its default.
  const { can, organization } = useAuth();
  const canReadAccounts = can('admin', 'viewer');
  // New lines (never existing ones) start at the organization's default tax rate.
  const defaultLineTaxRate = organization?.defaultTaxRate !== undefined ? String(organization.defaultTaxRate) : FALLBACK_LINE_TAX_RATE;

  const refs = useAsync(async () => {
    const [vendorPage, itemPage, accounts] = await Promise.all([
      contactsApi.list({ type: 'vendor', page_size: 200 }),
      itemsApi.list({ page_size: 200 }),
      // Staff can't read the full chart of accounts, but bill lines still need
      // an account: the options endpoint serves the allowed expense/asset rows.
      canReadAccounts ? accountingApi.accounts() : accountingApi.accountOptions('expense,asset'),
    ]);
    return {
      vendors: vendorPage.items as Contact[],
      items: itemPage.items as Item[],
      accounts: accounts.filter((account) => account.type === 'expense' || account.type === 'asset'),
    };
  }, [canReadAccounts]);

  const existing = useAsync(async () => (billId ? billsApi.get(billId) : null), [billId]);

  const [vendorId, setVendorId] = useState('');
  const [vendorBillNumber, setVendorBillNumber] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState('');
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine(defaultLineTaxRate)]);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const bill = existing.data;
  const editBlocked = bill ? bill.status === 'paid' || bill.status === 'partially_paid' || bill.status === 'void' || bill.amountPaid > 0 : false;

  // Hydrate the form once the bill arrives.
  useEffect(() => {
    if (!bill || loadedId === bill.id) return;
    setLoadedId(bill.id);
    setVendorId(bill.vendorId);
    setVendorBillNumber(bill.vendorBillNumber ?? '');
    setOrderNumber(bill.orderNumber ?? '');
    setSubject(bill.subject ?? '');
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
    if (!vendorId) return t('bills.form.validate.vendor');
    if (lines.length === 0) return t('bills.form.validate.noLines');
    for (const [index, line] of lines.entries()) {
      if (!line.description.trim()) return t('bills.form.validate.description', { line: index + 1 });
      if (parseNumber(line.quantity, 0) <= 0) return t('bills.form.validate.quantity', { line: index + 1 });
    }
    if (discount > subtotal) return t('bills.form.validate.discount');
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
      orderNumber: orderNumber.trim() || null,
      subject: subject.trim() || null,
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
      toast.success(
        isEdit
          ? t('bills.form.toast.updated', { number: result.billNumber })
          : t('bills.form.toast.saved', { number: result.billNumber, status: result.status }),
      );
      navigate('/bills');
    }
  };

  if (refs.loading || (isEdit && existing.loading)) return <LoadingBlock label={t('bills.form.loading')} />;
  if (refs.error) return <ErrorBlock message={refs.error} onRetry={refs.reload} />;
  if (isEdit && existing.error) return <ErrorBlock message={existing.error} onRetry={existing.reload} />;
  if (isEdit && editBlocked) {
    return (
      <>
        <PageHeader
          title={t('bills.form.blockedTitle', { number: bill?.billNumber ?? '' }).trim()}
          subtitle={t('bills.form.blockedSubtitle')}
          breadcrumb={[t('bills.form.breadcrumbPurchases'), t('bills.form.breadcrumbBills')]}
          actions={
            <Button variant="secondary" onClick={() => navigate('/bills')}>
              {t('bills.form.backToBills')}
            </Button>
          }
        />
        <ErrorBlock
          message={
            bill?.status === 'void'
              ? t('bills.form.blockedVoid')
              : t('bills.form.blockedPaid')
          }
        />
      </>
    );
  }

  const isOpenBill = bill?.status === 'open' || bill?.status === 'overdue';

  return (
    <>
      <PageHeader
        title={isEdit ? t('bills.form.editTitle', { number: bill?.billNumber ?? '' }).trim() : t('bills.form.newTitle')}
        subtitle={t('bills.form.subtitle')}
        breadcrumb={[t('bills.form.breadcrumbPurchases'), t('bills.form.breadcrumbBills')]}
        actions={
          <Button variant="secondary" onClick={() => navigate('/bills')} disabled={submitting}>
            {t('bills.form.cancel')}
          </Button>
        }
      />

      <Card>
        <FormError message={error} />

        <div className="form-section">
          <div className="form-grid">
            <SelectField
              label={t('bills.form.vendor')}
              required
              value={vendorId}
              placeholder={t('bills.form.vendorPlaceholder')}
              error={fieldErrors.vendorId}
              options={(refs.data?.vendors ?? []).map((option) => ({ value: option.id, label: option.displayName }))}
              onChange={(event) => setVendorId(event.target.value)}
            />
            <TextField
              label={t('bills.form.vendorBillNumber')}
              value={vendorBillNumber}
              error={fieldErrors.vendorBillNumber}
              hint={t('bills.form.vendorBillNumberHint')}
              onChange={(event) => setVendorBillNumber(event.target.value)}
            />
            <TextField
              label={t('bills.form.orderNumber')}
              value={orderNumber}
              placeholder={t('bills.form.orderNumberPlaceholder')}
              error={fieldErrors.orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
            />
            <TextField
              label={t('bills.form.subject')}
              value={subject}
              maxLength={250}
              placeholder={t('bills.form.subjectPlaceholder')}
              error={fieldErrors.subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="form-grid">
            <TextField
              label={t('bills.form.billDate')}
              type="date"
              required
              value={date}
              error={fieldErrors.date}
              onChange={(event) => setDate(event.target.value)}
            />
            <TextField
              label={t('bills.form.dueDate')}
              type="date"
              value={dueDate}
              error={fieldErrors.dueDate}
              hint={
                vendor
                  ? t('bills.form.dueDateTermsHint', { vendor: vendor.displayName, days: vendor.paymentTermsDays })
                  : t('bills.form.dueDateHint')
              }
              onChange={(event) => {
                setDueDateTouched(true);
                setDueDate(event.target.value);
              }}
            />
          </div>
        </div>

        <div className="form-section">
          <h2 className="form-section-title">{t('bills.form.lineItems')}</h2>
          <table className="line-items-table">
            <thead>
              <tr>
                <th>{t('bills.form.col.item')}</th>
                <th>{t('bills.form.col.account')}</th>
                <th>{t('bills.form.col.description')}</th>
                <th>{t('bills.form.col.qty')}</th>
                <th>{t('bills.form.col.rate')}</th>
                <th>{t('bills.form.col.tax')}</th>
                <th>{t('bills.form.col.amount')}</th>
                <th>
                  <span className="sr-only">{t('bills.form.col.remove')}</span>
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
                        aria-label={t('bills.form.line.itemAria', { line: index + 1 })}
                        onChange={(event) => pickItem(line.key, event.target.value)}
                      >
                        <option value="">{t('bills.form.line.noItem')}</option>
                        {(refs.data?.items ?? []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      {item?.trackInventory ? <small className="text-muted">{t('bills.form.line.stockHint')}</small> : null}
                    </td>
                    <td>
                      <select
                        className="select"
                        value={line.accountId}
                        aria-label={t('bills.form.line.accountAria', { line: index + 1 })}
                        onChange={(event) => updateLine(line.key, { accountId: event.target.value })}
                      >
                        <option value="">{t('bills.form.line.defaultAccount')}</option>
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
                        aria-label={t('bills.form.line.descriptionAria', { line: index + 1 })}
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
                        aria-label={t('bills.form.line.quantityAria', { line: index + 1 })}
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
                        aria-label={t('bills.form.line.rateAria', { line: index + 1 })}
                        onChange={(event) => updateLine(line.key, { rate: event.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="select"
                        value={line.taxRate}
                        aria-label={t('bills.form.line.taxAria', { line: index + 1 })}
                        onChange={(event) => updateLine(line.key, { taxRate: event.target.value })}
                      >
                        {taxRatesWith(organization?.defaultTaxRate, parseNumber(line.taxRate, 0)).map((rate) => (
                          <option key={rate} value={String(rate)}>
                            {rate}%
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="num">{formatCurrency(lineAmount(line))}</td>
                    <td>
                      <button
                        type="button"
                        className="action-btn is-danger"
                        aria-label={t('bills.form.line.removeAria', { line: index + 1 })}
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
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setLines((current) => [...current, emptyLine(defaultLineTaxRate)])}>
              {t('bills.form.addLine')}
            </Button>
          </div>
        </div>

        <div className="form-section">
          <div className="form-grid">
            <TextField
              label={t('bills.form.discountAmount')}
              type="number"
              min="0"
              step="0.01"
              value={discountAmount}
              error={fieldErrors.discountAmount}
              hint={t('bills.form.discountHint', { amount: formatCurrency(subtotal) })}
              onChange={(event) => setDiscountAmount(event.target.value)}
            />
            <TextAreaField label={t('bills.form.notes')} value={notes} error={fieldErrors.notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <div className="totals-list">
            <div>
              <span>{t('bills.form.subtotal')}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div>
              <span>{t('bills.form.discount')}</span>
              <span>-{formatCurrency(discount)}</span>
            </div>
            <div>
              <span>{t('bills.form.taxTotal')}</span>
              <span>{formatCurrency(taxTotal)}</span>
            </div>
            <div className="grand">
              <span>{t('bills.form.grandTotal')}</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>

        <div className="row-between">
          <span className="text-subtle small">
            {isEdit ? t('bills.form.footerEdit') : t('bills.form.footerNew')}
          </span>
          <div className="row">
            {isEdit && isOpenBill ? (
              <Button variant="primary" loading={submitting} onClick={() => void save('open')}>
                {t('bills.form.saveChanges')}
              </Button>
            ) : (
              <>
                <Button variant="secondary" loading={submitting} onClick={() => void save('draft')}>
                  {t('bills.form.saveDraft')}
                </Button>
                <Button variant="primary" loading={submitting} onClick={() => void save('open')}>
                  {t('bills.form.saveOpen')}
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
