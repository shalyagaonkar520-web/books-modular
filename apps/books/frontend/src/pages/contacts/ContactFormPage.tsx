/** Create or edit a customer or vendor on its own page.

The contact form outgrew a modal once it carried the primary contact, two
phone numbers, bank details and an account override - a dialog that scrolls
is harder to work through than a page, and a page can be linked to and
reloaded.
*/
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { accountingApi, contactsApi } from '@/api/endpoints';
import type { Contact, ContactKind, ContactType, GstTreatment } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { useAppContent } from '@/app/AppContentContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { GST_TREATMENTS } from '@/utils/status';

const SALUTATIONS = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'];
const LANGUAGES = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Malayalam', 'Marathi', 'Gujarati', 'Bengali'];

function formatVendorMaskedName(name: string | null | undefined, isVendor: boolean): string {
  if (!name) return '';
  if (!isVendor || name.length <= 10) return name;
  return name.slice(0, 10) + '*'.repeat(name.length - 10);
}

interface FormState {
  contactType: ContactKind;
  displayName: string;
  companyName: string;
  salutation: string;
  firstName: string;
  lastName: string;
  contactPerson: string;
  email: string;
  phone: string;
  mobile: string;
  gstin: string;
  pan: string;
  bankAccountHolder: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountNumberConfirm: string;
  bankIfsc: string;
  gstTreatment: GstTreatment;
  language: string;
  ledgerAccountId: string;
  paymentTermsDays: string;
  billingAddress: string;
  shippingAddress: string;
  notes: string;
}

/** Payment terms a brand-new contact starts with when the organization sets no default. */
const FALLBACK_PAYMENT_TERMS_DAYS = 30;

function initialForm(contact: Contact | null, type: ContactType, defaultPaymentTermsDays?: number): FormState {
  const displayName = contact?.displayName ?? '';
  const contactPerson = contact?.contactPerson ?? '';
  return {
    contactType: contact?.contactType ?? 'business',
    displayName: formatVendorMaskedName(displayName, type === 'vendor'),
    companyName: contact?.companyName ?? '',
    salutation: contact?.salutation ?? '',
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    contactPerson: formatVendorMaskedName(contactPerson, type === 'vendor'),
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    mobile: contact?.mobile ?? '',
    gstin: contact?.gstin ?? '',
    pan: contact?.pan ?? '',
    bankAccountHolder: contact?.bankAccountHolder ?? '',
    bankName: contact?.bankName ?? '',
    bankAccountNumber: contact?.bankAccountNumber ?? '',
    bankAccountNumberConfirm: contact?.bankAccountNumber ?? '',
    bankIfsc: contact?.bankIfsc ?? '',
    language: contact?.language ?? '',
    ledgerAccountId: contact?.ledgerAccountId ?? '',
    gstTreatment: contact?.gstTreatment ?? 'unregistered',
    paymentTermsDays: String(contact ? contact.paymentTermsDays : (defaultPaymentTermsDays ?? FALLBACK_PAYMENT_TERMS_DAYS)),
    billingAddress: contact?.billingAddress ?? '',
    shippingAddress: contact?.shippingAddress ?? '',
    notes: contact?.notes ?? '',
  };
}

export function ContactFormPage({ type }: { type: ContactType }) {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { t } = useAppContent();
  const isEdit = Boolean(contactId);
  const listPath = type === 'customer' ? '/customers' : '/vendors';

  const existing = useAsync(() => (contactId ? contactsApi.get(contactId) : Promise.resolve(null)), [contactId]);

  if (isEdit && existing.loading) return <LoadingBlock label={t(type === 'customer' ? 'customers.form.loading' : 'vendors.form.loading')} />;
  if (isEdit && existing.error) return <ErrorBlock message={existing.error} onRetry={existing.reload} />;

  return (
    <ContactForm
      key={existing.data?.id ?? 'new'}
      type={type}
      contact={existing.data ?? null}
      onDone={() => navigate(listPath)}
    />
  );
}

interface ContactFormProps {
  type: ContactType;
  contact: Contact | null;
  onDone: () => void;
}

function ContactForm({ type, contact, onDone }: ContactFormProps) {
  const { t } = useAppContent();
  const isCustomer = type === 'customer';
  const toast = useToast();
  // Reading the chart of accounts is Admin/Viewer only, but Staff may create
  // contacts - so only ask for the accounts when the signed-in role is allowed
  // them, otherwise the form 403s on open for a role that is entitled to use it.
  const { can, organization } = useAuth();
  const canChooseAccount = can('admin', 'viewer');
  const [form, setForm] = useState<FormState>(() => initialForm(contact, type, organization?.defaultPaymentTermsDays));
  const { submitting, error, fieldErrors, run } = useSubmit();
  // Receivables for a customer, payables for a vendor - the only accounts it
  // makes sense to point a contact at.
  const ledgerAccounts = useAsync(
    () => (canChooseAccount ? accountingApi.accounts({ type: type === 'customer' ? 'asset' : 'liability' }) : Promise.resolve([])),
    [type, canChooseAccount],
  );
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  // Only a mismatch between two non-empty entries is worth flagging; an
  // untouched pair is simply a vendor whose bank details are not on file yet.
  const accountNumberMismatch =
    form.bankAccountNumber.trim() !== '' &&
    form.bankAccountNumberConfirm.trim() !== '' &&
    form.bankAccountNumber.trim() !== form.bankAccountNumberConfirm.trim();

  function setDisplayName(value: string) {
    set('displayName', formatVendorMaskedName(value, type === 'vendor'));
  }

  function setPhone(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    set('phone', digits);
    setPhoneError(undefined);
  }

  async function save() {
    if (type === 'customer' && !form.email.trim()) {
      toast.error(t('customers.form.emailRequired'));
      return;
    }
    // Names are people, not codes. Company name is deliberately exempt so
    // businesses like "3M" can still be recorded.
    if (/\d/.test(form.displayName)) {
      toast.error(t('customers.form.displayNameDigits'));
      return;
    }
    if (/\d/.test(form.contactPerson)) {
      toast.error(t('customers.form.contactPersonDigits'));
      return;
    }
    for (const [value, message] of [
      [form.firstName, t('customers.form.firstNameDigits')],
      [form.lastName, t('customers.form.lastNameDigits')],
    ] as const) {
      if (/\d/.test(value)) {
        toast.error(message);
        return;
      }
    }
    if (form.phone.trim() && form.phone.trim().length !== 10) {
      setPhoneError(t('customers.form.phoneLength'));
      return;
    }
    if (type === 'vendor' && form.bankAccountNumber.trim() !== form.bankAccountNumberConfirm.trim()) {
      toast.error(t('vendors.form.accountMismatch'));
      return;
    }
    const displayName = formatVendorMaskedName(form.displayName.trim(), type === 'vendor');
    const contactPerson = form.contactPerson.trim() ? formatVendorMaskedName(form.contactPerson.trim(), type === 'vendor') : null;
    const payload: Partial<Contact> = {
      type,
      contactType: form.contactType,
      displayName,
      companyName: form.companyName.trim() || null,
      salutation: form.salutation.trim() || null,
      firstName: form.firstName.trim() || null,
      lastName: form.lastName.trim() || null,
      contactPerson,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      mobile: form.mobile.trim() || null,
      gstin: form.gstin.trim() || null,
      pan: form.pan.trim() || null,
      bankAccountHolder: form.bankAccountHolder.trim() || null,
      bankName: form.bankName.trim() || null,
      bankAccountNumber: form.bankAccountNumber.trim() || null,
      bankIfsc: form.bankIfsc.trim() || null,
      language: form.language.trim() || null,
      ledgerAccountId: form.ledgerAccountId || null,
      gstTreatment: form.gstTreatment,
      paymentTermsDays: Number.parseInt(form.paymentTermsDays, 10) || 0,
      billingAddress: form.billingAddress.trim() || null,
      shippingAddress: form.shippingAddress.trim() || null,
      notes: form.notes.trim() || null,
    };
    const result = await run(() => (contact ? contactsApi.update(contact.id, payload) : contactsApi.create(payload)));
    if (result) {
      toast.success(contact ? t('customers.form.updated', { name: result.displayName }) : t('customers.form.added', { name: result.displayName }));
      onDone();
    }
  }

  return (
    <>
      <PageHeader
        title={contact ? t('customers.form.editTitle', { name: contact.displayName }) : t(type === 'customer' ? 'customers.form.newTitle' : 'vendors.form.newTitle')}
        subtitle={t(isCustomer ? 'customers.form.subtitle' : 'vendors.form.subtitle')}
        actions={
          <Button variant="secondary" onClick={onDone} disabled={submitting}>
            {t('customers.form.cancel')}
          </Button>
        }
      />

      <div className="form-page">
      <FormError message={error} />

      <section className="form-page-section">
          <h3 className="form-section-title">{t('customers.form.section.identity')}</h3>
        <div className="form-grid">
          <SelectField
            label={t(isCustomer ? 'customers.form.contactType' : 'vendors.form.contactType')}
            value={form.contactType}
            options={[
              { value: 'business', label: t('customers.form.business') },
              { value: 'individual', label: t('customers.form.individual') },
            ]}
            error={fieldErrors.contactType}
            hint={t('customers.form.contactTypeHint')}
            onChange={(event) => set('contactType', event.target.value as ContactKind)}
          />
          <TextField label={t('customers.form.displayName')} required value={form.displayName} error={fieldErrors.displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <TextField
            label={t('customers.form.companyName')}
            value={form.companyName}
            error={fieldErrors.companyName}
            hint={t('customers.form.companyNameHint')}
            onChange={(event) => set('companyName', event.target.value)}
          />
          <TextField label={t('customers.form.email')} type="email" required={type === 'customer'} value={form.email} error={fieldErrors.email} onChange={(event) => set('email', event.target.value)} />
        </div>
      </section>

      <section className="form-page-section">
          <h3 className="form-section-title">{t('customers.form.section.primaryContact')}</h3>
        <div className="form-grid-3">
          <SelectField
            label={t('customers.form.salutation')}
            value={form.salutation}
            placeholder="—"
            options={SALUTATIONS.map((title) => ({ value: title, label: title }))}
            error={fieldErrors.salutation}
            onChange={(event) => set('salutation', event.target.value)}
          />
          <TextField label={t('customers.form.firstName')} value={form.firstName} error={fieldErrors.firstName} onChange={(event) => set('firstName', event.target.value)} />
          <TextField label={t('customers.form.lastName')} value={form.lastName} error={fieldErrors.lastName} onChange={(event) => set('lastName', event.target.value)} />
        </div>
        <div className="form-grid">
          <TextField
            label={t('customers.form.workPhone')}
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.phone}
            error={phoneError ?? fieldErrors.phone}
            hint={t('customers.form.phoneHint')}
            onChange={(event) => setPhone(event.target.value)}
          />
          <TextField
            label={t('customers.form.mobile')}
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.mobile}
            error={fieldErrors.mobile}
            hint={t('customers.form.phoneHint')}
            onChange={(event) => set('mobile', event.target.value.replace(/\D/g, '').slice(0, 10))}
          />
        </div>
      </section>

      {/* Money goes out to vendors, so only they need bank details. */}
      {type === 'vendor' ? (
        <section className="form-page-section">
          <h3 className="form-section-title">{t('vendors.form.section.bank')}</h3>
          <p className="form-section-note">{t('vendors.form.bankNote')}</p>
          <div className="form-grid">
            <TextField
              label={t('vendors.form.accountHolder')}
              value={form.bankAccountHolder}
              error={fieldErrors.bankAccountHolder}
              onChange={(event) => set('bankAccountHolder', event.target.value)}
            />
            <TextField label={t('vendors.form.bankName')} value={form.bankName} error={fieldErrors.bankName} onChange={(event) => set('bankName', event.target.value)} />
            <TextField
              label={t('vendors.form.accountNumber')}
              inputMode="numeric"
              maxLength={18}
              value={form.bankAccountNumber}
              error={fieldErrors.bankAccountNumber}
              hint={t('vendors.form.accountNumberHint')}
              onChange={(event) => set('bankAccountNumber', event.target.value)}
            />
            <TextField
              label={t('vendors.form.accountNumberConfirm')}
              inputMode="numeric"
              maxLength={18}
              value={form.bankAccountNumberConfirm}
              error={accountNumberMismatch ? t('vendors.form.accountMismatch') : undefined}
              hint={t('vendors.form.accountNumberConfirmHint')}
              onChange={(event) => set('bankAccountNumberConfirm', event.target.value)}
            />
            <TextField
              label={t('vendors.form.ifsc')}
              maxLength={11}
              value={form.bankIfsc}
              error={fieldErrors.bankIfsc}
              hint={t('vendors.form.ifscHint')}
              onChange={(event) => set('bankIfsc', event.target.value.toUpperCase())}
            />
          </div>
        </section>
      ) : null}

      <section className="form-page-section">
          <h3 className="form-section-title">{t('customers.form.section.taxTerms')}</h3>
        <div className="form-grid">
          <TextField
            label={t('customers.form.gstin')}
            value={form.gstin}
            error={fieldErrors.gstin}
            maxLength={15}
            hint={t('customers.form.gstinHint')}
            onChange={(event) => set('gstin', event.target.value.toUpperCase())}
          />
          <TextField
            label={t('customers.form.pan')}
            value={form.pan}
            error={fieldErrors.pan}
            maxLength={10}
            hint={t('customers.form.panHint')}
            onChange={(event) => set('pan', event.target.value.toUpperCase())}
          />
          <SelectField
            label={t('customers.form.gstTreatment')}
            value={form.gstTreatment}
            options={GST_TREATMENTS.map((treatment) => ({ value: treatment.value, label: t(treatment.labelKey) }))}
            error={fieldErrors.gstTreatment}
            onChange={(event) => set('gstTreatment', event.target.value as GstTreatment)}
          />
          <TextField
            label={t('customers.form.paymentTerms')}
            type="number"
            min="0"
            max="365"
            value={form.paymentTermsDays}
            error={fieldErrors.paymentTermsDays}
            onChange={(event) => set('paymentTermsDays', event.target.value)}
          />
          {canChooseAccount ? (
          <SelectField
            label={t(isCustomer ? 'customers.form.ledgerAccount' : 'vendors.form.ledgerAccount')}
            value={form.ledgerAccountId}
            placeholder={t('customers.form.ledgerPlaceholder')}
            options={(ledgerAccounts.data ?? []).map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` }))}
            error={fieldErrors.ledgerAccountId}
            hint={t(isCustomer ? 'customers.form.ledgerHint' : 'vendors.form.ledgerHint')}
            onChange={(event) => set('ledgerAccountId', event.target.value)}
          />
          ) : null}
          <SelectField
            label={t('customers.form.language')}
            value={form.language}
            placeholder={t('customers.form.languagePlaceholder')}
            options={LANGUAGES.map((language) => ({ value: language, label: language }))}
            error={fieldErrors.language}
            onChange={(event) => set('language', event.target.value)}
          />
        </div>
      </section>

      <section className="form-page-section">
          <h3 className="form-section-title">{t('customers.form.section.addresses')}</h3>
        <div className="form-grid">
          <TextAreaField label={t('customers.form.billingAddress')} value={form.billingAddress} error={fieldErrors.billingAddress} onChange={(event) => set('billingAddress', event.target.value)} />
          <TextAreaField label={t('customers.form.shippingAddress')} value={form.shippingAddress} error={fieldErrors.shippingAddress} onChange={(event) => set('shippingAddress', event.target.value)} />
        </div>
        <TextAreaField label={t('customers.form.notes')} rows={2} value={form.notes} error={fieldErrors.notes} onChange={(event) => set('notes', event.target.value)} />
      </section>
      </div>

      <div className="form-actions-bar">
        <div className="row-between">
          <span className="text-subtle small">{contact ? t('customers.form.editingExisting') : t(isCustomer ? 'customers.form.creatingNew' : 'vendors.form.creatingNew')}</span>
          <div className="row">
            <Button variant="secondary" onClick={onDone} disabled={submitting}>
              {t('customers.form.cancel')}
            </Button>
            <Button variant="primary" loading={submitting} onClick={save}>
              {contact ? t('customers.form.saveChanges') : t(isCustomer ? 'customers.form.create' : 'vendors.form.create')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
