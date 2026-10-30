/**
 * The plan cards and the monthly / yearly switch, shared by the app's plan
 * chooser and the public landing page so both always show the same plans,
 * prices, users and storage.
 */
import { Check, Gift, HardDrive, Settings2, Users } from 'lucide-react';

import { formatRupees, formatStorage, type Cycle, type PlanKey, type PublicPlans } from '@/api/plans';

/** Where an organization's free trial stands, from its subscription status. */
export function trialStateOf(status: string | undefined): 'current' | 'ended' {
  return status === 'trial' ? 'current' : 'ended';
}

export function CycleSwitch({ cycle, yearlyMonths, onChange }: { cycle: Cycle; yearlyMonths: number; onChange: (cycle: Cycle) => void }) {
  return (
    <div className="plan-cycle" role="radiogroup" aria-label="Billing">
      {(['monthly', 'yearly'] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={cycle === value}
          className={`segmented-option ${cycle === value ? 'is-active is-view' : ''}`}
          onClick={() => onChange(value)}
        >
          {value === 'monthly' ? 'Monthly' : `Yearly (pay ${yearlyMonths} months, get 12)`}
        </button>
      ))}
    </div>
  );
}

/**
 * ``trial``: where this organization's free trial stands (the app); leave it
 * out on the public page, where the trial card leads to sign-up via ``onTrial``.
 */
export function PlanCards({
  plans,
  cycle,
  selected,
  onSelect,
  trial,
  onTrial,
}: {
  plans: Pick<PublicPlans, 'currency' | 'tiers' | 'customMinimum' | 'yearlyMonths' | 'trialDays'>;
  cycle: Cycle;
  selected?: PlanKey | null;
  onSelect: (key: PlanKey) => void;
  trial?: 'current' | 'ended' | 'used';
  onTrial?: () => void;
}) {
  const price = (amount: number) => formatRupees(amount, plans.currency);
  const card = (key: PlanKey) => `plan-card ${selected === key ? 'is-selected' : ''}`;
  // The trial has the smallest plan's users and storage.
  const first = plans.tiers[0];
  const days = plans.trialDays ?? 3;
  return (
    <div className="plan-cards">
      {first ? (
        <button
          type="button"
          className={`plan-card is-trial${trial ? ' is-static' : ''}`}
          onClick={trial ? undefined : onTrial}
          disabled={!!trial}
          aria-disabled={!!trial}
        >
          <span className="plan-card-name">
            Free trial
            {trial ? <span className={`plan-card-tag is-${trial}`}>{trial === 'current' ? 'Current' : 'Ended'}</span> : null}
          </span>
          <span className="plan-card-users">
            <Users size={15} aria-hidden="true" /> Up to {first.users.toLocaleString('en-IN')} users
          </span>
          {first.storageGb ? (
            <span className="plan-card-users">
              <HardDrive size={15} aria-hidden="true" /> {formatStorage(first.storageGb)} storage
            </span>
          ) : null}
          <span className="plan-card-price">
            {price(0)}
            <small>for {days} day{days === 1 ? '' : 's'}</small>
          </span>
          <span className="plan-card-note">
            <Gift size={14} aria-hidden="true" /> Every feature, no card needed
          </span>
        </button>
      ) : null}
      {plans.tiers.map((tier) => (
        <button key={tier.key} type="button" className={card(tier.key)} onClick={() => onSelect(tier.key)}>
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
          {cycle === 'yearly' ? <span className="plan-card-note">{price(tier.monthly * plans.yearlyMonths)} a year</span> : null}
        </button>
      ))}
      <button type="button" className={card('custom')} onClick={() => onSelect('custom')}>
        <span className="plan-card-name">Customize</span>
        <span className="plan-card-users">
          <Settings2 size={15} aria-hidden="true" /> Your users, your features
        </span>
        <span className="plan-card-price">
          from {price(plans.customMinimum)}
          <small>/month</small>
        </span>
        <span className="plan-card-note">Pay only for what you use</span>
      </button>
    </div>
  );
}
