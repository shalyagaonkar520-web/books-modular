/** Reminder drafts (AI or template) and WhatsApp sending for one invoice. */
import { useState } from 'react';
import { MessageCircle, Sparkles } from 'lucide-react';

import { contactsApi } from '@/api/endpoints';
import { remindersApi, whatsappApi } from '@/api/insights';
import type { Invoice } from '@/api/types';
import { useAppContent } from '@/app/AppContentContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormError, LoadingBlock } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

type Tone = 'friendly' | 'firm' | 'final';

export function ReminderDraftButton({ invoice }: { invoice: Invoice }) {
  const { t } = useAppContent();
  const [open, setOpen] = useState(false);
  if (!['sent', 'partially_paid', 'overdue'].includes(invoice.status)) return null;
  return (
    <>
      <Button variant="secondary" icon={<Sparkles size={15} />} onClick={() => setOpen(true)}>
        {t('outreach.reminder.button')}
      </Button>
      {open ? <ReminderModal invoice={invoice} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ReminderModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const [tone, setTone] = useState<Tone>(invoice.status === 'overdue' ? 'firm' : 'friendly');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [to, setTo] = useState('');
  const draft = useAsync(async () => {
    const d = await remindersApi.draft(invoice.id, tone);
    setSubject(d.subject);
    setBody(d.body);
    setTo((current) => current || d.toEmail || '');
    return d;
  }, [invoice.id, tone]);
  const { submitting, error, run } = useSubmit();

  const send = async () => {
    const res = await run(() => contactsApi.sendGmail(invoice.customerId, { to_email: to.trim(), subject, message: body }));
    if (res) {
      toast.success(t('outreach.reminder.sent', { email: to }));
      onClose();
    }
  };

  return (
    <Modal
      open
      size="lg"
      title={t('outreach.reminder.title', { number: invoice.invoiceNumber })}
      subtitle={t('outreach.reminder.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={submitting} disabled={!subject.trim() || !body.trim() || !to.trim()} onClick={send}>
            {t('outreach.reminder.send')}
          </Button>
        </>
      }
    >
      <FormError message={error ?? draft.error} />
      <div className="form-grid">
        <SelectField
          label={t('outreach.reminder.tone')}
          value={tone}
          options={(['friendly', 'firm', 'final'] as Tone[]).map((id) => ({ value: id, label: t(`outreach.tone.${id}`) }))}
          onChange={(e) => setTone(e.target.value as Tone)}
        />
        <TextField label={t('outreach.reminder.to')} type="email" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {draft.loading ? (
        <LoadingBlock label={t('outreach.reminder.writing')} />
      ) : (
        <>
          {draft.data ? (
            <Badge tone={draft.data.source === 'ai' ? 'info' : 'neutral'}>{draft.data.source === 'ai' ? t('outreach.reminder.byAi') : t('outreach.reminder.byTemplate')}</Badge>
          ) : null}
          <TextField label={t('outreach.reminder.subject')} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
          <TextAreaField label={t('outreach.reminder.body')} rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
        </>
      )}
    </Modal>
  );
}

export function WhatsAppButton({ invoice, mobile }: { invoice: Invoice; mobile?: string | null }) {
  const { t } = useAppContent();
  const [open, setOpen] = useState(false);
  if (invoice.status === 'draft' || invoice.status === 'void') return null;
  return (
    <>
      <Button variant="secondary" icon={<MessageCircle size={15} style={{ color: '#16a34a' }} />} onClick={() => setOpen(true)}>
        {t('outreach.whatsapp.button')}
      </Button>
      {open ? <WhatsAppModal invoice={invoice} mobile={mobile} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function WhatsAppModal({ invoice, mobile, onClose }: { invoice: Invoice; mobile?: string | null; onClose: () => void }) {
  const { t } = useAppContent();
  const toast = useToast();
  const status = useAsync(() => whatsappApi.status(), []);
  const [phone, setPhone] = useState(mobile ?? '');
  const [kind, setKind] = useState<'invoice' | 'reminder'>(invoice.status === 'overdue' ? 'reminder' : 'invoice');
  const [message, setMessage] = useState('');
  const { submitting, error, run } = useSubmit();

  const send = async () => {
    const res = await run(() => whatsappApi.sendInvoice(invoice.id, { toPhone: phone.trim() || null, kind, message: message.trim() || null }));
    if (res) {
      toast.success(t('outreach.whatsapp.sent', { to: `+${res.to}` }));
      onClose();
    }
  };

  return (
    <Modal
      open
      title={t('outreach.whatsapp.title', { number: invoice.invoiceNumber })}
      subtitle={t('outreach.whatsapp.subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={submitting} disabled={!status.data?.configured} onClick={send}>
            {t('outreach.whatsapp.send')}
          </Button>
        </>
      }
    >
      {status.data && !status.data.configured ? <div className="alert alert-warning">{t('outreach.whatsapp.notConfigured')}</div> : null}
      <FormError message={error} />
      <div className="form-grid">
        <TextField label={t('outreach.whatsapp.phone')} type="tel" value={phone} hint={t('outreach.whatsapp.phoneHint')} onChange={(e) => setPhone(e.target.value)} />
        <SelectField
          label={t('outreach.whatsapp.kind')}
          value={kind}
          options={[
            { value: 'invoice', label: t('outreach.whatsapp.kindInvoice') },
            { value: 'reminder', label: t('outreach.whatsapp.kindReminder') },
          ]}
          onChange={(e) => setKind(e.target.value as 'invoice' | 'reminder')}
        />
      </div>
      <TextAreaField label={t('outreach.whatsapp.message')} rows={4} value={message} hint={t('outreach.whatsapp.messageHint')} onChange={(e) => setMessage(e.target.value)} />
    </Modal>
  );
}
