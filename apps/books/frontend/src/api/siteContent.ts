/**
 * The public website's editable content (landing page copy, pricing, FAQ, …).
 *
 * The shape mirrors backend/content/site_content_default.json exactly; a copy of
 * that document is bundled so the landing page renders instantly (and still
 * renders when the API is unreachable).
 */
import defaultContentJson from '@/content/siteContentDefault.json';

export type PlanCtaTarget = 'register' | 'login';

export interface SiteFeatureItem {
  title: string;
  text: string;
}

export interface SitePricingPlan {
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  ctaLabel: string;
  ctaTarget: PlanCtaTarget;
  popular: boolean;
}

export interface SiteTestimonial {
  name: string;
  role: string;
  quote: string;
}

export interface SiteFaqItem {
  question: string;
  answer: string;
}

export interface SiteFooterColumn {
  heading: string;
  links: string[];
}

export interface SiteContent {
  brand: { badge: string };
  nav: { loginLabel: string; ctaLabel: string };
  hero: {
    pill: string;
    pillTag: string;
    titleLine1: string;
    titleHighlight: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    trustItems: string[];
  };
  features: { badge: string; title: string; description: string; items: SiteFeatureItem[] };
  pricing: {
    badge: string;
    title: string;
    monthlyLabel: string;
    annualLabel: string;
    annualDiscountLabel: string;
    currencySymbol: string;
    periodLabel: string;
    popularLabel: string;
    plans: SitePricingPlan[];
  };
  testimonials: { badge: string; title: string; items: SiteTestimonial[] };
  faq: { badge: string; title: string; items: SiteFaqItem[] };
  ctaBanner: { title: string; subtitle: string; primaryCta: string; secondaryCta: string };
  footer: { tagline: string; columns: SiteFooterColumn[]; copyright: string; bottomNote: string };
  sections: {
    showFeatures: boolean;
    showPricing: boolean;
    showTestimonials: boolean;
    showFaq: boolean;
    showCtaBanner: boolean;
  };
}

/** The bundled defaults (identical to the backend's default document). */
export const DEFAULT_SITE_CONTENT = defaultContentJson as SiteContent;

/** Limits the backend enforces; mirrored so the editor can flag them before saving. */
export const SITE_CONTENT_LIMITS = {
  trustItems: 6,
  featureItems: 18,
  plansMin: 1,
  plansMax: 6,
  priceMax: 10_000_000,
  planFeatures: 12,
  testimonials: 9,
  faq: 20,
  footerColumns: 4,
  footerLinks: 8,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Section-by-section merge over the defaults, so a partial or stale document never crashes a renderer. */
export function normalizeSiteContent(raw: unknown): SiteContent {
  if (!isRecord(raw)) return DEFAULT_SITE_CONTENT;
  const result = { ...DEFAULT_SITE_CONTENT } as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(DEFAULT_SITE_CONTENT)) {
    const value = raw[key];
    if (!isRecord(value)) continue;
    const merged: Record<string, unknown> = { ...(fallback as Record<string, unknown>) };
    for (const [field, fallbackField] of Object.entries(fallback as Record<string, unknown>)) {
      const candidate = value[field];
      if (candidate === undefined || candidate === null) continue;
      if (Array.isArray(fallbackField) ? Array.isArray(candidate) : typeof candidate === typeof fallbackField) {
        merged[field] = candidate;
      }
    }
    result[key] = merged;
  }
  return result as unknown as SiteContent;
}

/**
 * Public, unauthenticated read used by the landing page. Never throws: any
 * failure (network, non-2xx, bad JSON) falls back to the bundled default.
 */
export async function fetchPublicSiteContent(signal?: AbortSignal): Promise<SiteContent> {
  try {
    const response = await fetch('/api/public/site-content', { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return DEFAULT_SITE_CONTENT;
    return normalizeSiteContent(await response.json());
  } catch {
    return DEFAULT_SITE_CONTENT;
  }
}

function checkCount(errors: Record<string, string>, path: string, count: number, max: number, noun: string) {
  if (count > max) errors[path] = `Up to ${max} ${noun} allowed (currently ${count}).`;
}

/**
 * Client-side checks mirroring the backend limits. Keys are dotted paths
 * (`pricing.plans.0.monthlyPrice`), the same form the API's 422 errors map to.
 */
export function validateSiteContent(content: SiteContent): Record<string, string> {
  const errors: Record<string, string> = {};
  const L = SITE_CONTENT_LIMITS;

  checkCount(errors, 'hero.trustItems', content.hero.trustItems.length, L.trustItems, 'trust items');
  checkCount(errors, 'features.items', content.features.items.length, L.featureItems, 'features');
  checkCount(errors, 'testimonials.items', content.testimonials.items.length, L.testimonials, 'testimonials');
  checkCount(errors, 'faq.items', content.faq.items.length, L.faq, 'questions');
  checkCount(errors, 'footer.columns', content.footer.columns.length, L.footerColumns, 'columns');

  const plans = content.pricing.plans;
  if (plans.length < L.plansMin) errors['pricing.plans'] = 'Add at least one plan.';
  checkCount(errors, 'pricing.plans', plans.length, L.plansMax, 'plans');
  plans.forEach((plan, index) => {
    const base = `pricing.plans.${index}`;
    if (!plan.name.trim()) errors[`${base}.name`] = 'Give the plan a name.';
    for (const key of ['monthlyPrice', 'annualPrice'] as const) {
      const price = plan[key];
      if (!Number.isFinite(price) || price < 0 || price > L.priceMax) {
        errors[`${base}.${key}`] = `Enter a price between 0 and ${L.priceMax.toLocaleString('en-IN')}.`;
      }
    }
    checkCount(errors, `${base}.features`, plan.features.length, L.planFeatures, 'features');
  });

  content.footer.columns.forEach((column, index) => {
    checkCount(errors, `footer.columns.${index}.links`, column.links.length, L.footerLinks, 'links');
  });

  return errors;
}
