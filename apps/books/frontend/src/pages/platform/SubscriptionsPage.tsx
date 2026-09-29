import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';

import { platformApi } from '@/api/platform';
import {
  SITE_CONTENT_LIMITS as LIMITS,
  normalizeSiteContent,
  validateSiteContent,
  type PlanCtaTarget,
  type SiteContent,
  type SitePricingPlan,
} from '@/api/siteContent';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

const CTA_TARGET_OPTIONS: Array<{ value: PlanCtaTarget; label: string }> = [
  { value: 'register', label: 'Create organization (sign up)' },
  { value: 'login', label: 'Sign in' },
];

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

const createDefaultPlan = (): SitePricingPlan => ({
  name: 'Professional Plan',
  description: 'Full-featured plan for growing organizations',
  monthlyPrice: 999,
  annualPrice: 799,
  features: ['Unlimited invoices', 'Automated GST filing', 'Bank reconciliation', 'Multi-user access'],
  ctaLabel: 'Get Started',
  ctaTarget: 'register',
  popular: false,
});

export function SubscriptionsPage() {
  const toast = useToast();
  const remote = useAsync(async (signal) => normalizeSiteContent(await platformApi.siteContent.get(signal)), []);
  const [saved, setSaved] = useState<SiteContent | null>(null);
  const [draft, setDraft] = useState<SiteContent | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [previewAnnual, setPreviewAnnual] = useState(false);
  const saveSubmit = useSubmit();
  const resetSubmit = useSubmit();

  useEffect(() => {
    if (remote.data) {
      setSaved(remote.data);
      setDraft(remote.data);
    }
  }, [remote.data]);

  const pricing = draft?.pricing;

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return JSON.stringify(draft.pricing) !== JSON.stringify(saved.pricing);
  }, [draft, saved]);

  const errors = useMemo(() => (draft ? validateSiteContent(draft) : {}), [draft]);
  const pricingErrorCount = useMemo(() => {
    return Object.keys(errors).filter((key) => key.startsWith('pricing.')).length;
  }, [errors]);

  const patchPricing = (changes: Partial<SiteContent['pricing']>) => {
    setDraft((prev) => (prev ? { ...prev, pricing: { ...prev.pricing, ...changes } } : prev));
  };

  const updatePlan = (index: number, updates: Partial<SitePricingPlan>) => {
    if (!pricing) return;
    const plans = pricing.plans.map((p, i) => (i === index ? { ...p, ...updates } : p));
    patchPricing({ plans });
  };

  const addPlan = () => {
    if (!pricing || pricing.plans.length >= LIMITS.plansMax) return;
    patchPricing({ plans: [...pricing.plans, createDefaultPlan()] });
  };

  const removePlan = (index: number) => {
    if (!pricing || pricing.plans.length <= LIMITS.plansMin) return;
    patchPricing({ plans: pricing.plans.filter((_, i) => i !== index) });
  };

  const movePlan = (from: number, to: number) => {
    if (!pricing) return;
    patchPricing({ plans: moveItem(pricing.plans, from, to) });
  };

  const addFeature = (planIndex: number) => {
    if (!pricing) return;
    const plan = pricing.plans[planIndex];
    if (!plan || plan.features.length >= LIMITS.planFeatures) return;
    updatePlan(planIndex, { features: [...plan.features, 'New feature'] });
  };

  const updateFeature = (planIndex: number, featureIndex: number, text: string) => {
    if (!pricing) return;
    const plan = pricing.plans[planIndex];
    if (!plan) return;
    const features = plan.features.map((f, i) => (i === featureIndex ? text : f));
    updatePlan(planIndex, { features });
  };

  const removeFeature = (planIndex: number, featureIndex: number) => {
    if (!pricing) return;
    const plan = pricing.plans[planIndex];
    if (!plan) return;
    const features = plan.features.filter((_, i) => i !== featureIndex);
    updatePlan(planIndex, { features });
  };

  const save = async () => {
    if (!draft) return;
    const validationErrors = validateSiteContent(draft);
    if (Object.keys(validationErrors).some((k) => k.startsWith('pricing.'))) {
      toast.error('Please fix the errors in pricing before saving.');
      return;
    }

    const updated = await saveSubmit.run(() => platformApi.siteContent.update(draft));
    if (updated) {
      const normalized = normalizeSiteContent(updated);
      setSaved(normalized);
      setDraft(normalized);
      toast.success('Subscription plans & pricing saved successfully!');
    }
  };

  const reset = async () => {
    const updated = await resetSubmit.run(() => platformApi.siteContent.reset());
    if (updated) {
      const normalized = normalizeSiteContent(updated);
      setSaved(normalized);
      setDraft(normalized);
      setConfirmingReset(false);
      toast.success('Subscription pricing restored to default values.');
    }
  };

  return (
    <>
      <PageHeader
        title="Subscriptions & Pricing"
        subtitle="Manage public subscription tiers, monthly and annual prices, discounts, and tier features."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button
              variant="secondary"
              icon={<RotateCcw size={15} />}
              disabled={saveSubmit.submitting || resetSubmit.submitting}
              onClick={() => setConfirmingReset(true)}
            >
              Reset to defaults
            </Button>
            <Button
              variant="primary"
              icon={<Save size={15} />}
              loading={saveSubmit.submitting}
              disabled={!dirty || pricingErrorCount > 0}
              onClick={() => void save()}
            >
              Save pricing
            </Button>
          </div>
        }
      />

      {remote.loading && !draft ? (
        <div className="card">
          <LoadingBlock label="Loading subscription plans and pricing…" />
        </div>
      ) : remote.error && !draft ? (
        <div className="card">
          <ErrorBlock message={remote.error} onRetry={remote.reload} />
        </div>
      ) : draft && pricing ? (
        <div className="stack" style={{ gap: 24 }}>
          {dirty ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '8px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1e40af',
                fontSize: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Sparkles size={18} />
                <span>You have unsaved changes in your subscription pricing.</span>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<Save size={14} />}
                loading={saveSubmit.submitting}
                disabled={pricingErrorCount > 0}
                onClick={() => void save()}
              >
                Save now
              </Button>
            </div>
          ) : null}

          <FormError message={saveSubmit.error} />

          {/* Pricing section heading on the landing page */}
          <Card title="Pricing Section Heading" subtitle="The badge, title and description shown above the plans on the landing page.">
            <div className="form-grid">
              <TextField
                label="Section badge"
                value={pricing.badge}
                hint="e.g. SIMPLE PRICING"
                error={errors['pricing.badge']}
                onChange={(e) => patchPricing({ badge: e.target.value })}
              />
              <TextField
                label="Section title"
                value={pricing.title}
                error={errors['pricing.title']}
                onChange={(e) => patchPricing({ title: e.target.value })}
              />
            </div>
            <TextAreaField
              label="Section description"
              rows={2}
              value={pricing.description}
              hint="Leave empty to hide."
              error={errors['pricing.description']}
              onChange={(e) => patchPricing({ description: e.target.value })}
            />
          </Card>

          {/* Global Pricing Display Settings */}
          <Card title="Pricing Configuration" subtitle="Configure currency, billing toggle labels, and period tags.">
            <div className="form-grid-3">
              <TextField
                label="Currency symbol"
                maxLength={8}
                value={pricing.currencySymbol}
                hint="e.g. ₹, $, €"
                onChange={(e) => patchPricing({ currencySymbol: e.target.value })}
              />
              <TextField
                label="Price period label"
                value={pricing.periodLabel}
                hint="e.g. /month"
                onChange={(e) => patchPricing({ periodLabel: e.target.value })}
              />
              <TextField
                label="“Most popular” badge text"
                value={pricing.popularLabel}
                hint="e.g. MOST POPULAR"
                onChange={(e) => patchPricing({ popularLabel: e.target.value })}
              />
              <TextField
                label="Monthly billing toggle"
                value={pricing.monthlyLabel}
                onChange={(e) => patchPricing({ monthlyLabel: e.target.value })}
              />
              <TextField
                label="Annual billing toggle"
                value={pricing.annualLabel}
                onChange={(e) => patchPricing({ annualLabel: e.target.value })}
              />
              <TextField
                label="Annual discount label"
                value={pricing.annualDiscountLabel}
                hint="e.g. Save 20% (leave blank to hide)"
                onChange={(e) => patchPricing({ annualDiscountLabel: e.target.value })}
              />
            </div>
          </Card>

          {/* Subscription Plans List */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="card-title">Subscription Plans ({pricing.plans.length})</h2>
                <p className="card-subtitle">
                  Configure plan names, monthly and annual prices, and feature checklists.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={15} />}
                disabled={pricing.plans.length >= LIMITS.plansMax}
                onClick={addPlan}
              >
                Add Plan
              </Button>
            </div>

            <div className="card-body stack" style={{ gap: 20 }}>
              {pricing.plans.map((plan, planIdx) => (
                <div
                  key={planIdx}
                  style={{
                    border: plan.popular ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 20,
                    background: plan.popular ? '#f8faff' : '#ffffff',
                    position: 'relative',
                  }}
                >
                  <div className="row-between" style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: plan.popular ? '#2563eb' : '#64748b',
                          color: '#ffffff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {planIdx + 1}
                      </span>
                      <strong style={{ fontSize: 16 }}>{plan.name || 'Unnamed Plan'}</strong>
                      {plan.popular ? <Badge tone="info">{pricing.popularLabel || 'Popular'}</Badge> : null}
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<ArrowUp size={14} />}
                        disabled={planIdx === 0}
                        onClick={() => movePlan(planIdx, planIdx - 1)}
                        title="Move plan up"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<ArrowDown size={14} />}
                        disabled={planIdx === pricing.plans.length - 1}
                        onClick={() => movePlan(planIdx, planIdx + 1)}
                        title="Move plan down"
                      />
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        disabled={pricing.plans.length <= LIMITS.plansMin}
                        onClick={() => removePlan(planIdx)}
                        title="Delete plan"
                      />
                    </div>
                  </div>

                  <div className="form-grid-3" style={{ marginBottom: 16 }}>
                    <TextField
                      label="Plan name"
                      value={plan.name}
                      required
                      placeholder="e.g. Standard Business"
                      onChange={(e) => updatePlan(planIdx, { name: e.target.value })}
                    />
                    <TextField
                      label={`Monthly price (${pricing.currencySymbol})`}
                      type="number"
                      min={0}
                      max={LIMITS.priceMax}
                      value={String(plan.monthlyPrice)}
                      required
                      hint="Price charged on monthly billing"
                      onChange={(e) => updatePlan(planIdx, { monthlyPrice: Number(e.target.value) || 0 })}
                    />
                    <TextField
                      label={`Annual price / mo (${pricing.currencySymbol})`}
                      type="number"
                      min={0}
                      max={LIMITS.priceMax}
                      value={String(plan.annualPrice)}
                      required
                      hint="Discounted rate on annual billing"
                      onChange={(e) => updatePlan(planIdx, { annualPrice: Number(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="form-grid" style={{ marginBottom: 16 }}>
                    <TextField
                      label="Description"
                      value={plan.description}
                      placeholder="Who is this plan suited for?"
                      onChange={(e) => updatePlan(planIdx, { description: e.target.value })}
                    />
                    <div style={{ display: 'flex', gap: 12 }}>
                      <TextField
                        label="Button text"
                        value={plan.ctaLabel}
                        placeholder="Get Started"
                        onChange={(e) => updatePlan(planIdx, { ctaLabel: e.target.value })}
                      />
                      <SelectField
                        label="Button link destination"
                        value={plan.ctaTarget}
                        options={CTA_TARGET_OPTIONS}
                        onChange={(e) => updatePlan(planIdx, { ctaTarget: e.target.value as PlanCtaTarget })}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <CheckboxField
                      label="Mark as “Most Popular” plan"
                      hint="Highlights this card with an indigo border and badge."
                      checked={plan.popular}
                      onChange={(e) => updatePlan(planIdx, { popular: e.target.checked })}
                    />
                  </div>

                  {/* Plan Features */}
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '14px 16px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div className="row-between" style={{ marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                        Included Features ({plan.features.length})
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus size={13} />}
                        disabled={plan.features.length >= LIMITS.planFeatures}
                        onClick={() => addFeature(planIdx)}
                      >
                        Add feature
                      </Button>
                    </div>

                    <div className="stack" style={{ gap: 8 }}>
                      {plan.features.map((feature, featIdx) => (
                        <div key={featIdx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: '#16a34a', flexShrink: 0 }}>
                            <Check size={16} />
                          </span>
                          <input
                            type="text"
                            className="input"
                            value={feature}
                            placeholder="Describe what's included..."
                            onChange={(e) => updateFeature(planIdx, featIdx, e.target.value)}
                            style={{ flex: 1 }}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 size={13} />}
                            onClick={() => removeFeature(planIdx, featIdx)}
                            title="Remove feature"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Preview Card */}
          <Card
            title="Customer Pricing Preview"
            subtitle="This is how your plans and subscription pricing appear on the public landing page."
          >
            {pricing.badge || pricing.title || pricing.description ? (
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                {pricing.badge ? (
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: '#2563eb',
                      background: '#eff6ff',
                      padding: '4px 12px',
                      borderRadius: 999,
                      marginBottom: 10,
                    }}
                  >
                    {pricing.badge}
                  </span>
                ) : null}
                {pricing.title ? <h3 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>{pricing.title}</h3> : null}
                {pricing.description ? (
                  <p style={{ fontSize: 14, color: '#64748b', margin: '0 auto', maxWidth: 560 }}>{pricing.description}</p>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 14px',
                  background: '#f1f5f9',
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                <button
                  type="button"
                  onClick={() => setPreviewAnnual(false)}
                  style={{
                    border: 'none',
                    background: !previewAnnual ? '#ffffff' : 'transparent',
                    color: !previewAnnual ? '#0f172a' : '#64748b',
                    padding: '4px 12px',
                    borderRadius: 999,
                    fontWeight: !previewAnnual ? 600 : 500,
                    boxShadow: !previewAnnual ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {pricing.monthlyLabel || 'Monthly'}
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAnnual(true)}
                  style={{
                    border: 'none',
                    background: previewAnnual ? '#ffffff' : 'transparent',
                    color: previewAnnual ? '#0f172a' : '#64748b',
                    padding: '4px 12px',
                    borderRadius: 999,
                    fontWeight: previewAnnual ? 600 : 500,
                    boxShadow: previewAnnual ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {pricing.annualLabel || 'Annual'}
                  {pricing.annualDiscountLabel ? (
                    <span
                      style={{
                        marginLeft: 6,
                        background: '#dcfce7',
                        color: '#15803d',
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 999,
                      }}
                    >
                      {pricing.annualDiscountLabel}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`,
                gap: 20,
              }}
            >
              {pricing.plans.map((plan, i) => {
                const price = previewAnnual ? plan.annualPrice : plan.monthlyPrice;
                return (
                  <div
                    key={i}
                    style={{
                      border: plan.popular ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: 24,
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: plan.popular ? '0 10px 25px -5px rgba(37,99,235,0.15)' : 'none',
                      position: 'relative',
                    }}
                  >
                    {plan.popular ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: -12,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#2563eb',
                          color: '#ffffff',
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 12px',
                          borderRadius: 999,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {pricing.popularLabel || 'MOST POPULAR'}
                      </div>
                    ) : null}

                    <div>
                      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{plan.name}</h3>
                      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{plan.description}</p>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20 }}>
                        <span style={{ fontSize: 18, fontWeight: 600 }}>{pricing.currencySymbol}</span>
                        <span style={{ fontSize: 36, fontWeight: 800, color: '#0f172a' }}>
                          {price.toLocaleString('en-IN')}
                        </span>
                        <span style={{ fontSize: 13, color: '#64748b' }}>{pricing.periodLabel}</span>
                      </div>

                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0' }}>
                        {plan.features.map((feat, fi) => (
                          <li
                            key={fi}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: 13,
                              color: '#334155',
                              marginBottom: 8,
                            }}
                          >
                            <CheckCircle2 size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      type="button"
                      className={`btn btn-block ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {plan.ctaLabel || 'Get Started'}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmingReset}
        title="Reset Subscriptions & Pricing"
        message={
          <>
            <FormError message={resetSubmit.error} />
            <p>
              Restore subscription plans and pricing back to default values? Any changes you made will be overwritten.
            </p>
          </>
        }
        confirmLabel="Reset to defaults"
        busy={resetSubmit.submitting}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmingReset(false)}
      />
    </>
  );
}
