/**
 * Choose tenant-app modules with live pricing. Used by the tenant subscription
 * page (and its lock screen) and the platform's plan dialogs (accept a plan
 * request, change an organization's plan).
 *
 * Dependencies: ticking a module also ticks what it needs; unticking a module
 * also unticks every selected module that needs it (each card says which).
 */
import { useId } from 'react';

import {
  MODULE_GROUPS,
  cycleSuffix,
  dependentsOf,
  formatPrice,
  freeMonths,
  moduleLabel,
  periodSuffix,
  quote,
  resolveModules,
  type BillingCycle,
  type ModulePricing,
  type PricedModule,
} from '@/api/modulePricing';
import type { AppModuleKey } from '@/api/appContent';

interface ModulePickerProps {
  catalog: ModulePricing;
  value: AppModuleKey[];
  onChange: (next: AppModuleKey[]) => void;
  /** Smaller cards without descriptions, for dialogs. */
  compact?: boolean;
  disabled?: boolean;
  error?: string | null;
  /** Accessible name of the whole picker. */
  label?: string;
}

function listLabels(keys: string[], catalog: ModulePricing): string {
  return keys.map((key) => moduleLabel(key, catalog)).join(', ');
}

export function ModulePicker({ catalog, value, onChange, compact = false, disabled = false, error, label = 'Modules' }: ModulePickerProps) {
  const baseId = useId();
  const selected = new Set<string>(value);
  const byKey = new Map(catalog.modules.map((module) => [module.key as string, module]));
  const grouped = new Set(MODULE_GROUPS.flatMap((group) => group.keys));
  const groups = MODULE_GROUPS.map((group) => ({
    ...group,
    modules: group.keys.map((key) => byKey.get(key)).filter((module): module is PricedModule => Boolean(module)),
  }));
  // Anything the server adds later still shows up.
  const extra = catalog.modules.filter((module) => !grouped.has(module.key));
  if (extra.length) {
    const other = groups.find((group) => group.id === 'other');
    if (other) other.modules.push(...extra);
  }

  const toggle = (key: AppModuleKey) => {
    if (selected.has(key)) {
      const removed = new Set<string>([key, ...dependentsOf(key, value, catalog)]);
      onChange(value.filter((item) => !removed.has(item)));
    } else {
      onChange(resolveModules([...value, key], catalog));
    }
  };

  const allSelected = catalog.modules.every((module) => selected.has(module.key));

  return (
    <div className={`module-picker${compact ? ' is-compact' : ''}`} role="group" aria-label={label}>
      <div className="module-picker-bar">
        <span className="text-muted small">
          {value.length} of {catalog.modules.length} selected
        </span>
        <span className="row" style={{ gap: 4 }}>
          <button
            type="button"
            className="btn btn-link btn-sm"
            disabled={disabled || allSelected}
            onClick={() => onChange(catalog.modules.map((module) => module.key))}
          >
            Select all
          </button>
          <button type="button" className="btn btn-link btn-sm" disabled={disabled || value.length === 0} onClick={() => onChange([])}>
            Clear
          </button>
        </span>
      </div>

      {groups
        .filter((group) => group.modules.length)
        .map((group) => (
          <fieldset key={group.id} className="module-group" disabled={disabled}>
            <legend className="module-group-title">{group.label}</legend>
            <div className="module-grid">
              {group.modules.map((module) => {
                const checked = selected.has(module.key);
                const nameId = `${baseId}-${module.key}-name`;
                const infoId = `${baseId}-${module.key}-info`;
                const usedBy = checked ? dependentsOf(module.key, value, catalog) : [];
                return (
                  <label key={module.key} className={`module-card${checked ? ' is-selected' : ''}`}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={checked}
                      onChange={() => toggle(module.key)}
                      aria-labelledby={nameId}
                      aria-describedby={infoId}
                    />
                    <span className="module-card-body">
                      <span className="module-card-head">
                        <span className="module-card-name" id={nameId}>
                          {module.label}
                        </span>
                        <span className="module-card-price">
                          {formatPrice(module.price, catalog.currency)}
                          <small>{periodSuffix(catalog.period)}</small>
                        </span>
                      </span>
                      <span id={infoId}>
                        {!compact && module.description ? <span className="module-card-desc">{module.description}</span> : null}
                        {module.requires.length ? (
                          <span className="module-card-hint">Needs {listLabels(module.requires, catalog)}</span>
                        ) : null}
                        {usedBy.length ? (
                          <span className="module-card-hint is-used">Unticking also removes {listLabels(usedBy, catalog)}</span>
                        ) : null}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

interface ModuleQuoteSummaryProps {
  catalog: ModulePricing;
  value: string[];
  compact?: boolean;
  /** Shown under the total, e.g. that the super admin reviews the request. */
  note?: string;
}

/** Base fee + modules = monthly total, recomputed live from the selection. */
export function ModuleQuoteSummary({ catalog, value, compact = false, note }: ModuleQuoteSummaryProps) {
  const q = quote(value, catalog);
  const suffix = periodSuffix(catalog.period);
  const price = (amount: number) => formatPrice(amount, catalog.currency);
  return (
    <div className={`module-summary${compact ? ' is-compact' : ''}`} aria-live="polite" data-testid="module-summary">
      <div className="module-summary-row">
        <span>
          Base fee
          {catalog.baseIncludes.length ? <small> (includes {catalog.baseIncludes.join(', ')})</small> : null}
        </span>
        <span className="num">{price(q.basePrice)}</span>
      </div>
      <div className="module-summary-row">
        <span>
          {q.modules.length} module{q.modules.length === 1 ? '' : 's'}
        </span>
        <span className="num">{price(q.modulesTotal)}</span>
      </div>
      <div className="module-summary-row is-total">
        <span>Total per {catalog.period}</span>
        <strong className="num" data-testid="module-total">
          {price(q.monthlyPrice)}
          <small>{suffix}</small>
        </strong>
      </div>
      {note ? <p className="module-summary-note">{note}</p> : null}
    </div>
  );
}

/** Read-only badges of a module list with their prices. */
export function ModuleBadges({ catalog, value }: { catalog: ModulePricing; value: string[] }) {
  return (
    <ul className="module-badges">
      {value.map((key) => {
        const module = catalog.modules.find((item) => item.key === key);
        return (
          <li key={key} className="badge badge-info">
            {module?.label ?? key}
            {module ? <span className="module-badge-price">{formatPrice(module.price, catalog.currency)}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

interface BillingCycleToggleProps {
  catalog: ModulePricing;
  value: BillingCycle;
  onChange: (next: BillingCycle) => void;
  disabled?: boolean;
}

/** Monthly | Yearly segmented control; Yearly carries its "2 months free" tag. */
export function BillingCycleToggle({ catalog, value, onChange, disabled = false }: BillingCycleToggleProps) {
  const free = freeMonths(catalog);
  const options: Array<{ value: BillingCycle; label: string; tag?: string }> = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly', tag: free > 0 ? `${free} month${free === 1 ? '' : 's'} free` : undefined },
  ];
  return (
    <div className="cycle-toggle" role="radiogroup" aria-label="Billing cycle">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`cycle-toggle-option${value === option.value ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {option.tag ? <span className="cycle-toggle-tag">{option.tag}</span> : null}
        </button>
      ))}
    </div>
  );
}

interface PlanQuoteSummaryProps {
  catalog: ModulePricing;
  value: string[];
  billingCycle: BillingCycle;
  compact?: boolean;
  /** Shown under the totals, e.g. that the platform administrator approves the plan. */
  note?: string;
}

/**
 * The overall value of a plan: base fee, modules, the monthly total and what
 * one billing cycle costs, with the yearly saving.
 */
export function PlanQuoteSummary({ catalog, value, billingCycle, compact = false, note }: PlanQuoteSummaryProps) {
  const q = quote(value, catalog, billingCycle);
  const price = (amount: number) => formatPrice(amount, catalog.currency);
  const yearly = billingCycle === 'yearly';
  const names = q.modules.map((key) => moduleLabel(key, catalog)).join(', ');
  return (
    <div className={`module-summary${compact ? ' is-compact' : ''}`} aria-live="polite" data-testid="plan-summary">
      <div className="module-summary-row">
        <span>
          Base fee
          {catalog.baseIncludes.length ? <small> (includes {catalog.baseIncludes.join(' & ')})</small> : null}
        </span>
        <span className="num">
          {price(q.basePrice)}
          <small>/mo</small>
        </span>
      </div>
      <div className="module-summary-row">
        <span>
          {q.modules.length} module{q.modules.length === 1 ? '' : 's'}
          {!compact && names ? <small className="module-summary-names">{names}</small> : null}
        </span>
        <span className="num">
          {price(q.modulesTotal)}
          <small>/mo</small>
        </span>
      </div>
      <div className="module-summary-row">
        <span>Per month</span>
        <strong className="num" data-testid="plan-monthly">
          {price(q.monthlyPrice)}
          <small>/mo</small>
        </strong>
      </div>
      <div className="module-summary-row is-total">
        <span>{yearly ? `Billed yearly (${catalog.yearlyMultiplier} × monthly)` : 'Billed monthly'}</span>
        <strong className="num" data-testid="plan-price">
          {price(q.planPrice)}
          <small>{cycleSuffix(billingCycle)}</small>
        </strong>
      </div>
      {q.yearlySaving > 0 ? (
        <p className={`module-summary-saving${yearly ? ' is-saved' : ''}`} data-testid="plan-saving">
          {yearly
            ? `You save ${price(q.yearlySaving)} a year compared with monthly billing.`
            : `Switch to yearly billing and save ${price(q.yearlySaving)} a year.`}
        </p>
      ) : null}
      {note ? <p className="module-summary-note">{note}</p> : null}
    </div>
  );
}
