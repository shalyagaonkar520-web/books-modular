import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Zap,
  Building2,
  Receipt,
  Layers,
  BarChart3,
  Landmark,
  Clock,
  ChevronDown,
  Play,
  Star,
  Globe2,
  FileCheck,
  DollarSign,
  Lock,
  Cpu,
  Server
} from 'lucide-react';
import { formatINR } from '../../utils/currency';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
  onEnterDemo: () => void;
  isLoggedIn: boolean;
  userName?: string;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onEnterDemo,
  isLoggedIn,
  userName,
}) => {
  const [annualBilling, setAnnualBilling] = useState(true);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <div className="zb-landing-container">
      {/* Top Navbar */}
      <header className="zb-landing-nav">
        <div className="zb-landing-nav-inner">
          <div className="zb-landing-brand" onClick={onEnterDemo}>
            <span className="zb-landing-logo-icon">📚</span>
            <span className="zb-landing-brand-text">
              Rooman<strong>Books</strong>
            </span>
            <span className="zb-landing-badge">Enterprise Edition</span>
          </div>

          <nav className="zb-landing-links">
            <a href="#features" className="zb-landing-link">Features</a>
            <a href="#preview" className="zb-landing-link">Product Tour</a>
            <a href="#pricing" className="zb-landing-link">Pricing</a>
            <a href="#testimonials" className="zb-landing-link">Customers</a>
            <a href="#faq" className="zb-landing-link">FAQ</a>
          </nav>

          <div className="zb-landing-nav-actions">
            {isLoggedIn ? (
              <button className="zb-btn zb-btn-primary zb-btn-glow" onClick={onEnterDemo}>
                <span>Go to App ({userName || 'Dashboard'})</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button
                  className="zb-landing-btn-text"
                  onClick={() => onOpenAuth('login')}
                >
                  Sign In
                </button>
                <button
                  className="zb-btn zb-btn-primary zb-btn-glow"
                  onClick={onEnterDemo}
                >
                  <span>Get Started Free</span>
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="zb-hero-section">
        <div className="zb-hero-glow-bg"></div>
        <div className="zb-hero-content">
          <div className="zb-hero-pill">
            <Sparkles size={14} className="text-amber" />
            <span>Intelligent Automation • 100% GST Ready & Fully Unlocked</span>
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
            <button className="zb-btn zb-btn-primary zb-btn-lg zb-btn-glow" onClick={onEnterDemo}>
              <span>Launch Live Interactive App</span>
              <ArrowRight size={18} />
            </button>
            <button className="zb-btn zb-btn-outline-dark zb-btn-lg" onClick={() => onOpenAuth('login')}>
              <ShieldCheck size={18} className="text-primary" />
              <span>Fast 1-Click Demo Login</span>
            </button>
          </div>

          <div className="zb-hero-trust-row">
            <div className="zb-trust-item">
              <CheckCircle2 size={16} className="text-success" />
              <span>GST & e-Way Bill Compliant</span>
            </div>
            <div className="zb-trust-item">
              <CheckCircle2 size={16} className="text-success" />
              <span>Bank-Grade 256-Bit Security</span>
            </div>
            <div className="zb-trust-item">
              <CheckCircle2 size={16} className="text-success" />
              <span>All Modules Unlocked</span>
            </div>
          </div>
        </div>

        {/* Hero Interactive App Mockup */}
        <div className="zb-hero-mockup-wrapper">
          <div className="zb-mockup-card" onClick={onEnterDemo} title="Click to open live application">
            <div className="zb-mockup-header">
              <div className="zb-mockup-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <div className="zb-mockup-url">
                <span>https://books.rooman.com/dashboard/zylker-electronics</span>
              </div>
              <div className="zb-mockup-status">
                <span className="zb-status-dot online"></span>
                <span>Real-time Cloud Sync</span>
              </div>
            </div>

            <div className="zb-mockup-body">
              {/* Top KPI Snapshot in mockup */}
              <div className="zb-mockup-kpi-grid">
                <div className="zb-mockup-kpi">
                  <div className="label">Total Receivables</div>
                  <div className="val text-primary">{formatINR(985500)}</div>
                  <div className="trend text-success"><TrendingUp size={12} /> +24% YoY</div>
                </div>
                <div className="zb-mockup-kpi">
                  <div className="label">Inventory Value</div>
                  <div className="val text-dark">{formatINR(860400)}</div>
                  <div className="trend text-muted">5 tracked SKUs</div>
                </div>
                <div className="zb-mockup-kpi">
                  <div className="label">GST Input Tax Credit</div>
                  <div className="val text-success">{formatINR(128450)}</div>
                  <div className="trend text-success">GSTR-3B Ready</div>
                </div>
              </div>

              {/* Mini visual transaction table */}
              <div className="zb-mockup-table">
                <div className="zb-mockup-row head">
                  <span>Item / Description</span>
                  <span>Category</span>
                  <span>Price</span>
                  <span>Status</span>
                </div>
                <div className="zb-mockup-row">
                  <span className="font-semibold text-primary">Dell UltraSharp 27" 4K</span>
                  <span>Hardware</span>
                  <span>₹38,500</span>
                  <span className="badge in-stock">25 In Stock</span>
                </div>
                <div className="zb-mockup-row">
                  <span className="font-semibold text-primary">Web Application Dev</span>
                  <span>Software</span>
                  <span>₹2,500/hr</span>
                  <span className="badge active">Billable Active</span>
                </div>
                <div className="zb-mockup-row">
                  <span className="font-semibold text-primary">Tax Audit & Filing</span>
                  <span>Consulting</span>
                  <span>₹75,000</span>
                  <span className="badge filed">GST Reconciled</span>
                </div>
              </div>

              <div className="zb-mockup-banner">
                <span>🚀 Click anywhere to explore the full interactive application!</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid Section */}
      <section id="features" className="zb-landing-section zb-features-section">
        <div className="zb-section-heading text-center">
          <span className="zb-section-badge">EVERYTHING YOUR BUSINESS NEEDS</span>
          <h2 className="zb-section-title">Designed for Modern Finance Teams</h2>
          <p className="zb-section-desc">
            Replace fragmented spreadsheets and legacy accounting tools with an all-in-one financial operating system.
          </p>
        </div>

        <div className="zb-features-grid">
          <div className="zb-feature-card">
            <div className="zb-feature-icon-box bg-blue">
              <Receipt size={24} />
            </div>
            <h3 className="zb-feature-title">Smart Invoicing & GST</h3>
            <p className="zb-feature-text">
              Generate branded, compliant tax invoices with automatic HSN/SAC codes, CGST/SGST calculations, and WhatsApp delivery.
            </p>
          </div>

          <div className="zb-feature-card">
            <div className="zb-feature-icon-box bg-emerald">
              <Layers size={24} />
            </div>
            <h3 className="zb-feature-title">Real-Time Inventory Control</h3>
            <p className="zb-feature-text">
              Track stock levels, reorder thresholds, warehouse locations, and FIFO inventory valuation automatically.
            </p>
          </div>

          <div className="zb-feature-card">
            <div className="zb-feature-icon-box bg-purple">
              <Landmark size={24} />
            </div>
            <h3 className="zb-feature-title">Bank Feeds & Reconciliation</h3>
            <p className="zb-feature-text">
              Connect to Indian and international bank accounts. Automatically match ledger entries with live bank statements.
            </p>
          </div>

          <div className="zb-feature-card">
            <div className="zb-feature-icon-box bg-amber">
              <TrendingUp size={24} />
            </div>
            <h3 className="zb-feature-title">Cash Flow Forecasting</h3>
            <p className="zb-feature-text">
              Predict financial health with dynamic monthly projections, accounts receivable aging, and vendor commitment tracking.
            </p>
          </div>

          <div className="zb-feature-card">
            <div className="zb-feature-icon-box bg-rose">
              <FileCheck size={24} />
            </div>
            <h3 className="zb-feature-title">Audit-Ready Financials</h3>
            <p className="zb-feature-text">
              Generate 1-click Profit & Loss statements, Balance Sheets (Ind AS), and automated GSTR-1, 2B, and 3B returns.
            </p>
          </div>

          <div className="zb-feature-card">
            <div className="zb-feature-icon-box bg-cyan">
              <Zap size={24} />
            </div>
            <h3 className="zb-feature-title">High-Performance Cloud Infrastructure</h3>
            <p className="zb-feature-text">
              Sub-second transaction processing, 99.99% uptime reliability, automated daily backups, and bank-grade data security.
            </p>
          </div>
        </div>
      </section>

      {/* Why Choose Section (Replacing Tech Stack cards) */}
      <section id="preview" className="zb-landing-section zb-preview-section">
        <div className="zb-section-heading text-center">
          <span className="zb-section-badge">WHY CHOOSE ROOMAN BOOKS</span>
          <h2 className="zb-section-title">Engineered for Accuracy, Scalability & Compliance</h2>
          <p className="zb-section-desc">
            Empowering finance leaders with precision controls, multi-entity consolidation, and real-time auditability.
          </p>
        </div>

        <div className="zb-arch-grid">
          <div className="zb-arch-card">
            <div className="zb-arch-tag">AUTOMATION SUITE</div>
            <h4 className="zb-arch-title">Intelligent Financial Automation</h4>
            <p className="zb-arch-desc">
              Eliminate repetitive manual entry with smart invoice generation, automatic payment reconciliations, and tax calculations.
            </p>
            <ul className="zb-arch-list">
              <li><CheckCircle2 size={14} className="text-success" /> All 11 navigation modules unlocked & active</li>
              <li><CheckCircle2 size={14} className="text-success" /> Instant search, filter, and sort algorithms</li>
              <li><CheckCircle2 size={14} className="text-success" /> Automated recurring invoices & payment reminders</li>
            </ul>
          </div>

          <div className="zb-arch-card highlighted">
            <div className="zb-arch-tag highlighted">ENTERPRISE SECURITY</div>
            <h4 className="zb-arch-title">Bank-Grade Cloud Infrastructure</h4>
            <p className="zb-arch-desc">
              State-of-the-art encrypted data storage with ACID-compliant integrity, role-based permissions, and continuous backups.
            </p>
            <ul className="zb-arch-list">
              <li><CheckCircle2 size={14} className="text-success" /> End-to-end 256-bit encryption & TLS security</li>
              <li><CheckCircle2 size={14} className="text-success" /> Multi-entity Chart of Accounts & manual journals</li>
              <li><CheckCircle2 size={14} className="text-success" /> Continuous automated ledger backup & disaster recovery</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="zb-landing-section zb-pricing-section">
        <div className="zb-section-heading text-center">
          <span className="zb-section-badge">TRANSPARENT PRICING</span>
          <h2 className="zb-section-title">Simple Plans for Businesses of Any Scale</h2>
          <p className="zb-section-desc">Every plan grants access to all modules and features.</p>

          <div className="zb-pricing-toggle-wrap">
            <span className={!annualBilling ? 'active' : ''}>Monthly Billing</span>
            <button
              className={`zb-pricing-toggle ${annualBilling ? 'checked' : ''}`}
              onClick={() => setAnnualBilling(!annualBilling)}
            >
              <span className="toggle-thumb"></span>
            </button>
            <span className={annualBilling ? 'active' : ''}>
              Annual Billing <span className="discount-tag">Save 20%</span>
            </span>
          </div>
        </div>

        <div className="zb-pricing-grid">
          {/* Free Tier */}
          <div className="zb-pricing-card">
            <div className="zb-plan-header">
              <h3 className="zb-plan-name">Starter Plan</h3>
              <p className="zb-plan-desc">Essential accounting for freelancers and growing teams</p>
              <div className="zb-plan-price">
                <span className="currency">₹</span>
                <span className="amount">0</span>
                <span className="period">/forever</span>
              </div>
            </div>
            <ul className="zb-plan-features">
              <li><CheckCircle2 size={15} className="text-success" /> All modules unlocked with full access</li>
              <li><CheckCircle2 size={15} className="text-success" /> Secure cloud database persistence</li>
              <li><CheckCircle2 size={15} className="text-success" /> Full inventory and stock tracking</li>
              <li><CheckCircle2 size={15} className="text-success" /> Standard GST and tax reports</li>
            </ul>
            <button className="zb-btn zb-btn-outline-dark zb-btn-block" onClick={onEnterDemo}>
              Open Starter Application
            </button>
          </div>

          {/* Standard Tier (Popular) */}
          <div className="zb-pricing-card popular">
            <div className="zb-popular-badge">MOST POPULAR</div>
            <div className="zb-plan-header">
              <h3 className="zb-plan-name">Standard Business</h3>
              <p className="zb-plan-desc">Growing companies requiring complete multi-module control</p>
              <div className="zb-plan-price">
                <span className="currency">₹</span>
                <span className="amount">{annualBilling ? '749' : '899'}</span>
                <span className="period">/month</span>
              </div>
            </div>
            <ul className="zb-plan-features">
              <li><CheckCircle2 size={15} className="text-success" /> Unlimited invoices & vendor bills</li>
              <li><CheckCircle2 size={15} className="text-success" /> <strong>All 11 modules unlocked</strong></li>
              <li><CheckCircle2 size={15} className="text-success" /> Real-time bank feed reconciliation</li>
              <li><CheckCircle2 size={15} className="text-success" /> Multi-warehouse inventory tracking</li>
              <li><CheckCircle2 size={15} className="text-success" /> GSTR-1, 2B & 3B automated returns</li>
            </ul>
            <button className="zb-btn zb-btn-primary zb-btn-block zb-btn-glow" onClick={onEnterDemo}>
              Access Full Standard Plan
            </button>
          </div>

          {/* Professional Tier */}
          <div className="zb-pricing-card">
            <div className="zb-plan-header">
              <h3 className="zb-plan-name">Enterprise Professional</h3>
              <p className="zb-plan-desc">Large organizations with advanced audit and payroll needs</p>
              <div className="zb-plan-price">
                <span className="currency">₹</span>
                <span className="amount">{annualBilling ? '1,999' : '2,499'}</span>
                <span className="period">/month</span>
              </div>
            </div>
            <ul className="zb-plan-features">
              <li><CheckCircle2 size={15} className="text-success" /> Everything in Standard Business</li>
              <li><CheckCircle2 size={15} className="text-success" /> Custom chart of accounts & journals</li>
              <li><CheckCircle2 size={15} className="text-success" /> Dedicated accountant portal access</li>
              <li><CheckCircle2 size={15} className="text-success" /> Payroll & statutory compliance</li>
              <li><CheckCircle2 size={15} className="text-success" /> Priority 24/7 dedicated support</li>
            </ul>
            <button className="zb-btn zb-btn-outline-dark zb-btn-block" onClick={onEnterDemo}>
              Access Enterprise Plan
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="zb-landing-section zb-testimonials-section">
        <div className="zb-section-heading text-center">
          <span className="zb-section-badge">SOCIAL PROOF</span>
          <h2 className="zb-section-title">Trusted by Business Leaders</h2>
        </div>

        <div className="zb-testimonials-grid">
          <div className="zb-testimonial-card">
            <div className="zb-test-stars">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={16} fill="#f59e0b" color="#f59e0b" />
              ))}
            </div>
            <p className="zb-test-quote">
              "Rooman Books is blisteringly fast compared to traditional ERPs. Our inventory updates in milliseconds and GST returns take minutes instead of days."
            </p>
            <div className="zb-test-author">
              <div className="zb-test-avatar">RK</div>
              <div>
                <div className="zb-test-name">Rajesh Kumar</div>
                <div className="zb-test-role">CFO, Zylker Electronics</div>
              </div>
            </div>
          </div>

          <div className="zb-testimonial-card">
            <div className="zb-test-stars">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={16} fill="#f59e0b" color="#f59e0b" />
              ))}
            </div>
            <p className="zb-test-quote">
              "Having all modules completely unlocked with authentic double-entry journals and bank reconciliation gave our accounting team a seamless experience."
            </p>
            <div className="zb-test-author">
              <div className="zb-test-avatar">AM</div>
              <div>
                <div className="zb-test-name">Ananya Mehta</div>
                <div className="zb-test-role">Senior Chartered Accountant</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="zb-landing-section zb-faq-section">
        <div className="zb-section-heading text-center">
          <span className="zb-section-badge">QUESTIONS & ANSWERS</span>
          <h2 className="zb-section-title">Frequently Asked Questions</h2>
        </div>

        <div className="zb-faq-accordion">
          {[
            {
              q: 'How does Rooman Books ensure real-time speed and accuracy?',
              a: 'Rooman Books uses an asynchronous financial engine with in-memory caching and real-time ledger synchronization, ensuring instantaneous updates across sales, purchases, and banking.',
            },
            {
              q: 'Are all modules in the sidebar fully unlocked?',
              a: 'Yes! All locks have been removed. Every module—including Sales, Purchases, Banking, Time Tracking, Accountant, Reports, Documents, Payroll, and Payments—is 100% active and functional.',
            },
            {
              q: 'How does user access and authentication work?',
              a: 'You can sign up with any email, sign in with your password, or use the 1-click fast demo accounts (Administrator or Chief Accountant) for instant access without typing credentials.',
            },
            {
              q: 'How is my financial data protected?',
              a: 'Your financial transactions are encrypted with 256-bit bank-grade security and backed up continuously across secure redundant enterprise storage.',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className={`zb-faq-item ${activeFaq === idx ? 'open' : ''}`}
              onClick={() => toggleFaq(idx)}
            >
              <div className="zb-faq-question">
                <span>{item.q}</span>
                <ChevronDown size={18} className="zb-faq-chevron" />
              </div>
              {activeFaq === idx && <div className="zb-faq-answer">{item.a}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="zb-landing-cta-banner">
        <div className="zb-cta-banner-inner text-center">
          <h2 className="zb-cta-banner-title">Ready to Experience Modern Accounting?</h2>
          <p className="zb-cta-banner-sub">
            Join thousands of modern enterprises running their finances on Rooman Books.
          </p>
          <div className="zb-flex-align justify-center gap-3">
            <button className="zb-btn zb-btn-primary zb-btn-lg zb-btn-glow" onClick={onEnterDemo}>
              Open Live Application Now
            </button>
            <button className="zb-btn zb-btn-secondary zb-btn-lg" onClick={() => onOpenAuth('login')}>
              Sign In to Account
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="zb-landing-footer">
        <div className="zb-landing-footer-inner">
          <div className="zb-footer-brand">
            <span className="zb-footer-logo">📚</span>
            <span className="zb-footer-title">Rooman Books</span>
            <p className="zb-footer-text">
              Complete accounting and financial enterprise software for growing businesses.
            </p>
          </div>
          <div className="zb-footer-links-col">
            <h4>Modules</h4>
            <span>Invoicing & Sales</span>
            <span>Purchases & Bills</span>
            <span>Banking Reconciliation</span>
            <span>Inventory Tracking</span>
          </div>
          <div className="zb-footer-links-col">
            <h4>Compliance</h4>
            <span>GST Returns (GSTR-1, 3B)</span>
            <span>e-Way Bill Register</span>
            <span>TDS & Withholding</span>
            <span>Audit Trail</span>
          </div>
          <div className="zb-footer-links-col">
            <h4>Enterprise</h4>
            <span>Enterprise Integrations</span>
            <span>Security Architecture</span>
            <span>ISO 27001 Certified</span>
            <span>Audit Readiness</span>
          </div>
        </div>
        <div className="zb-footer-bottom">
          <span>© 2026 Rooman Books Pvt Ltd. All rights reserved.</span>
          <span>ISO 27001 Certified • Bank-Grade 256-bit Security</span>
        </div>
      </footer>
    </div>
  );
};
