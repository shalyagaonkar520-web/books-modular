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
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { GST_TREATMENTS } from '@/utils/status';

const GST_OPTIONS = GST_TREATMENTS.map((treatment) => ({ value: treatment.value, label: treatment.label }));
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

function initialForm(contact: Contact | null, type: ContactType): FormState {
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
    paymentTermsDays: String(contact?.paymentTermsDays ?? 30),
    billingAddress: contact?.billingAddress ?? '',
    shippingAddress: contact?.shippingAddress ?? '',
    notes: contact?.notes ?? '',
  };
}

export function ContactFormPage({ type }: { type: ContactType }) {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(contactId);
  const singular = type === 'customer' ? 'customer' : 'vendor';
  const listPath = type === 'customer' ? '/customers' : '/vendors';

  const existing = useAsync(() => (contactId ? contactsApi.get(contactId) : Promise.resolve(null)), [contactId]);

  if (isEdit && existing.loading) return <LoadingBlock label={`Loading ${singular}…`} />;
  if (isEdit && existing.error) return <ErrorBlock message={existing.error} onRetry={existing.reload} />;

  return (
    <ContactForm
      key={existing.data?.id ?? 'new'}
      type={type}
      singular={singular}
      contact={existing.data ?? null}
      onDone={() => navigate(listPath)}
    />
  );
}

interface ContactFormProps {
  type: ContactType;
  singular: string;
  contact: Contact | null;
  onDone: () => void;
}

function ContactForm({ type, singular, contact, onDone }: ContactFormProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => initialForm(contact, type));
  const { submitting, error, fieldErrors, run } = useSubmit();
  // Receivables for a customer, payables for a vendor - the only accounts it
  // makes sense to point a contact at.
  const ledgerAccounts = useAsync(
    () => accountingApi.accounts({ type: type === 'customer' ? 'asset' : 'liability' }),
    [type],
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
      toast.error('Customer email is required for invoices and payment notifications');
      return;
    }
    // Names are people, not codes. Company name is deliberately exempt so
    // businesses like "3M" can still be recorded.
    if (/\d/.test(form.displayName)) {
      toast.error('Display name cannot contain numbers');
      return;
    }
    if (/\d/.test(form.contactPerson)) {
      toast.error('Contact person name cannot contain numbers');
      return;
    }
    for (const [value, label] of [
      [form.firstName, 'First name'],
      [form.lastName, 'Last name'],
    ] as const) {
      if (/\d/.test(value)) {
        toast.error(`${label} cannot contain numbers`);
        return;
      }
    }
    if (form.phone.trim() && form.phone.trim().length !== 10) {
      setPhoneError('Phone number must be exactly 10 digits');
      return;
    }
    if (type === 'vendor' && form.bankAccountNumber.trim() !== form.bankAccountNumberConfirm.trim()) {
      toast.error('Account numbers do not match');
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
      toast.success(contact ? `${result.displayName} updated` : `${result.displayName} added`);
      onDone();
    }
  }

  return (
    <>
      <PageHeader
        title={contact ? `Edit ${contact.displayName}` : `New ${singular}`}
        subtitle={`Details used on ${type === 'customer' ? 'invoices' : 'bills'} and statements`}
        actions={
          <Button variant="secondary" onClick={onDone} disabled={submitting}>
            Cancel
          </Button>
        }
      />

      <div className="form-page">
      <FormError message={error} />

      <section className="form-page-section">
          <h3 className="form-section-title">Identity</h3>
        <div className="form-grid">
          <SelectField
            label={`${type === 'customer' ? 'Customer' : 'Vendor'} type`}
            value={form.contactType}
            options={[
              { value: 'business', label: 'Business' },
              { value: 'individual', label: 'Individual' },
            ]}
            error={fieldErrors.contactType}
            hint="A business is billed under its company name"
            onChange={(event) => set('contactType', event.target.value as ContactKind)}
          />
          <TextField label="Display name" required value={form.displayName} error={fieldErrors.displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <TextField
            label="Company name"
            value={form.companyName}
            error={fieldErrors.companyName}
            hint="Letters and numbers, e.g. 3M India"
            onChange={(event) => set('companyName', event.target.value)}
          />
          <TextField label="Email" type="email" required={type === 'customer'} value={form.email} error={fieldErrors.email} onChange={(event) => set('email', event.target.value)} />
        </div>
      </section>

      <section className="form-page-section">
          <h3 className="form-section-title">Primary contact</h3>
        <div className="form-grid-3">
          <SelectField
            label="Salutation"
            value={form.salutation}
            placeholder="—"
            options={SALUTATIONS.map((title) => ({ value: title, label: title }))}
            error={fieldErrors.salutation}
            onChange={(event) => set('salutation', event.target.value)}
          />
          <TextField label="First name" value={form.firstName} error={fieldErrors.firstName} onChange={(event) => set('firstName', event.target.value)} />
          <TextField label="Last name" value={form.lastName} error={fieldErrors.lastName} onChange={(event) => set('lastName', event.target.value)} />
        </div>
        <div className="form-grid">
          <TextField
            label="Work phone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.phone}
            error={phoneError ?? fieldErrors.phone}
            hint="10 digits"
            onChange={(event) => setPhone(event.target.value)}
          />
          <TextField
            label="Mobile"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={form.mobile}
            error={fieldErrors.mobile}
            hint="10 digits"
            onChange={(event) => set('mobile', event.target.value.replace(/\D/g, '').slice(0, 10))}
          />
        </div>
      </section>

      {/* Money goes out to vendors, so only they need bank details. */}
      {type === 'vendor' ? (
        <section className="form-page-section">
          <h3 className="form-section-title">Bank details</h3>
          <p className="form-section-note">Where this vendor gets paid — saved so a payment run does not need it re-keyed.</p>
          <div className="form-grid">
            <TextField
              label="Account holder name"
              value={form.bankAccountHolder}
              error={fieldErrors.bankAccountHolder}
              onChange={(event) => set('bankAccountHolder', event.target.value)}
            />
            <TextField label="Bank name" value={form.bankName} error={fieldErrors.bankName} onChange={(event) => set('bankName', event.target.value)} />
            <TextField
              label="Account number"
              inputMode="numeric"
              maxLength={18}
              value={form.bankAccountNumber}
              error={fieldErrors.bankAccountNumber}
              hint="9 to 18 digits"
              onChange={(event) => set('bankAccountNumber', event.target.value)}
            />
            <TextField
              label="Re-enter account number"
              inputMode="numeric"
              maxLength={18}
              value={form.bankAccountNumberConfirm}
              error={accountNumberMismatch ? 'Account numbers do not match' : undefined}
              hint="Typed twice so a wrong digit cannot send a payment astray"
              onChange={(event) => set('bankAccountNumberConfirm', event.target.value)}
            />
            <TextField
              label="IFSC"
              maxLength={11}
              value={form.bankIfsc}
              error={fieldErrors.bankIfsc}
              hint="11 characters, e.g. HDFC0001234"
              onChange={(event) => set('bankIfsc', event.target.value.toUpperCase())}
            />
          </div>
        </section>
      ) : null}

      <section className="form-page-section">
          <h3 className="form-section-title">Tax and terms</h3>
        <div className="form-grid">
          <TextField
            label="GSTIN"
            value={form.gstin}
            error={fieldErrors.gstin}
            maxLength={15}
            hint="15 characters, e.g. 29AABCR1234F1Z5"
            onChange={(event) => set('gstin', event.target.value.toUpperCase())}
          />
          <TextField
            label="PAN"
            value={form.pan}
            error={fieldErrors.pan}
            maxLength={10}
            hint="10 characters, e.g. AABCR1234F"
            onChange={(event) => set('pan', event.target.value.toUpperCase())}
          />
          <SelectField
            label="GST treatment"
            value={form.gstTreatment}
            options={GST_OPTIONS}
            error={fieldErrors.gstTreatment}
            onChange={(event) => set('gstTreatment', event.target.value as GstTreatment)}
          />
          <TextField
            label="Payment terms (days)"
            type="number"
            min="0"
            max="365"
            value={form.paymentTermsDays}
            error={fieldErrors.paymentTermsDays}
            onChange={(event) => set('paymentTermsDays', event.target.value)}
          />
          <SelectField
            label={type === 'customer' ? 'Accounts receivable' : 'Accounts payable'}
            value={form.ledgerAccountId}
            placeholder="Default account"
            options={(ledgerAccounts.data ?? []).map((account) => ({ value: account.id, label: `${account.code} · ${account.name}` }))}
            error={fieldErrors.ledgerAccountId}
            hint={`Leave as default unless this ${singular} posts to its own account`}
            onChange={(event) => set('ledgerAccountId', event.target.value)}
          />
          <SelectField
            label="Language"
            value={form.language}
            placeholder="English"
            options={LANGUAGES.map((language) => ({ value: language, label: language }))}
            error={fieldErrors.language}
            onChange={(event) => set('language', event.target.value)}
          />
        </div>
      </section>

      <section className="form-page-section">
          <h3 className="form-section-title">Addresses</h3>
        <div className="form-grid">
          <TextAreaField label="Billing address" value={form.billingAddress} error={fieldErrors.billingAddress} onChange={(event) => set('billingAddress', event.target.value)} />
          <TextAreaField label="Shipping address" value={form.shippingAddress} error={fieldErrors.shippingAddress} onChange={(event) => set('shippingAddress', event.target.value)} />
        </div>
        <TextAreaField label="Notes" rows={2} value={form.notes} error={fieldErrors.notes} onChange={(event) => set('notes', event.target.value)} />
      </section>
      </div>

      <div className="form-actions-bar">
        <div className="row-between">
          <span className="text-subtle small">{contact ? 'Editing an existing record' : `A new ${singular} will be created`}</span>
          <div className="row">
            <Button variant="secondary" onClick={onDone} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" loading={submitting} onClick={save}>
              {contact ? 'Save changes' : `Create ${singular}`}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
