/**
 * Choose a plan by users (100 / 500 / 1000, or Customize: users + features),
 * monthly or yearly, then pay online with Razorpay: the plan starts as soon as
 * the payment is confirmed. Without Razorpay set up, pay by UPI / bank and send
 * the payment reference for a super admin to confirm. Used by the tenant
 * /subscription page, the lock screen and the org admin panel.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, HardDrive, Settings2, Users } from 'lucide-react';

import { formatRupees, formatStorage, quotePlan, type Cycle, type PlanApi, type PlanCatalog, type PlanKey } from '@/api/plans';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { openRazorpayCheckout } from '@/utils/razorpayCheckout';

export function PlanChooser({ planApi, onDone, currentUsers }: { planApi: PlanApi; onDone?: () => void; currentUsers?: number }) {
  const catalog = useAsync(() => planApi.catalog(), [planApi]);
  if (catalog.loading) return <LoadingBlock label="Loading plans…" />;
  if (catalog.error || !catalog.data) return <ErrorBlock message={catalog.error ?? 'Could not load the plans.'} onRetry={catalog.reload} />;
  return <Chooser catalog={catalog.data} planApi={planApi} onDone={onDone} currentUsers={currentUsers} />;
}

function Chooser({ catalog, planApi, onDone, currentUsers }: { catalog: PlanCatalog; planApi: PlanApi; onDone?: () => void; currentUsers?: number }) {
  const toast = useToast();
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [planKey, setPlanKey] = useState<PlanKey | null>(null);
  const [users, setUsers] = useState(String(Math.max(currentUsers ?? 0, 10)));
  const [features, setFeatures] = useState<Set<string>>(() => new Set(catalog.features.map((f) => f.key)));
  const [reference, setReference] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const quote = useMemo(
    () => (planKey ? quotePlan(catalog, planKey, cycle, planKey === 'custom' ? Number(users) || 0 : undefined, [...features]) : null),
    [catalog, planKey, cycle, users, features],
  );
  const tooFewUsers = quote !== null && currentUsers !== undefined && quote.maxUsers < currentUsers;
  const chosenCount = catalog.features.filter((f) => f.core || features.has(f.key)).length;
  const groups = useMemo(() => {
    const out = new Map<string, PlanCatalog['features']>();
    catalog.features.forEach((f) => out.set(f.group ?? 'Features', [...(out.get(f.group ?? 'Features') ?? []), f]));
    return [...out.entries()];
  }, [catalog.features]);

  useEffect(() => {
    setQr(null);
    if (!quote || !catalog.payment.upiId || catalog.onlinePayment) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      planApi
        .payQr(quote.planPrice)
        .then((res) => alive && setQr(res.svg))
        .catch(() => undefined);
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [quote, catalog.payment.upiId, catalog.onlinePayment, planApi]);

  const payOnline = async () => {
    if (!quote) return;
    setError(null);
    setSending(true);
    try {
      const order = await planApi.checkout({
        planKey: quote.planKey,
        billingCycle: cycle,
        users: quote.planKey === 'custom' ? quote.maxUsers : undefined,
        modules: quote.planKey === 'custom' ? quote.modules : undefined,
      });
      const paid = await openRazorpayCheckout({ ...order, name: 'Rooman Books' });
      if (!paid) return;
      await planApi.confirm(paid);
      toast.success('Payment received. Your plan is active now.');
      setPlanKey(null);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    if (!quote) return;
    setError(null);
    setSending(true);
    try {
      await planApi.request({
        planKey: quote.planKey,
        billingCycle: cycle,
        paymentReference: reference.trim(),
        users: quote.planKey === 'custom' ? quote.maxUsers : undefined,
        modules: quote.planKey === 'custom' ? quote.modules : undefined,
      });
      toast.success('Payment details sent. Your plan starts as soon as the platform administrator confirms the payment.');
      setReference('');
      setPlanKey(null);
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const price = (amount: number) => formatRupees(amount, catalog.currency);

  return (
    <div className="stack plan-chooser">
      <div className="plan-cycle" role="radiogroup" aria-label="Billing">
        {(['monthly', 'yearly'] as const).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={cycle === value} className={`segmented-option ${cycle === value ? 'is-active is-view' : ''}`} onClick={() => setCycle(value)}>
            {value === 'monthly' ? 'Monthly' : `Yearly (pay ${catalog.yearlyMonths} months, get 12)`}
          </button>
        ))}
      </div>

      <div className="plan-cards">
        {catalog.tiers.map((tier) => (
          <button key={tier.key} type="button" className={`plan-card ${planKey === tier.key ? 'is-selected' : ''}`} onClick={() => setPlanKey(tier.key)}>
            <span className="plan-card-name">{tier.label}</span>
            <span className="plan-card-users">
              <Users size={15} aria-hidden="true" /> Up to {tier.users.toLocaleString('en-IN')} users
            </span>
            {tier.storageGb ? (
              <span className="plan-card-users">
                <HardDrive size={15} aria-hidden="true" /> {formatStorage(tier.storageGb)} storage
              </span>
            ) : null}
            <span className="plan-card-price">
              {price(tier.monthly)}
              <small>/month</small>
            </span>
            <span className="plan-card-note">
              <Check size={14} aria-hidden="true" /> Every feature
            </span>
            {cycle === 'yearly' ? <span className="plan-card-note">{price(tier.monthly * catalog.yearlyMonths)} a year</span> : null}
          </button>
        ))}
        <button type="button" className={`plan-card ${planKey === 'custom' ? 'is-selected' : ''}`} onClick={() => setPlanKey('custom')}>
          <span className="plan-card-name">Customize</span>
          <span className="plan-card-users">
            <Settings2 size={15} aria-hidden="true" /> Your users, your features
          </span>
          <span className="plan-card-price">
            from {price(catalog.customMinimum)}
            <small>/month</small>
          </span>
          <span className="plan-card-note">Pay only for what you use</span>
        </button>
      </div>

      {planKey === 'custom' ? (
        <div className="plan-custom stack">
          <TextField label="How many users?" type="number" min="1" max="100000" value={users} onChange={(e) => setUsers(e.target.value)} hint="Logins your team needs. You can ask for more later." />
          <fieldset className="plan-features">
            <legend className="field-label">
              Features ({chosenCount} of {catalog.features.length})
            </legend>
            <div className="row-actions plan-features-quick">
              <button type="button" className="btn-link small" onClick={() => setFeatures(new Set(catalog.features.map((f) => f.key)))}>
                Select all
              </button>
              <button type="button" className="btn-link small" onClick={() => setFeatures(new Set())}>
                Only the core features
              </button>
            </div>
            {groups.map(([group, list]) => (
              <div key={group} className="plan-feature-group">
                <strong className="small">{group}</strong>
                <div className="form-grid-3">
                  {list.map((f) => (
                    <div key={f.key} className="plan-switch-row">
                      <span className="plan-feature-label">
                        <span>{f.label}</span>
                        {f.core ? <span className="field-hint">Always included</span> : null}
                      </span>
                      <Switch
                        label={f.label}
                        checked={f.core || features.has(f.key)}
                        disabled={f.core}
                        onChange={(on) =>
                          setFeatures((current) => {
                            const next = new Set(current);
                            if (on) next.add(f.key);
                            else next.delete(f.key);
                            return next;
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        </div>
      ) : null}

      {quote ? (
        <div className="plan-pay">
          <div className="plan-pay-amount">
            <span className="small text-muted">To pay now</span>
            <strong>{price(quote.planPrice)}</strong>
            <span className="small text-muted">
              {quote.maxUsers.toLocaleString('en-IN')} users · {quote.storageGb ? `${formatStorage(quote.storageGb)} storage · ` : ''}{cycle === 'yearly' ? '12 months' : '1 month'} · {quote.planKey === 'custom' ? `${quote.modules.length} features` : 'every feature'}
            </span>
          </div>
          {tooFewUsers ? (
            <div className="alert alert-warning">You already have {currentUsers} users, more than this plan allows. Choose a bigger plan.</div>
          ) : null}
          {catalog.onlinePayment ? (
            <>
              <FormError message={error} />
              <div className="plan-pay-send">
                <span className="small text-muted">Pay by UPI, card, net banking or wallet. Your plan starts as soon as the payment goes through.</span>
                <Button variant="primary" loading={sending} disabled={tooFewUsers} onClick={() => void payOnline()}>
                  Pay {price(quote.planPrice)} now
                </Button>
              </div>
            </>
          ) : (
            <>
          <div className="plan-pay-how">
            {qr ? <div className="plan-pay-qr" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
            <div className="stack" style={{ gap: 6 }}>
              {catalog.payment.upiId ? (
                <span>
                  UPI: <strong className="mono">{catalog.payment.upiId}</strong>
                  {catalog.payment.payeeName ? ` (${catalog.payment.payeeName})` : ''}
                </span>
              ) : null}
              {catalog.payment.bankDetails ? <span className="pre-wrap">{catalog.payment.bankDetails}</span> : null}
              {!catalog.payment.upiId && !catalog.payment.bankDetails ? (
                <span className="text-muted">The platform administrator has not added payment details yet. Send a request to ask how to pay.</span>
              ) : null}
              <span className="small text-muted">{catalog.payment.note}</span>
            </div>
          </div>
          <FormError message={error} />
          <div className="plan-pay-send">
            <TextField label="Payment reference (UTR / transaction ID)" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} />
            <Button variant="primary" loading={sending} disabled={reference.trim().length < 4 || tooFewUsers} onClick={() => void send()}>
              I have paid: send for confirmation
            </Button>
          </div>
            </>
          )}
        </div>
      ) : (
        <p className="small text-muted">Choose a plan to see the amount and how to pay.</p>
      )}
    </div>
  );
}
