import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronDown, HardDrive, Settings2, Star, Users } from 'lucide-react';

import { DEFAULT_PUBLIC_PLANS, fetchPublicPlans, formatStorage, type PublicPlans } from '@/api/plans';
import { DEFAULT_SITE_CONTENT, fetchPublicSiteContent, type SiteContent } from '@/api/siteContent';
import { initials } from '@/utils/format';

import { FeatureShelf } from './FeatureShelf';
import { LEGAL_LINKS, LegalNavLinks } from './LegalPages';

const formatPrice = (value: number) => (Number.isFinite(value) ? value.toLocaleString('en-IN') : '');

export function LandingPage() {
  const navigate = useNavigate();
  const [annualBilling, setAnnualBilling] = useState(true);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  // The bundled default renders immediately (no flash); the live content replaces it once loaded.
  const [content, setContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  // The same plans as inside the app; the defaults show until the live ones arrive.
  const [plans, setPlans] = useState<PublicPlans>(DEFAULT_PUBLIC_PLANS);

  useEffect(() => {
    const controller = new AbortController();
    void fetchPublicSiteContent(controller.signal).then((live) => {
      if (!controller.signal.aborted) setContent(live);
    });
    void fetchPublicPlans(controller.signal).then((live) => {
      if (live && !controller.signal.aborted) setPlans(live);
    });
    return () => controller.abort();
  }, []);

  const { brand, nav, pricing, testimonials, faq, ctaBanner, footer, sections, seo } = content;

  // The tab title follows the editable SEO title while the landing page is mounted.
  useEffect(() => {
    if (!seo.title) return;
    const previous = document.title;
    document.title = seo.title;
    return () => {
      document.title = previous;
    };
  }, [seo.title]);

  // An empty SEO description keeps whatever index.html ships with.
  useEffect(() => {
    if (!seo.description) return;
    const existing =document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !existing;
    const meta = existing ?? document.createElement('meta');
    if (created) {
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    const previous = meta.content;
    meta.content = seo.description;
    return () => {
      if (created) meta.remove();
      else meta.content = previous;
    };
  }, [seo.description]);

  const goToLogin = () => navigate('/login');
  const goToRegister = () => navigate('/register');

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <div className="zb-landing-container">
      <header className="zb-landing-nav">
        <div className="zb-landing-nav-inner">
          <div className="zb-landing-brand" onClick={goToLogin}>
            <img src={brand.logoUrl} alt="Rooman" className="zb-landing-logo-img" />
            {brand.name && <span className="zb-landing-brand-text"><strong>{brand.name}</strong></span>}
            {brand.badge && <span className="zb-landing-badge">{brand.badge}</span>}
          </div>
          <LegalNavLinks />
          <div className="zb-landing-nav-actions">
            <button className="zb-landing-btn-text" onClick={goToLogin}>{nav.loginLabel}</button>
            <button className="zb-btn zb-btn-primary zb-btn-glow" onClick={goToRegister}>
              <span>{nav.ctaLabel}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <FeatureShelf onStart={goToRegister} />

      {sections.showPricing && (
        <section id="pricing" className="zb-landing-section">
          <div className="zb-section-heading text-center">
            <span className="zb-section-badge">{pricing.badge}</span>
            <h2 className="zb-section-title">{pricing.title}</h2>
            <p className="zb-section-desc">
              Plans by number of users, the same as inside the app. Every plan has every feature
              {plans.trialDays ? `, and every new organization starts with a ${plans.trialDays}-day free trial` : ''}.
            </p>
          </div>
          <div className="zb-pricing-toggle-wrap">
            <span className={!annualBilling ? 'active' : ''}>{pricing.monthlyLabel}</span>
            <button className={`zb-pricing-toggle ${annualBilling ? 'checked' : ''}`} onClick={() => setAnnualBilling(!annualBilling)} aria-label="Yearly billing">
              <span className="toggle-thumb"></span>
            </button>
            <span className={annualBilling ? 'active' : ''}>
              {pricing.annualLabel} <span className="discount-tag">Pay {plans.yearlyMonths} months, get 12</span>
            </span>
          </div>
          <div className="zb-pricing-grid lp-plans-grid">
            {plans.tiers.map((tier, i) => (
              <div className={`zb-pricing-card${i === 1 ? ' popular' : ''}`} key={tier.key}>
                {i === 1 && <div className="zb-popular-badge">{pricing.popularLabel}</div>}
                <div>
                  <h3 className="zb-plan-name">{tier.label}</h3>
                  <div className="zb-plan-price">
                    <span className="currency">₹</span>
                    <span className="amount">{formatPrice(annualBilling ? tier.monthly * plans.yearlyMonths : tier.monthly)}</span>
                    <span className="period">{annualBilling ? '/year' : '/month'}</span>
                  </div>
                </div>
                <div className="lp-plan-meta">
                  <span><Users size={16} /> Up to {tier.users.toLocaleString('en-IN')} users</span>
                  <span><HardDrive size={16} /> {formatStorage(tier.storageGb)} storage</span>
                  <span><CheckCircle2 size={16} /> Every feature</span>
                </div>
                <button
                  className={i === 1 ? 'zb-btn zb-btn-primary zb-btn-block zb-btn-glow' : 'zb-btn zb-btn-outline-dark zb-btn-block'}
                  onClick={goToRegister}
                >
                  Start free trial
                </button>
              </div>
            ))}
            <div className="zb-pricing-card">
              <div>
                <h3 className="zb-plan-name">Customize</h3>
                <div className="zb-plan-price">
                  <span className="period">from</span>
                  <span className="currency">₹</span>
                  <span className="amount">{formatPrice(plans.customMinimum)}</span>
                  <span className="period">/month</span>
                </div>
              </div>
              <div className="lp-plan-meta">
                <span><Settings2 size={16} /> Your users, your features</span>
                <span><HardDrive size={16} /> Storage of the plan your users fit in</span>
                <span><Users size={16} /> ₹{formatPrice(plans.per100Over)} per 100 users above {formatPrice(plans.tiers[plans.tiers.length - 1]?.users ?? 1000)}</span>
              </div>
              <button className="zb-btn zb-btn-outline-dark zb-btn-block" onClick={goToRegister}>
                Start free trial
              </button>
            </div>
          </div>
          <p className="lp-plan-note">Prices in Indian Rupees. Pay online by UPI, card or net banking; your plan starts as soon as you pay.</p>
        </section>
      )}

      {sections.showTestimonials && (
        <section id="testimonials" className="zb-landing-section">
          <div className="zb-section-heading text-center">
            <span className="zb-section-badge">{testimonials.badge}</span>
            <h2 className="zb-section-title">{testimonials.title}</h2>
            {testimonials.description && <p className="zb-section-desc">{testimonials.description}</p>}
          </div>
          <div className="zb-testimonials-grid">
            {testimonials.items.map((t, i) => (
              <div className="zb-testimonial-card" key={i}>
                <div className="zb-test-stars">{[...Array(5)].map((_, j) => <Star key={j} size={16} fill="#f59e0b" color="#f59e0b" />)}</div>
                <p className="zb-test-quote">&quot;{t.quote}&quot;</p>
                <div className="zb-test-author">
                  <div className="zb-test-avatar">{initials(t.name)}</div>
                  <div><div className="zb-test-name">{t.name}</div><div className="zb-test-role">{t.role}</div></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sections.showFaq && (
        <section id="faq" className="zb-landing-section">
          <div className="zb-section-heading text-center">
            <span className="zb-section-badge">{faq.badge}</span>
            <h2 className="zb-section-title">{faq.title}</h2>
            {faq.description && <p className="zb-section-desc">{faq.description}</p>}
          </div>
          <div className="zb-faq-accordion">
            {faq.items.map((item, idx) => (
              <div key={idx} className={`zb-faq-item ${activeFaq === idx ? 'open' : ''}`} onClick={() => toggleFaq(idx)}>
                <div className="zb-faq-question"><span>{item.question}</span><ChevronDown size={18} className="zb-faq-chevron" /></div>
                {activeFaq === idx && <div className="zb-faq-answer">{item.answer}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {sections.showCtaBanner && (
        <section className="zb-landing-cta-banner">
          <div className="zb-cta-banner-inner text-center">
            <h2 className="zb-cta-banner-title">{ctaBanner.title}</h2>
            <p className="zb-cta-banner-sub">{ctaBanner.subtitle}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button className="zb-btn zb-btn-primary zb-btn-lg zb-btn-glow" onClick={goToLogin}>{ctaBanner.primaryCta}</button>
              <button className="zb-btn zb-btn-outline-dark zb-btn-lg" onClick={goToRegister}>{ctaBanner.secondaryCta}</button>
            </div>
          </div>
        </section>
      )}

      <footer className="zb-landing-footer">
        <div className="zb-landing-footer-inner">
          <div className="zb-footer-brand">
            <img src={brand.logoUrl} alt="Rooman Books" className="zb-footer-logo-img" />
            <p className="zb-footer-text">{footer.tagline}</p>
          </div>
          {footer.columns.map((column, i) => (
            <div className="zb-footer-links-col" key={i}>
              <h4>{column.heading}</h4>
              {column.links.map((link, j) => <span key={j}>{link}</span>)}
            </div>
          ))}
        </div>
        <nav className="zb-footer-legal" aria-label="Policies">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="zb-footer-bottom">
          <span>{footer.copyright}</span>
          <span>
            {footer.bottomNote} · <Link to="/platform" style={{ color: 'inherit', textDecoration: 'underline' }}>Platform Admin</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
