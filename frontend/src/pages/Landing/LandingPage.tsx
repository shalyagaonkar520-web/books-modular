import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';

import { DEFAULT_PUBLIC_PLANS, fetchPublicPlans, type Cycle, type PublicPlans } from '@/api/plans';
import { DEFAULT_SITE_CONTENT, fetchPublicSiteContent, type SiteContent } from '@/api/siteContent';
import { CycleSwitch, PlanCards } from '@/pages/subscription/PlanCards';

import { FeatureShelf } from './FeatureShelf';
import { LEGAL_LINKS, LegalNavLinks } from './LegalPages';
import { PhoneShowcase } from './PhoneShowcase';


export function LandingPage() {
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<Cycle>('monthly');
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

  const { brand, nav, pricing, faq, ctaBanner, footer, sections, seo } = content;

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

      <PhoneShowcase />

      {sections.showPricing && (
        <section id="pricing" className="zb-landing-section">
          <div className="zb-section-heading text-center">
            <span className="zb-section-badge">{pricing.badge}</span>
            <h2 className="zb-section-title">{pricing.title}</h2>
            <p className="zb-section-desc">
              Start with a {plans.trialDays ?? 3}-day free trial, then pay by number of users. Every plan has every feature, plus a monthly allowance of AI requests.
            </p>
          </div>
          <div className="lp-plans stack">
            <CycleSwitch cycle={cycle} yearlyMonths={plans.yearlyMonths} onChange={setCycle} />
            <PlanCards plans={plans} cycle={cycle} onSelect={goToRegister} onTrial={goToRegister} />
          </div>
          <div className="lp-ai-note">
            <strong>How AI usage works</strong>
            <p>
              Quick answers (today's sales, low stock, pending invoices, stock lookups) are always free and unlimited. An <em>AI request</em> is one question the assistant has to understand, or one product photo it reads.
              A complex multi-step job counts as 3. Used up your allowance? Quick answers and Manual mode keep working, and it renews every month. You can also set budgets and switch AI off per person.
            </p>
          </div>
          <p className="lp-plan-note">Prices in Indian Rupees. Pay online by UPI, card or net banking; your plan starts as soon as you pay.</p>
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
