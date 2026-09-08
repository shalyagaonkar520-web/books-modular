import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export function LandingPage() {
  const navigate = useNavigate();
  const [annualBilling, setAnnualBilling] = useState(true);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

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
            <img src="/rooman-logo.png" alt="Rooman" className="zb-landing-logo-img" />
            <span className="zb-landing-brand-text"><strong>Books</strong></span>
            <span className="zb-landing-badge">Enterprise Edition</span>
          </div>
          <nav className="zb-landing-links">
            <a href="#features" className="zb-landing-link">Features</a>
            <a href="#pricing" className="zb-landing-link">Pricing</a>
            <a href="#testimonials" className="zb-landing-link">Customers</a>
            <a href="#faq" className="zb-landing-link">FAQ</a>
          </nav>
          <div className="zb-landing-nav-actions">
            <button className="zb-landing-btn-text" onClick={goToLogin}>Log In</button>
            <button className="zb-btn zb-btn-primary zb-btn-glow" onClick={goToLogin}>
              <span>Access Rooman Books</span>
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
            <span>Intelligent Automation • 100% GST Ready &amp; Fully Unlocked</span>
            <span className="zb-pill-tag">New</span>
          </div>
          <h1 className="zb-hero-title">
            Intelligent Cloud Accounting for <br />
            <span className="zb-gradient-text">High-Velocity Businesses</span>
          </h1>
          <p className="zb-hero-subtitle">
            From smart GST e-invoicing to automated bank reconciliation and live inventory valuation.
            Experience accounting software engineered for precision, speed, and real-time business insights.
          </p>
          <div className="zb-hero-cta-group">
            <button className="zb-btn zb-btn-primary zb-btn-lg zb-btn-glow" onClick={goToLogin}>
              <span>Access Rooman Books</span>
              <ArrowRight size={18} />
            </button>
            <button className="zb-btn zb-btn-outline-dark zb-btn-lg" onClick={goToRegister}>
              <span>Create Organization</span>
            </button>
          </div>
          <div className="zb-hero-trust-row">
            <div className="zb-trust-item"><CheckCircle2 size={16} /><span>GST &amp; e-Way Bill Compliant</span></div>
            <div className="zb-trust-item"><CheckCircle2 size={16} /><span>Bank-Grade 256-Bit Security</span></div>
            <div className="zb-trust-item"><CheckCircle2 size={16} /><span>All Modules Unlocked</span></div>
          </div>
        </div>


      </section>

      <section id="features" className="zb-landing-section">
        <div className="zb-section-heading text-center">
          <span className="zb-section-badge">PLATFORM CAPABILITIES</span>
          <h2 className="zb-section-title">Every Financial Tool You Need</h2>
          <p className="zb-section-desc">A complete enterprise accounting suite with all modules fully unlocked and operational.</p>
        </div>
        <div className="zb-features-grid">
          {[
            { icon: <Receipt size={22} />, bg: 'bg-blue', title: 'Smart GST Invoicing', text: 'Generate GST-compliant tax invoices with e-Way Bill, HSN codes, and automated GSTR returns.' },
            { icon: <BarChart3 size={22} />, bg: 'bg-emerald', title: 'Financial Intelligence', text: 'Real-time P&L, Balance Sheet, and Cash Flow dashboards. Multi-currency forex, live inventory valuation.' },
            { icon: <Landmark size={22} />, bg: 'bg-purple', title: 'Bank Reconciliation', text: 'One-click auto-reconciliation against imported bank statements. Auto-match payments and deposits.' },
            { icon: <Zap size={22} />, bg: 'bg-amber', title: 'Automated Workflows', text: 'Invoice aging alerts, payment reminders, and approval workflows reduce manual follow-ups by 90%.' },
            { icon: <Globe2 size={22} />, bg: 'bg-rose', title: 'Multi-Entity Support', text: 'Manage multiple companies, branches, and cost centers from a single unified dashboard.' },
            { icon: <FileCheck size={22} />, bg: 'bg-cyan', title: 'Compliance Vault', text: 'Store and manage all statutory documents, GST filings, TDS certificates, and audit trail records securely.' },
            { icon: <Clock size={22} />, bg: 'bg-blue', title: 'Time & Billing', text: 'Track billable hours by project, auto-generate invoices from timesheets, and manage project profitability.' },
            { icon: <DollarSign size={22} />, bg: 'bg-emerald', title: 'Payroll Engine', text: 'Process payroll with PF/ESI/TDS deductions, generate payslips, and file returns automatically.' },
            { icon: <Layers size={22} />, bg: 'bg-purple', title: 'Inventory & Catalog', text: 'Real-time stock tracking with FIFO/LIFO/Weighted Average costing, reorder alerts, and batch/serial control.' },
          ].map((f, i) => (
            <div className="zb-feature-card" key={i}>
              <div className={`zb-feature-icon-box ${f.bg}`}>{f.icon}</div>
              <h3 className="zb-feature-title">{f.title}</h3>
              <p className="zb-feature-text">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="zb-landing-section">
        <div className="zb-section-heading text-center">
          <span className="zb-section-badge">SIMPLE PRICING</span>
          <h2 className="zb-section-title">Plans for Every Business Size</h2>
        </div>
        <div className="zb-pricing-toggle-wrap">
          <span className={!annualBilling ? 'active' : ''}>Monthly</span>
          <button className={`zb-pricing-toggle ${annualBilling ? 'checked' : ''}`} onClick={() => setAnnualBilling(!annualBilling)}>
            <span className="toggle-thumb"></span>
          </button>
          <span className={annualBilling ? 'active' : ''}>Annual <span className="discount-tag">Save 20%</span></span>
        </div>
        <div className="zb-pricing-grid">
          <div className="zb-pricing-card">
            <div><h3 className="zb-plan-name">Starter</h3>
              <p className="zb-plan-desc">Small businesses and freelancers getting started</p>
              <div className="zb-plan-price"><span className="currency">₹</span><span className="amount">{annualBilling ? '499' : '649'}</span><span className="period">/month</span></div></div>
            <ul className="zb-plan-features">
              <li><CheckCircle2 size={15} /> Up to 500 invoices/month</li>
              <li><CheckCircle2 size={15} /> GST returns filing</li>
              <li><CheckCircle2 size={15} /> Bank reconciliation</li>
              <li><CheckCircle2 size={15} /> 5 user seats</li>
            </ul>
            <button className="zb-btn zb-btn-outline-dark zb-btn-block" onClick={goToRegister}>Get Started Free</button>
          </div>
          <div className="zb-pricing-card popular">
            <div className="zb-popular-badge">MOST POPULAR</div>
            <div><h3 className="zb-plan-name">Standard Business</h3>
              <p className="zb-plan-desc">Growing businesses with full accounting needs</p>
              <div className="zb-plan-price"><span className="currency">₹</span><span className="amount">{annualBilling ? '999' : '1,249'}</span><span className="period">/month</span></div></div>
            <ul className="zb-plan-features">
              <li><CheckCircle2 size={15} /> Unlimited invoices &amp; bills</li>
              <li><CheckCircle2 size={15} /> Full inventory management</li>
              <li><CheckCircle2 size={15} /> Multi-currency &amp; forex</li>
              <li><CheckCircle2 size={15} /> GSTR-1, 2B &amp; 3B automated</li>
            </ul>
            <button className="zb-btn zb-btn-primary zb-btn-block zb-btn-glow" onClick={goToLogin}>Access Full Standard Plan</button>
          </div>
          <div className="zb-pricing-card">
            <div><h3 className="zb-plan-name">Enterprise Professional</h3>
              <p className="zb-plan-desc">Large organizations with advanced audit needs</p>
              <div className="zb-plan-price"><span className="currency">₹</span><span className="amount">{annualBilling ? '1,999' : '2,499'}</span><span className="period">/month</span></div></div>
            <ul className="zb-plan-features">
              <li><CheckCircle2 size={15} /> Everything in Standard</li>
              <li><CheckCircle2 size={15} /> Custom chart of accounts</li>
              <li><CheckCircle2 size={15} /> Payroll &amp; compliance</li>
              <li><CheckCircle2 size={15} /> Priority 24/7 support</li>
            </ul>
            <button className="zb-btn zb-btn-outline-dark zb-btn-block" onClick={goToLogin}>Access Enterprise Plan</button>
          </div>
        </div>
      </section>

      <section id="testimonials" className="zb-landing-section">
        <div className="zb-section-heading text-center">
          <span className="zb-section-badge">SOCIAL PROOF</span>
          <h2 className="zb-section-title">Trusted by Business Leaders</h2>
        </div>
        <div className="zb-testimonials-grid">
          {[
            { initials: 'RK', name: 'Rajesh Kumar', role: 'CFO, Zylker Electronics', quote: 'Rooman Books is blisteringly fast compared to traditional ERPs. Our inventory updates in milliseconds and GST returns take minutes instead of days.' },
            { initials: 'AM', name: 'Ananya Mehta', role: 'Senior Chartered Accountant', quote: 'Having all modules completely unlocked with authentic double-entry journals and bank reconciliation gave our accounting team a seamless experience.' },
          ].map((t, i) => (
            <div className="zb-testimonial-card" key={i}>
              <div className="zb-test-stars">{[...Array(5)].map((_, j) => <Star key={j} size={16} fill="#f59e0b" color="#f59e0b" />)}</div>
              <p className="zb-test-quote">&quot;{t.quote}&quot;</p>
              <div className="zb-test-author">
                <div className="zb-test-avatar">{t.initials}</div>
                <div><div className="zb-test-name">{t.name}</div><div className="zb-test-role">{t.role}</div></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="zb-landing-section">
        <div className="zb-section-heading text-center">
          <span className="zb-section-badge">QUESTIONS &amp; ANSWERS</span>
          <h2 className="zb-section-title">Frequently Asked Questions</h2>
        </div>
        <div className="zb-faq-accordion">
          {[
            { q: 'How does Rooman Books ensure real-time speed and accuracy?', a: 'Rooman Books uses an asynchronous financial engine with in-memory caching and real-time ledger synchronization.' },
            { q: 'Are all modules in the sidebar fully unlocked?', a: 'Yes! All locks have been removed. Every module is 100% active and functional.' },
            { q: 'How does user access and authentication work?', a: 'Click "Access Rooman Books" to go directly to the sign-in page. Sign in with your credentials or create a new organization account.' },
            { q: 'How is my financial data protected?', a: 'Your financial transactions are encrypted with 256-bit bank-grade security and backed up continuously.' },
          ].map((item, idx) => (
            <div key={idx} className={`zb-faq-item ${activeFaq === idx ? 'open' : ''}`} onClick={() => toggleFaq(idx)}>
              <div className="zb-faq-question"><span>{item.q}</span><ChevronDown size={18} className="zb-faq-chevron" /></div>
              {activeFaq === idx && <div className="zb-faq-answer">{item.a}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="zb-landing-cta-banner">
        <div className="zb-cta-banner-inner text-center">
          <h2 className="zb-cta-banner-title">Ready to Experience Modern Accounting?</h2>
          <p className="zb-cta-banner-sub">Join thousands of modern enterprises running their finances on Rooman Books.</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button className="zb-btn zb-btn-primary zb-btn-lg zb-btn-glow" onClick={goToLogin}>Access Rooman Books</button>
            <button className="zb-btn zb-btn-outline-dark zb-btn-lg" onClick={goToRegister}>Create Organization</button>
          </div>
        </div>
      </section>

      <footer className="zb-landing-footer">
        <div className="zb-landing-footer-inner">
          <div className="zb-footer-brand">
            <img src="/rooman-logo.png" alt="Rooman Books" className="zb-footer-logo-img" />
            <p className="zb-footer-text">Complete accounting and financial enterprise software for growing businesses.</p>
          </div>
          <div className="zb-footer-links-col"><h4>Modules</h4><span>Billing &amp; Receivables</span><span>Procurement &amp; Payables</span><span>Treasury &amp; Cash Flow</span><span>Inventory &amp; Catalog</span></div>
          <div className="zb-footer-links-col"><h4>Compliance</h4><span>GST Returns (GSTR-1, 3B)</span><span>e-Way Bill Register</span><span>TDS &amp; Withholding</span><span>Audit Trail</span></div>
          <div className="zb-footer-links-col"><h4>Enterprise</h4><span>Enterprise Integrations</span><span>Security Architecture</span><span>ISO 27001 Certified</span><span>Audit Readiness</span></div>
        </div>
        <div className="zb-footer-bottom">
          <span>© 2026 Rooman Books Pvt Ltd. All rights reserved.</span>
          <span>ISO 27001 Certified • Bank-Grade 256-bit Security</span>
        </div>
      </footer>
    </div>
  );
}
