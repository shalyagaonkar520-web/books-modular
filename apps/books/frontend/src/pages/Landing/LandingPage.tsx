import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Zap,
  Receipt,
  Layers,
  BarChart3,
  Landmark,
  Clock,
  ChevronDown,
  Star,
  Globe2,
  FileCheck,
  DollarSign,
} from 'lucide-react';

import { DEFAULT_SITE_CONTENT, fetchPublicSiteContent, type PlanCtaTarget, type SiteContent } from '@/api/siteContent';
import { initials } from '@/utils/format';

/** Feature cards cycle through these icons and tints in order. */
const FEATURE_LOOKS: Array<{ icon: ReactNode; bg: string }> = [
  { icon: <Receipt size={22} />, bg: 'bg-blue' },
  { icon: <BarChart3 size={22} />, bg: 'bg-emerald' },
  { icon: <Landmark size={22} />, bg: 'bg-purple' },
  { icon: <Zap size={22} />, bg: 'bg-amber' },
  { icon: <Globe2 size={22} />, bg: 'bg-rose' },
  { icon: <FileCheck size={22} />, bg: 'bg-cyan' },
  { icon: <Clock size={22} />, bg: 'bg-blue' },
  { icon: <DollarSign size={22} />, bg: 'bg-emerald' },
  { icon: <Layers size={22} />, bg: 'bg-purple' },
];

const formatPrice = (value: number) => (Number.isFinite(value) ? value.toLocaleString('en-IN') : '');

export function LandingPage() {
  const navigate = useNavigate();
  const [annualBilling, setAnnualBilling] = useState(true);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  // The bundled default renders immediately (no flash); the live content replaces it once loaded.
  const [content, setContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);

  useEffect(() => {
    const controller = new AbortController();
    void fetchPublicSiteContent(controller.signal).then((live) => {
      if (!controller.signal.aborted) setContent(live);
    });
    return () => controller.abort();
  }, []);

  const { brand, nav, hero, features, pricing, testimonials, faq, ctaBanner, footer, sections } = content;

  const goToLogin = () => navigate('/login');
  const goToRegister = () => navigate('/register');
  const goTo = (target: PlanCtaTarget) => (target === 'register' ? goToRegister() : goToLogin());

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <div className="zb-landing-container">
      <header className="zb-landing-nav">
        <div className="zb-landing-nav-inner">
          <div className="zb-landing-brand" onClick={goToLogin}>
            <img src="/rooman-logo.png" alt="Rooman" className="zb-landing-logo-img" />
            <span className="zb-landing-brand-text"><strong>Books</strong></span>
            {brand.badge && <span className="zb-landing-badge">{brand.badge}</span>}
          </div>
          <nav className="zb-landing-links">
            {sections.showFeatures && <a href="#features" className="zb-landing-link">Features</a>}
            {sections.showPricing && <a href="#pricing" className="zb-landing-link">Pricing</a>}
            {sections.showTestimonials && <a href="#testimonials" className="zb-landing-link">Customers</a>}
            {sections.showFaq && <a href="#faq" className="zb-landing-link">FAQ</a>}
          </nav>
          <div className="zb-landing-nav-actions">
            <button className="zb-landing-btn-text" onClick={goToLogin}>{nav.loginLabel}</button>
            <button className="zb-btn zb-btn-primary zb-btn-glow" onClick={goToLogin}>
              <span>{nav.ctaLabel}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <section className="zb-hero-section">
        <div className="zb-hero-glow-bg"></div>
        <div className="zb-hero-content">
          <div className="zb-hero-pill">
            <Sparkles size={14} />
            <span>{hero.pill}</span>
            {hero.pillTag && <span className="zb-pill-tag">{hero.pillTag}</span>}
          </div>
          <h1 className="zb-hero-title">
            {hero.titleLine1} <br />
            <span className="zb-gradient-text">{hero.titleHighlight}</span>
          </h1>
          <p className="zb-hero-subtitle">{hero.subtitle}</p>
          <div className="zb-hero-cta-group">
            <button className="zb-btn zb-btn-primary zb-btn-lg zb-btn-glow" onClick={goToLogin}>
              <span>{hero.primaryCta}</span>
              <ArrowRight size={18} />
            </button>
            <button className="zb-btn zb-btn-outline-dark zb-btn-lg" onClick={goToRegister}>
              <span>{hero.secondaryCta}</span>
            </button>
          </div>
          <div className="zb-hero-trust-row">
            {hero.trustItems.map((item, i) => (
              <div className="zb-trust-item" key={i}><CheckCircle2 size={16} /><span>{item}</span></div>
            ))}
          </div>
        </div>


      </section>

      {sections.showFeatures && (
        <section id="features" className="zb-landing-section">
          <div className="zb-section-heading text-center">
            <span className="zb-section-badge">{features.badge}</span>
            <h2 className="zb-section-title">{features.title}</h2>
            <p className="zb-section-desc">{features.description}</p>
          </div>
          <div className="zb-features-grid">
            {features.items.map((f, i) => {
              const look = FEATURE_LOOKS[i % FEATURE_LOOKS.length];
              return (
                <div className="zb-feature-card" key={i}>
                  <div className={`zb-feature-icon-box ${look.bg}`}>{look.icon}</div>
                  <h3 className="zb-feature-title">{f.title}</h3>
                  <p className="zb-feature-text">{f.text}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {sections.showPricing && (
        <section id="pricing" className="zb-landing-section">
          <div className="zb-section-heading text-center">
            <span className="zb-section-badge">{pricing.badge}</span>
            <h2 className="zb-section-title">{pricing.title}</h2>
          </div>
          <div className="zb-pricing-toggle-wrap">
            <span className={!annualBilling ? 'active' : ''}>{pricing.monthlyLabel}</span>
            <button className={`zb-pricing-toggle ${annualBilling ? 'checked' : ''}`} onClick={() => setAnnualBilling(!annualBilling)}>
              <span className="toggle-thumb"></span>
            </button>
            <span className={annualBilling ? 'active' : ''}>
              {pricing.annualLabel}
              {pricing.annualDiscountLabel && <> <span className="discount-tag">{pricing.annualDiscountLabel}</span></>}
            </span>
          </div>
          <div className="zb-pricing-grid">
            {pricing.plans.map((plan, i) => (
              <div className={`zb-pricing-card${plan.popular ? ' popular' : ''}`} key={i}>
                {plan.popular && <div className="zb-popular-badge">{pricing.popularLabel}</div>}
                <div><h3 className="zb-plan-name">{plan.name}</h3>
                  <p className="zb-plan-desc">{plan.description}</p>
                  <div className="zb-plan-price">
                    <span className="currency">{pricing.currencySymbol}</span>
                    <span className="amount">{formatPrice(annualBilling ? plan.annualPrice : plan.monthlyPrice)}</span>
                    <span className="period">{pricing.periodLabel}</span>
                  </div></div>
                <ul className="zb-plan-features">
                  {plan.features.map((feature, j) => (
                    <li key={j}><CheckCircle2 size={15} /> {feature}</li>
                  ))}
                </ul>
                <button
                  className={plan.popular ? 'zb-btn zb-btn-primary zb-btn-block zb-btn-glow' : 'zb-btn zb-btn-outline-dark zb-btn-block'}
                  onClick={() => goTo(plan.ctaTarget)}
                >
                  {plan.ctaLabel}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {sections.showTestimonials && (
        <section id="testimonials" className="zb-landing-section">
          <div className="zb-section-heading text-center">
            <span className="zb-section-badge">{testimonials.badge}</span>
            <h2 className="zb-section-title">{testimonials.title}</h2>
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
            <img src="/rooman-logo.png" alt="Rooman Books" className="zb-footer-logo-img" />
            <p className="zb-footer-text">{footer.tagline}</p>
          </div>
          {footer.columns.map((column, i) => (
            <div className="zb-footer-links-col" key={i}>
              <h4>{column.heading}</h4>
              {column.links.map((link, j) => <span key={j}>{link}</span>)}
            </div>
          ))}
        </div>
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
