/** Create or edit a quote, sales order, credit note, purchase order or vendor credit. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { docApi, type DocKindKey, type FlowDocument } from '@/api/docFlow';
import { billsApi, contactsApi, invoicesApi, itemsApi } from '@/api/endpoints';
import type { Contact, Item } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { formatCurrency, todayIso } from '@/utils/format';

import { DOC_CONFIGS } from './config';
import { LineItemsEditor, type LineDraft, lineTotals, linesError, linesFrom, linesPayload, newLine } from './LineItemsEditor';

export function DocumentFormPage({ kind }: { kind: DocKindKey }) {
  const cfg = DOC_CONFIGS[kind];
  const api = docApi(kind);
  const { t } = useAppContent();
  const { docId } = useParams<{ docId: string }>();
  const [params] = useSearchParams();
  const isEdit = Boolean(docId);
  const navigate = useNavigate();
  const toast = useToast();
  const { organization, canWrite } = useAuth();
  const defaultTax = organization?.defaultTaxRate;
  const { submitting, error, fieldErrors, run, setError } = useSubmit();
  const k = (key: string) => `${cfg.texts}.${key}`;

  const [contactId, setContactId] = useState(params.get('contactId') ?? '');
  const [date, setDate] = useState(todayIso());
  const [secondDate, setSecondDate] = useState('');
  const [reference, setReference] = useState('');
  const [subject, setSubject] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [reason, setReason] = useState('');
  const [linkedId, setLinkedId] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(() => (cfg.hasTerms && cfg.party === 'customer' ? (organization?.invoiceTerms ?? '') : ''));
  const [discountAmount, setDiscountAmount] = useState('0');
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine(defaultTax !== undefined ? String(defaultTax) : '0')]);

  const contacts = useAsync((signal) => contactsApi.list({ type: cfg.party, page_size: 200 }, signal), [cfg.party]);
  const items = useAsync((signal) => itemsApi.list({ page_size: 200 }, signal), []);
  const existing = useAsync(async () => (docId ? api.get(docId) : null), [docId, kind]);
  // Credits can name the invoice / bill they reverse: offer that contact's issued ones.
  const linkable = useAsync(async () => {
    if (!cfg.isCredit || !contactId) return [];
    if (cfg.party === 'customer') {
      const page = await invoicesApi.list({ customer_id: contactId, page_size: 100 });
      return page.items.filter((inv) => inv.status !== 'draft' && inv.status !== 'void').map((inv) => ({ value: inv.id, label: `${inv.invoiceNumber} · ${formatCurrency(inv.total)}` }));
    }
    const page = await billsApi.list({ vendor_id: contactId, page_size: 100 });
    return page.items.filter((bill) => bill.status !== 'draft' && bill.status !== 'void').map((bill) => ({ value: bill.id, label: `${bill.billNumber} · ${formatCurrency(bill.total)}` }));
  }, [contactId, cfg.isCredit, cfg.party]);

  const contactList = useMemo<Contact[]>(() => contacts.data?.items ?? [], [contacts.data]);
  const itemList = useMemo<Item[]>(() => items.data?.items ?? [], [items.data]);
  const loaded = existing.data;

  const fill = (doc: Pick<FlowDocument, 'contactId' | 'reference' | 'subject' | 'notes' | 'discountAmount' | 'lines'> & Partial<FlowDocument>) => {
    setContactId(doc.contactId);
    setReference(doc.reference ?? '');
    setSubject(doc.subject ?? '');
    setNotes(doc.notes ?? '');
    setDiscountAmount(String(doc.discountAmount ?? 0));
    setLines(linesFrom(doc.lines, defaultTax !== undefined ? String(defaultTax) : '0'));
  };

  useEffect(() => {
    if (!loaded) return;
    fill(loaded);
    setDate(loaded.date);
    setSecondDate((cfg.secondDate && loaded[cfg.secondDate]) || '');
    setSalesperson(loaded.salesperson ?? '');
    setReason(loaded.reason ?? '');
    setTerms(loaded.terms ?? '');
    setLinkedId(loaded.invoiceId ?? loaded.billId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // "Create credit note" from an invoice (or vendor credit from a bill) prefills its lines.
  const fromInvoice = params.get('invoiceId');
  const fromBill = params.get('billId');
  useEffect(() => {
    if (isEdit) return;
    if (fromInvoice) {
      void invoicesApi.get(fromInvoice).then((inv) => {
        fill({ contactId: inv.customerId, reference: inv.invoiceNumber, subject: inv.subject, notes: null, discountAmount: inv.discountAmount, lines: inv.lines });
        setLinkedId(inv.id);
      });
    } else if (fromBill) {
      void billsApi.get(fromBill).then((bill) => {
        fill({ contactId: bill.vendorId, reference: bill.vendorBillNumber || bill.billNumber, subject: bill.subject, notes: null, discountAmount: bill.discountAmount, lines: bill.lines });
        setLinkedId(bill.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromInvoice, fromBill, isEdit]);

  const totals = lineTotals(lines, discountAmount);
  // An expired quote is edited by what was saved: an expired draft as a draft, an expired sent quote stays sent.
  const savedStatus = loaded?.storedStatus ?? loaded?.status;
  const keepStatus = loaded && savedStatus !== 'draft';

  const submit = async (status: string) => {
    if (!contactId) {
      setError(t(`docflow.form.select.${cfg.party}`));
      return;
    }
    const problem = linesError(lines);
    if (problem) {
      setError(t(problem));
      return;
    }
    if (totals.discount > totals.subtotal) {
      setError(t('docflow.form.discountTooHigh'));
      return;
    }
    const payload: Record<string, unknown> = {
      [`${cfg.party}Id`]: contactId,
      date,
      reference: reference.trim() || null,
      subject: subject.trim() || null,
      discountAmount: totals.discount,
      notes: notes.trim() || null,
      terms: cfg.hasTerms ? terms.trim() || null : null,
      status,
      lines: linesPayload(lines),
    };
    if (cfg.secondDate) payload[cfg.secondDate] = secondDate || null;
    if (cfg.hasSalesperson) payload.salesperson = salesperson.trim() || null;
    if (cfg.hasReason) payload.reason = reason.trim() || null;
    if (cfg.isCredit) {
      payload[cfg.party === 'customer' ? 'invoiceId' : 'billId'] = linkedId || null;
    }
    const saved = await run<FlowDocument>(() => (docId ? api.update(docId, payload) : api.create(payload)));
    if (saved) {
      toast.success(t(isEdit ? 'docflow.form.updated' : 'docflow.form.created', { doc: t(k('singular')), number: saved.number }));
      navigate(`${cfg.route}/${saved.id}`);
    }
  };

  if (!canWrite) {
    return (
      <>
        <PageHeader title={t(k('new'))} />
        <ErrorBlock message={t('docflow.form.readOnly')} />
      </>
    );
  }
  if (isEdit && existing.loading) return <LoadingBlock label={t('common.loading')} />;
  if (isEdit && existing.error) {
    return (
      <>
        <PageHeader title={t(k('singular'))} />
        <ErrorBlock message={existing.error} onRetry={existing.reload} />
      </>
    );
  }
  if (loaded && !cfg.editable.includes(loaded.status)) {
    return (
      <>
        <PageHeader
          title={`${t(k('singular'))} ${loaded.number}`}
          actions={<Button onClick={() => navigate(`${cfg.route}/${loaded.id}`)}>{t('docflow.form.back')}</Button>}
        />
        <ErrorBlock message={t('docflow.form.notEditable', { status: loaded.status })} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit && loaded ? t('docflow.form.editTitle', { doc: t(k('singular')), number: loaded.number }) : t(k('new'))}
        subtitle={t(k('subtitle'))}
        breadcrumb={[t(`sidebar.${cfg.group}`), t(k('title'))]}
        actions={<Button onClick={() => navigate(isEdit && loaded ? `${cfg.route}/${loaded.id}` : cfg.route)}>{t('common.cancel')}</Button>}
      />
      {contacts.error ? <ErrorBlock message={contacts.error} onRetry={contacts.reload} /> : null}

      <div className="stack">
        <Card title={t('docflow.form.details')}>
          <FormError message={error} />
          <div className="form-grid">
            <SelectField
              label={t(`docflow.form.${cfg.party}`)}
              required
              value={contactId}
              placeholder={contacts.loading ? t('common.loading') : t(`docflow.form.select.${cfg.party}`)}
              disabled={contacts.loading}
              error={fieldErrors[`${cfg.party}Id`]}
              options={contactList.map((c) => ({ value: c.id, label: c.displayName }))}
              onChange={(event) => {
                setContactId(event.target.value);
                setLinkedId('');
              }}
            />
            <TextField label={t('docflow.form.date')} type="date" required value={date} error={fieldErrors.date} onChange={(e) => setDate(e.target.value)} />
            {cfg.secondDate ? (
              <TextField
                label={t(`docflow.form.${cfg.secondDate}`)}
                type="date"
                value={secondDate}
                min={date}
                error={fieldErrors[cfg.secondDate]}
                onChange={(e) => setSecondDate(e.target.value)}
              />
            ) : null}
            {cfg.isCredit ? (
              <SelectField
                label={t(cfg.party === 'customer' ? 'docflow.form.againstInvoice' : 'docflow.form.againstBill')}
                value={linkedId}
                placeholder={t('docflow.form.none')}
                disabled={!contactId}
                options={linkable.data ?? []}
                onChange={(e) => setLinkedId(e.target.value)}
              />
            ) : null}
            <TextField label={t('docflow.form.reference')} value={reference} error={fieldErrors.reference} onChange={(e) => setReference(e.target.value)} />
            {cfg.hasSalesperson ? (
              <TextField label={t('docflow.form.salesperson')} value={salesperson} onChange={(e) => setSalesperson(e.target.value)} />
            ) : null}
            {cfg.hasReason ? (
              <TextField label={t('docflow.form.reason')} value={reason} maxLength={120} placeholder={t(kind === 'delivery_challan' ? 'deliveryChallans.reasonPlaceholder' : 'docflow.form.reasonPlaceholder')} onChange={(e) => setReason(e.target.value)} />
            ) : null}
            <TextField label={t('docflow.form.subject')} value={subject} maxLength={250} onChange={(e) => setSubject(e.target.value)} />
          </div>
        </Card>

        <Card title={t('docflow.form.lines')}>
          <LineItemsEditor lines={lines} onChange={setLines} items={itemList} itemsLoading={items.loading} party={cfg.party} defaultTaxRate={defaultTax} />
          {fieldErrors.lines ? <FormError message={fieldErrors.lines} /> : null}
        </Card>

        <div className="grid-2">
          <Card title={t('docflow.form.notesSection')}>
            <TextAreaField label={t('docflow.form.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            {cfg.hasTerms ? <TextAreaField label={t('docflow.form.terms')} value={terms} onChange={(e) => setTerms(e.target.value)} /> : null}
          </Card>
          <Card title={t('docflow.form.totals')}>
            <TextField
              label={t('docflow.form.discount')}
              type="number"
              min="0"
              step="0.01"
              prefix="₹"
              value={discountAmount}
              error={fieldErrors.discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
            />
            <div className="form-section">
              <div className="totals-list">
                <div>
                  <span>{t('docflow.totals.subtotal')}</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div>
                  <span>{t('docflow.totals.discount')}</span>
                  <span>{totals.discount > 0 ? `- ${formatCurrency(totals.discount)}` : formatCurrency(0)}</span>
                </div>
                <div>
                  <span>{t('docflow.totals.tax')}</span>
                  <span>{formatCurrency(totals.taxTotal)}</span>
                </div>
                <div className="grand">
                  <span>{t('docflow.totals.total')}</span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="row-between">
          <span className="text-subtle small">{cfg.isCredit ? t('docflow.form.creditHint') : t('docflow.form.noPostingHint')}</span>
          <div className="row">
            {keepStatus ? (
              <Button variant="primary" loading={submitting} onClick={() => submit(cfg.issueStatus)}>
                {t('docflow.form.saveChanges')}
              </Button>
            ) : (
              <>
                <Button variant="secondary" disabled={submitting} onClick={() => submit('draft')}>
                  {t('docflow.form.saveDraft')}
                </Button>
                <Button variant="primary" loading={submitting} onClick={() => submit(cfg.issueStatus)}>
                  {t(k('saveIssued'))}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
