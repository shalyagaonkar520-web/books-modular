/** Close the books up to a date: nothing on or before it can be posted, edited or deleted. */
import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';

import { lockDateApi } from '@/api/docFlow';
import { useAppContent } from '@/app/AppContentContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormError } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';
import { addDaysIso, formatDate, todayIso } from '@/utils/format';

export function LockDateSettings() {
  const { t } = useAppContent();
  const toast = useToast();
  const { isAdmin, refreshOrganization } = useAuth();
  const current = useAsync(() => lockDateApi.get(), []);
  const [value, setValue] = useState('');
  const { submitting, error, run } = useSubmit();
  const locked = current.data?.lockDate ?? null;

  useEffect(() => setValue(locked ?? ''), [locked]);

  const save = async (next: string | null) => {
    const saved = await run(() => lockDateApi.set(next));
    if (saved) {
      toast.success(saved.lockDate ? t('settings.lock.saved', { date: formatDate(saved.lockDate) }) : t('settings.lock.removed'));
      current.setData(saved);
      void refreshOrganization();
    }
  };

  return (
    <Card title={t('settings.lock.title')} subtitle={t('settings.lock.subtitle')}>
      <FormError message={error} />
      <p className="small">
        {locked ? (
          <>
            <Lock size={14} aria-hidden="true" /> {t('settings.lock.lockedUntil', { date: formatDate(locked) })}
          </>
        ) : (
          <>
            <LockOpen size={14} aria-hidden="true" /> {t('settings.lock.open')}
          </>
        )}
      </p>
      {isAdmin ? (
        <div className="row wrap">
          <TextField label={t('settings.lock.date')} type="date" value={value} max={addDaysIso(todayIso(), -1)} hint={t('settings.lock.hint')} onChange={(e) => setValue(e.target.value)} />
          <Button variant="primary" loading={submitting} disabled={!value || value === locked} onClick={() => save(value)}>
            {t('settings.lock.save')}
          </Button>
          {locked ? (
            <Button disabled={submitting} onClick={() => save(null)}>
              {t('settings.lock.remove')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
