import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, ExternalLink, Plus, RotateCcw, Save, Trash2, Undo2 } from 'lucide-react';

import { platformApi } from '@/api/platform';
import { PlatformApiError } from '@/api/platformClient';
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
import { ErrorBlock, FormError, LoadingBlock } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useAsync } from '@/hooks/useAsync';
import { useSubmit } from '@/hooks/useSubmit';

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

type SectionId = 'brand' | 'hero' | 'features' | 'pricing' | 'testimonials' | 'faq' | 'ctaBanner' | 'footer' | 'sections' | 'seo';

/** Which editor card owns each top-level key of the document (for error badges / auto-expanding). */
const SECTION_OF_KEY: Record<keyof SiteContent, SectionId> = {
  brand: 'brand',
  nav: 'brand',
  hero: 'hero',
  features: 'features',
  pricing: 'pricing',
  testimonials: 'testimonials',
  faq: 'faq',
  ctaBanner: 'ctaBanner',
  footer: 'footer',
  sections: 'sections',
  seo: 'seo',
};

function sectionOfPath(path: string): SectionId | null {
  const head = path.split('.')[0] as keyof SiteContent;
  return SECTION_OF_KEY[head] ?? null;
}

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

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, i) => (i === index ? value : item));
}

const newPlan = (): SitePricingPlan => ({
  name: 'New plan',
  description: '',
  monthlyPrice: 0,
  annualPrice: 0,
  features: [],
  ctaLabel: 'Get started',
  ctaTarget: 'register',
  popular: false,
});

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function WebsitePage() {
  const toast = useToast();
  const remote = useAsync(async (signal) => normalizeSiteContent(await platformApi.siteContent.get(signal)), []);
  const [saved, setSaved] = useState<SiteContent | null>(null);
  const [draft, setDraft] = useState<SiteContent | null>(null);
  const [openSections, setOpenSections] = useState<Set<SectionId>>(() => new Set<SectionId>(['hero']));
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [confirmingReset, setConfirmingReset] = useState(false);
  const saveSubmit = useSubmit();
  const resetSubmit = useSubmit();

  useEffect(() => {
    if (remote.data) {
      setSaved(remote.data);
      setDraft(remote.data);
    }
  }, [remote.data]);

  const dirty = useMemo(() => Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved)), [draft, saved]);
  const localErrors = useMemo(() => (draft ? validateSiteContent(draft) : {}), [draft]);
  const errors = useMemo(() => ({ ...serverErrors, ...localErrors }), [serverErrors, localErrors]);
  const err = (path: string): string | undefined => errors[path];

  const errorCounts = useMemo(() => {
    const counts: Partial<Record<SectionId, number>> = {};
    Object.keys(errors).forEach((path) => {
      const section = sectionOfPath(path);
      if (section) counts[section] = (counts[section] ?? 0) + 1;
    });
    return counts;
  }, [errors]);

  const toggleSection = (id: SectionId) =>
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandSectionsFor = (paths: string[]) =>
    setOpenSections((current) => {
      const next = new Set(current);
      paths.forEach((path) => {
        const section = sectionOfPath(path);
        if (section) next.add(section);
      });
      return next;
    });

  /** Shallow-merge `value` into one top-level section of the draft. */
  const patch = <K extends keyof SiteContent>(key: K, value: Partial<SiteContent[K]>) => {
    setDraft((current) => (current ? { ...current, [key]: { ...current[key], ...value } } : current));
    if (Object.keys(serverErrors).length) setServerErrors({});
  };

  const applyServerContent = (content: SiteContent) => {
    const normalized = normalizeSiteContent(content);
    setSaved(normalized);
    setDraft(normalized);
    setServerErrors({});
  };

  const save = async () => {
    if (!draft) return;
    const problems = Object.keys(localErrors);
    if (problems.length) {
      expandSectionsFor(problems);
      toast.error('Fix the highlighted fields before saving.');
      return;
    }
    setServerErrors({});
    const updated = await saveSubmit.run(async () => {
      try {
        return await platformApi.siteContent.update(draft);
      } catch (error) {
        if (error instanceof PlatformApiError && Object.keys(error.pathErrors).length) {
          setServerErrors(error.pathErrors);
          expandSectionsFor(Object.keys(error.pathErrors));
        }
        throw error;
      }
    });
    if (updated) {
      applyServerContent(updated);
      toast.success('Website saved. The public site now shows these changes.');
    } else if (saveSubmit.errorRef.current) {
      toast.error('The website could not be saved. See the highlighted fields.');
    }
  };

  const reset = async () => {
    const defaults = await resetSubmit.run(() => platformApi.siteContent.reset());
    if (defaults) {
      applyServerContent(defaults);
      setConfirmingReset(false);
      toast.success('Website content was reset to the defaults.');
    }
  };

  const discard = () => {
    if (saved) setDraft(saved);
    setServerErrors({});
    saveSubmit.reset();
  };

  const header = (
    <PageHeader
      title="Website"
      subtitle="Edit the public landing page: copy, pricing, testimonials, FAQ and footer."
      actions={
        <a className="btn btn-secondary btn-md" href="/" target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} aria-hidden="true" />
          <span>View live site</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      }
    />
  );

  if (!draft) {
    return (
      <>
        {header}
        <div className="card">
          {remote.error ? (
            <ErrorBlock message={remote.error} onRetry={remote.reload} />
          ) : (
            <LoadingBlock label="Loading website content…" />
          )}
        </div>
      </>
    );
  }

  const { brand, nav, hero, features, pricing, testimonials, faq, ctaBanner, footer, sections, seo } = draft;
  const sectionProps = (id: SectionId) => ({
    id,
    open: openSections.has(id),
    onToggle: () => toggleSection(id),
    errorCount: errorCounts[id] ?? 0,
  });

  return (
    <>
      {header}

      <div className="site-editor">
        <FormError message={saveSubmit.error} />

        <EditorSection {...sectionProps('brand')} title="Brand & navigation" description="Logo, brand name and badge, the header links and buttons.">
          <div className="form-grid-3">
            <TextField label="Brand name" hint="Text next to the logo. Leave empty to hide." value={brand.name} error={err('brand.name')} onChange={(e) => patch('brand', { name: e.target.value })} />
            <TextField
              label="Logo URL"
              hint="A site path such as /rooman-logo.png or an https:// URL. Used in the header and footer."
              maxLength={LIMITS.logoUrl}
              value={brand.logoUrl}
              error={err('brand.logoUrl')}
              onChange={(e) => patch('brand', { logoUrl: e.target.value })}
            />
            <TextField label="Brand badge" value={brand.badge} error={err('brand.badge')} onChange={(e) => patch('brand', { badge: e.target.value })} />
            <TextField label="Log-in link label" value={nav.loginLabel} error={err('nav.loginLabel')} onChange={(e) => patch('nav', { loginLabel: e.target.value })} />
            <TextField label="Header button label" value={nav.ctaLabel} error={err('nav.ctaLabel')} onChange={(e) => patch('nav', { ctaLabel: e.target.value })} />
          </div>
          <div className="form-grid">
            <TextField label="Features link label" value={nav.featuresLabel} error={err('nav.featuresLabel')} onChange={(e) => patch('nav', { featuresLabel: e.target.value })} />
            <TextField label="Pricing link label" value={nav.pricingLabel} error={err('nav.pricingLabel')} onChange={(e) => patch('nav', { pricingLabel: e.target.value })} />
            <TextField label="Testimonials link label" value={nav.testimonialsLabel} error={err('nav.testimonialsLabel')} onChange={(e) => patch('nav', { testimonialsLabel: e.target.value })} />
            <TextField label="FAQ link label" value={nav.faqLabel} error={err('nav.faqLabel')} onChange={(e) => patch('nav', { faqLabel: e.target.value })} />
          </div>
        </EditorSection>

        <EditorSection {...sectionProps('hero')} title="Hero" description="The first screen: headline, subtitle, buttons and trust points.">
          <div className="form-grid">
            <TextField label="Pill text" value={hero.pill} error={err('hero.pill')} onChange={(e) => patch('hero', { pill: e.target.value })} />
            <TextField label="Pill tag" hint="Short tag such as “New”. Leave empty to hide." value={hero.pillTag} error={err('hero.pillTag')} onChange={(e) => patch('hero', { pillTag: e.target.value })} />
            <TextField label="Title (first line)" value={hero.titleLine1} error={err('hero.titleLine1')} onChange={(e) => patch('hero', { titleLine1: e.target.value })} />
            <TextField label="Title (highlighted line)" value={hero.titleHighlight} error={err('hero.titleHighlight')} onChange={(e) => patch('hero', { titleHighlight: e.target.value })} />
          </div>
          <TextAreaField label="Subtitle" rows={3} value={hero.subtitle} error={err('hero.subtitle')} onChange={(e) => patch('hero', { subtitle: e.target.value })} />
          <div className="form-grid">
            <TextField label="Primary button (sign in)" value={hero.primaryCta} error={err('hero.primaryCta')} onChange={(e) => patch('hero', { primaryCta: e.target.value })} />
            <TextField label="Secondary button (sign up)" value={hero.secondaryCta} error={err('hero.secondaryCta')} onChange={(e) => patch('hero', { secondaryCta: e.target.value })} />
          </div>
          <StringListEditor
            legend="Trust items"
            itemLabel="Trust item"
            items={hero.trustItems}
            max={LIMITS.trustItems}
            error={err('hero.trustItems')}
            errorFor={(i) => err(`hero.trustItems.${i}`)}
            addLabel="Add trust item"
            onChange={(trustItems) => patch('hero', { trustItems })}
          />
        </EditorSection>

        <EditorSection {...sectionProps('features')} title="Features" description="Section heading and the feature cards. Icons cycle in order.">
          <div className="form-grid">
            <TextField label="Section badge" value={features.badge} error={err('features.badge')} onChange={(e) => patch('features', { badge: e.target.value })} />
            <TextField label="Section title" value={features.title} error={err('features.title')} onChange={(e) => patch('features', { title: e.target.value })} />
          </div>
          <TextAreaField label="Section description" rows={2} value={features.description} error={err('features.description')} onChange={(e) => patch('features', { description: e.target.value })} />
          <ItemListEditor
            legend="Feature cards"
            noun="feature"
            items={features.items}
            max={LIMITS.featureItems}
            error={err('features.items')}
            addLabel="Add feature"
            newItem={() => ({ title: 'New feature', text: '' })}
            titleOf={(item) => item.title}
            onChange={(items) => patch('features', { items })}
            render={(item, i, update) => (
              <>
                <TextField label="Title" value={item.title} error={err(`features.items.${i}.title`)} onChange={(e) => update({ title: e.target.value })} />
                <TextAreaField label="Text" rows={2} value={item.text} error={err(`features.items.${i}.text`)} onChange={(e) => update({ text: e.target.value })} />
              </>
            )}
          />
        </EditorSection>

        <EditorSection {...sectionProps('pricing')} title="Pricing" description="Plans, prices and the labels around them.">
          <div className="form-grid-3">
            <TextField label="Section badge" value={pricing.badge} error={err('pricing.badge')} onChange={(e) => patch('pricing', { badge: e.target.value })} />
            <TextField label="Section title" value={pricing.title} error={err('pricing.title')} onChange={(e) => patch('pricing', { title: e.target.value })} />
            <TextField label="Currency symbol" maxLength={8} value={pricing.currencySymbol} error={err('pricing.currencySymbol')} onChange={(e) => patch('pricing', { currencySymbol: e.target.value })} />
            <TextField label="Monthly toggle label" value={pricing.monthlyLabel} error={err('pricing.monthlyLabel')} onChange={(e) => patch('pricing', { monthlyLabel: e.target.value })} />
            <TextField label="Annual toggle label" value={pricing.annualLabel} error={err('pricing.annualLabel')} onChange={(e) => patch('pricing', { annualLabel: e.target.value })} />
            <TextField label="Annual discount tag" hint="Leave empty to hide." value={pricing.annualDiscountLabel} error={err('pricing.annualDiscountLabel')} onChange={(e) => patch('pricing', { annualDiscountLabel: e.target.value })} />
            <TextField label="Price period label" hint="Shown after the price, e.g. /month" value={pricing.periodLabel} error={err('pricing.periodLabel')} onChange={(e) => patch('pricing', { periodLabel: e.target.value })} />
            <TextField label="“Most popular” badge text" value={pricing.popularLabel} error={err('pricing.popularLabel')} onChange={(e) => patch('pricing', { popularLabel: e.target.value })} />
          </div>
          <TextAreaField label="Section description" hint="Leave empty to hide." rows={2} value={pricing.description} error={err('pricing.description')} onChange={(e) => patch('pricing', { description: e.target.value })} />
          <ItemListEditor
            legend="Plans"
            noun="plan"
            items={pricing.plans}
            min={LIMITS.plansMin}
            max={LIMITS.plansMax}
            error={err('pricing.plans')}
            addLabel="Add plan"
            newItem={newPlan}
            titleOf={(plan) => (plan.popular ? `${plan.name} (most popular)` : plan.name)}
            onChange={(plans) => patch('pricing', { plans })}
            render={(plan, i, update) => <PlanFields plan={plan} base={`pricing.plans.${i}`} err={err} update={update} />}
          />
        </EditorSection>

        <EditorSection {...sectionProps('testimonials')} title="Testimonials" description="Customer quotes. Initials are derived from the name.">
          <div className="form-grid">
            <TextField label="Section badge" value={testimonials.badge} error={err('testimonials.badge')} onChange={(e) => patch('testimonials', { badge: e.target.value })} />
            <TextField label="Section title" value={testimonials.title} error={err('testimonials.title')} onChange={(e) => patch('testimonials', { title: e.target.value })} />
          </div>
          <TextAreaField label="Section description" hint="Leave empty to hide." rows={2} value={testimonials.description} error={err('testimonials.description')} onChange={(e) => patch('testimonials', { description: e.target.value })} />
          <ItemListEditor
            legend="Quotes"
            noun="testimonial"
            items={testimonials.items}
            max={LIMITS.testimonials}
            error={err('testimonials.items')}
            addLabel="Add testimonial"
            newItem={() => ({ name: 'New customer', role: '', quote: '' })}
            titleOf={(item) => item.name}
            onChange={(items) => patch('testimonials', { items })}
            render={(item, i, update) => (
              <>
                <div className="form-grid">
                  <TextField label="Name" value={item.name} error={err(`testimonials.items.${i}.name`)} onChange={(e) => update({ name: e.target.value })} />
                  <TextField label="Role / company" value={item.role} error={err(`testimonials.items.${i}.role`)} onChange={(e) => update({ role: e.target.value })} />
                </div>
                <TextAreaField label="Quote" rows={3} value={item.quote} error={err(`testimonials.items.${i}.quote`)} onChange={(e) => update({ quote: e.target.value })} />
              </>
            )}
          />
        </EditorSection>

        <EditorSection {...sectionProps('faq')} title="FAQ" description="Questions and answers shown as an accordion.">
          <div className="form-grid">
            <TextField label="Section badge" value={faq.badge} error={err('faq.badge')} onChange={(e) => patch('faq', { badge: e.target.value })} />
            <TextField label="Section title" value={faq.title} error={err('faq.title')} onChange={(e) => patch('faq', { title: e.target.value })} />
          </div>
          <TextAreaField label="Section description" hint="Leave empty to hide." rows={2} value={faq.description} error={err('faq.description')} onChange={(e) => patch('faq', { description: e.target.value })} />
          <ItemListEditor
            legend="Questions"
            noun="question"
            items={faq.items}
            max={LIMITS.faq}
            error={err('faq.items')}
            addLabel="Add question"
            newItem={() => ({ question: 'New question', answer: '' })}
            titleOf={(item) => item.question}
            onChange={(items) => patch('faq', { items })}
            render={(item, i, update) => (
              <>
                <TextField label="Question" value={item.question} error={err(`faq.items.${i}.question`)} onChange={(e) => update({ question: e.target.value })} />
                <TextAreaField label="Answer" rows={3} value={item.answer} error={err(`faq.items.${i}.answer`)} onChange={(e) => update({ answer: e.target.value })} />
              </>
            )}
          />
        </EditorSection>

        <EditorSection {...sectionProps('ctaBanner')} title="Call-to-action banner" description="The closing banner above the footer.">
          <TextField label="Title" value={ctaBanner.title} error={err('ctaBanner.title')} onChange={(e) => patch('ctaBanner', { title: e.target.value })} />
          <TextAreaField label="Subtitle" rows={2} value={ctaBanner.subtitle} error={err('ctaBanner.subtitle')} onChange={(e) => patch('ctaBanner', { subtitle: e.target.value })} />
          <div className="form-grid">
            <TextField label="Primary button (sign in)" value={ctaBanner.primaryCta} error={err('ctaBanner.primaryCta')} onChange={(e) => patch('ctaBanner', { primaryCta: e.target.value })} />
            <TextField label="Secondary button (sign up)" value={ctaBanner.secondaryCta} error={err('ctaBanner.secondaryCta')} onChange={(e) => patch('ctaBanner', { secondaryCta: e.target.value })} />
          </div>
        </EditorSection>

        <EditorSection {...sectionProps('footer')} title="Footer" description="Tagline, link columns and the bottom line.">
          <TextAreaField label="Tagline" rows={2} value={footer.tagline} error={err('footer.tagline')} onChange={(e) => patch('footer', { tagline: e.target.value })} />
          <div className="form-grid">
            <TextField label="Copyright line" value={footer.copyright} error={err('footer.copyright')} onChange={(e) => patch('footer', { copyright: e.target.value })} />
            <TextField label="Bottom note" value={footer.bottomNote} error={err('footer.bottomNote')} onChange={(e) => patch('footer', { bottomNote: e.target.value })} />
          </div>
          <ItemListEditor
            legend="Columns"
            noun="column"
            items={footer.columns}
            max={LIMITS.footerColumns}
            error={err('footer.columns')}
            addLabel="Add column"
            newItem={() => ({ heading: 'New column', links: [] })}
            titleOf={(column) => column.heading}
            onChange={(columns) => patch('footer', { columns })}
            render={(column, i, update) => (
              <>
                <TextField label="Heading" value={column.heading} error={err(`footer.columns.${i}.heading`)} onChange={(e) => update({ heading: e.target.value })} />
                <StringListEditor
                  legend="Links"
                  itemLabel={`${column.heading || `Column ${i + 1}`} link`}
                  items={column.links}
                  max={LIMITS.footerLinks}
                  error={err(`footer.columns.${i}.links`)}
                  errorFor={(j) => err(`footer.columns.${i}.links.${j}`)}
                  addLabel="Add link"
                  onChange={(links) => update({ links })}
                />
              </>
            )}
          />
        </EditorSection>

        <EditorSection {...sectionProps('sections')} title="Section visibility" description="Hide whole sections (and their header links) without losing their content.">
          <div className="stack" style={{ gap: 4 }}>
            <CheckboxField label="Show Features" checked={sections.showFeatures} onChange={(e) => patch('sections', { showFeatures: e.target.checked })} />
            <CheckboxField label="Show Pricing" checked={sections.showPricing} onChange={(e) => patch('sections', { showPricing: e.target.checked })} />
            <CheckboxField label="Show Testimonials" checked={sections.showTestimonials} onChange={(e) => patch('sections', { showTestimonials: e.target.checked })} />
            <CheckboxField label="Show FAQ" checked={sections.showFaq} onChange={(e) => patch('sections', { showFaq: e.target.checked })} />
            <CheckboxField label="Show call-to-action banner" checked={sections.showCtaBanner} onChange={(e) => patch('sections', { showCtaBanner: e.target.checked })} />
          </div>
        </EditorSection>

        <EditorSection {...sectionProps('seo')} title="Search engine (SEO)" description="The browser tab title and the description search engines show.">
          <TextField label="Page title" maxLength={LIMITS.seoTitle} value={seo.title} error={err('seo.title')} onChange={(e) => patch('seo', { title: e.target.value })} />
          <TextAreaField
            label="Meta description"
            hint="Leave empty to keep the built-in description."
            rows={2}
            maxLength={LIMITS.seoDescription}
            value={seo.description}
            error={err('seo.description')}
            onChange={(e) => patch('seo', { description: e.target.value })}
          />
        </EditorSection>
      </div>

      <div className="form-actions-bar">
        <div className="row-between">
          <span className={dirty ? 'text-warning small strong' : 'text-subtle small'} role="status" aria-live="polite">
            {dirty ? 'You have unsaved changes' : 'All changes saved'}
          </span>
          <div className="row site-editor-actions">
            <Button
              variant="ghost"
              icon={<RotateCcw size={15} />}
              disabled={saveSubmit.submitting}
              onClick={() => {
                resetSubmit.reset();
                setConfirmingReset(true);
              }}
            >
              Reset to defaults
            </Button>
            <Button variant="secondary" icon={<Undo2 size={15} />} disabled={!dirty || saveSubmit.submitting} onClick={discard}>
              Discard changes
            </Button>
            <Button variant="primary" icon={<Save size={15} />} loading={saveSubmit.submitting} disabled={!dirty} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingReset}
        title="Reset website to defaults"
        message={
          <>
            <FormError message={resetSubmit.error} />
            <p>
              Replace all website content with the built-in defaults? This is published immediately and cannot be undone
              {dirty ? ' — your unsaved changes will also be lost' : ''}.
            </p>
          </>
        }
        confirmLabel="Reset to defaults"
        busy={resetSubmit.submitting}
        onConfirm={() => void reset()}
        onCancel={() => {
          if (!resetSubmit.submitting) setConfirmingReset(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Pricing plan fields
// ---------------------------------------------------------------------------

function priceValue(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

function parsePrice(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

interface PlanFieldsProps {
  plan: SitePricingPlan;
  base: string;
  err: (path: string) => string | undefined;
  update: (value: Partial<SitePricingPlan>) => void;
}

function PlanFields({ plan, base, err, update }: PlanFieldsProps) {
  return (
    <>
      <div className="form-grid">
        <TextField label="Plan name" required value={plan.name} error={err(`${base}.name`)} onChange={(e) => update({ name: e.target.value })} />
        <TextField label="Description" value={plan.description} error={err(`${base}.description`)} onChange={(e) => update({ description: e.target.value })} />
        <TextField
          label="Monthly price"
          type="number"
          inputMode="decimal"
          min={0}
          max={LIMITS.priceMax}
          step="any"
          required
          value={priceValue(plan.monthlyPrice)}
          error={err(`${base}.monthlyPrice`)}
          hint="Shown when the Monthly toggle is on"
          onChange={(e) => update({ monthlyPrice: parsePrice(e.target.value) })}
        />
        <TextField
          label="Annual price (per month)"
          type="number"
          inputMode="decimal"
          min={0}
          max={LIMITS.priceMax}
          step="any"
          required
          value={priceValue(plan.annualPrice)}
          error={err(`${base}.annualPrice`)}
          hint="Shown when the Annual toggle is on"
          onChange={(e) => update({ annualPrice: parsePrice(e.target.value) })}
        />
        <TextField label="Button label" value={plan.ctaLabel} error={err(`${base}.ctaLabel`)} onChange={(e) => update({ ctaLabel: e.target.value })} />
        <SelectField
          label="Button goes to"
          value={plan.ctaTarget}
          options={CTA_TARGET_OPTIONS}
          error={err(`${base}.ctaTarget`)}
          onChange={(e) => update({ ctaTarget: e.target.value as PlanCtaTarget })}
        />
      </div>
      <CheckboxField
        label="Most popular"
        hint="Highlights this plan with the badge and a primary button."
        checked={plan.popular}
        onChange={(e) => update({ popular: e.target.checked })}
      />
      <StringListEditor
        legend="Plan features"
        itemLabel={`${plan.name || 'Plan'} feature`}
        items={plan.features}
        max={LIMITS.planFeatures}
        error={err(`${base}.features`)}
        errorFor={(j) => err(`${base}.features.${j}`)}
        addLabel="Add feature"
        onChange={(features) => update({ features })}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

interface EditorSectionProps {
  id: SectionId;
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  errorCount: number;
  children: ReactNode;
}

/** A collapsible card. Collapsed content is unmounted (the draft lives in the page, so nothing is lost). */
function EditorSection({ id, title, description, open, onToggle, errorCount, children }: EditorSectionProps) {
  const panelId = `site-editor-${id}`;
  return (
    <section className={`card site-editor-section ${open ? 'is-open' : ''}`} aria-labelledby={`${panelId}-title`}>
      <h2 className="site-editor-heading" id={`${panelId}-title`}>
        <button type="button" className="site-editor-toggle" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={onToggle}>
          <ChevronRight size={16} className="site-editor-chevron" aria-hidden="true" />
          <span className="site-editor-heading-text">
            <span className="card-title">{title}</span>
            <span className="card-subtitle">{description}</span>
          </span>
          {errorCount > 0 ? <Badge tone="danger">{errorCount === 1 ? '1 issue' : `${errorCount} issues`}</Badge> : null}
        </button>
      </h2>
      {open ? (
        <div id={panelId} className="card-body stack">
          {children}
        </div>
      ) : null}
    </section>
  );
}

interface RowControlsProps {
  index: number;
  count: number;
  name: string;
  canRemove: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
}

function RowControls({ index, count, name, canRemove, onMove, onRemove }: RowControlsProps) {
  return (
    <span className="site-editor-row-controls">
      <Button variant="ghost" size="sm" icon={<ArrowUp size={14} />} disabled={index === 0} aria-label={`Move ${name} up`} title="Move up" onClick={() => onMove(index - 1)} />
      <Button
        variant="ghost"
        size="sm"
        icon={<ArrowDown size={14} />}
        disabled={index === count - 1}
        aria-label={`Move ${name} down`}
        title="Move down"
        onClick={() => onMove(index + 1)}
      />
      <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} disabled={!canRemove} aria-label={`Remove ${name}`} title="Remove" onClick={onRemove} />
    </span>
  );
}

function LimitNote({ count, max, min = 0 }: { count: number; max: number; min?: number }) {
  return (
    <span className={`site-editor-limit ${count > max || count < min ? 'is-over' : ''}`}>
      {count} of {max}
    </span>
  );
}

interface StringListEditorProps {
  legend: string;
  itemLabel: string;
  items: string[];
  max: number;
  error?: string;
  errorFor: (index: number) => string | undefined;
  addLabel: string;
  onChange: (items: string[]) => void;
}

function StringListEditor({ legend, itemLabel, items, max, error, errorFor, addLabel, onChange }: StringListEditorProps) {
  return (
    <fieldset className="site-editor-list">
      <legend className="site-editor-legend">
        {legend} <LimitNote count={items.length} max={max} />
      </legend>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? <p className="text-muted small site-editor-empty">None yet.</p> : null}
      {items.map((item, i) => (
        <div className="site-editor-string-row" key={i}>
          <TextField
            label={`${itemLabel} ${i + 1}`}
            value={item}
            error={errorFor(i)}
            onChange={(e) => onChange(replaceAt(items, i, e.target.value))}
          />
          <RowControls
            index={i}
            count={items.length}
            name={`${itemLabel} ${i + 1}`}
            canRemove
            onMove={(to) => onChange(moveItem(items, i, to))}
            onRemove={() => onChange(items.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} disabled={items.length >= max} onClick={() => onChange([...items, ''])}>
          {addLabel}
        </Button>
      </div>
    </fieldset>
  );
}

interface ItemListEditorProps<T> {
  legend: string;
  noun: string;
  items: T[];
  min?: number;
  max: number;
  error?: string;
  addLabel: string;
  newItem: () => T;
  titleOf: (item: T) => string;
  onChange: (items: T[]) => void;
  render: (item: T, index: number, update: (value: Partial<T>) => void) => ReactNode;
}

function ItemListEditor<T>({ legend, noun, items, min = 0, max, error, addLabel, newItem, titleOf, onChange, render }: ItemListEditorProps<T>) {
  return (
    <fieldset className="site-editor-list">
      <legend className="site-editor-legend">
        {legend} <LimitNote count={items.length} max={max} min={min} />
      </legend>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? <p className="text-muted small site-editor-empty">No {noun}s yet. Add one below.</p> : null}
      {items.map((item, i) => {
        const name = `${noun} ${i + 1}`;
        return (
          <div className="site-editor-item" key={i}>
            <div className="site-editor-item-head">
              <span className="strong site-editor-item-title">
                {i + 1}. {titleOf(item) || <span className="text-muted">Untitled {noun}</span>}
              </span>
              <RowControls
                index={i}
                count={items.length}
                name={name}
                canRemove={items.length > min}
                onMove={(to) => onChange(moveItem(items, i, to))}
                onRemove={() => onChange(items.filter((_, j) => j !== i))}
              />
            </div>
            <div className="stack">{render(item, i, (value) => onChange(replaceAt(items, i, { ...item, ...value })))}</div>
          </div>
        );
      })}
      <div>
        <Button variant="secondary" size="sm" icon={<Plus size={14} />} disabled={items.length >= max} onClick={() => onChange([...items, newItem()])}>
          {addLabel}
        </Button>
      </div>
    </fieldset>
  );
}
