/**
 * Public policy pages linked from the landing page footer: terms, privacy,
 * refunds, delivery and contact. Payment gateways (Razorpay) check that these
 * exist before activating the account, so they need no login.
 */
import type { ReactNode } from 'react';
import { FileText, Phone, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

export const COMPANY = {
  name: 'Rooman Technologies',
  product: 'Rooman Books',
  address: 'Electronic City, Bengaluru, Karnataka, India',
  phone: '+91 74831 87572',
  phoneHref: 'tel:+917483187572',
  email: 'shalya@rooman.com',
};

const UPDATED = '30 October 2026';

export const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms & Conditions', icon: FileText },
  { to: '/privacy', label: 'Privacy Policy', icon: ShieldCheck },
  { to: '/refund-policy', label: 'Refund & Cancellation', icon: RotateCcw },
  { to: '/shipping-policy', label: 'Shipping & Delivery', icon: Truck },
  { to: '/contact', label: 'Contact Us', icon: Phone },
];

/** The policy links in the header of every public page (payment gateways look for them). */
export function LegalNavLinks() {
  return (
    <nav className="legal-navlinks" aria-label="Policies">
      {LEGAL_LINKS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end>
          <Icon size={15} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="zb-landing-container">
      <header className="zb-landing-nav">
        <div className="zb-landing-nav-inner">
          <Link to="/" className="zb-landing-brand">
            <img src="/rooman-logo.png" alt="Rooman" className="zb-landing-logo-img" />
            <span className="zb-landing-brand-text">
              <strong>Books</strong>
            </span>
          </Link>
          <LegalNavLinks />
          <div className="zb-landing-nav-actions">
            <Link to="/login" className="zb-btn zb-btn-primary">
              Sign in
            </Link>
          </div>
        </div>
      </header>
      <main className="legal-page">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {UPDATED}</p>
        {children}
      </main>
      <LegalFooter />
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="Policies">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.to} to={link.to}>
            {link.label}
          </Link>
        ))}
      </nav>
      <span>
        © 2026 {COMPANY.name}. {COMPANY.address}
      </span>
    </footer>
  );
}

function ContactLines() {
  return (
    <ul>
      <li>
        Email: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </li>
      <li>
        Phone: <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
      </li>
      <li>Address: {COMPANY.name}, {COMPANY.address}</li>
    </ul>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions">
      <p>
        These terms govern your use of {COMPANY.product}, an online accounting, billing and GST software service run by {COMPANY.name} ("we", "us").
        By creating an account or using the service you agree to them.
      </p>
      <h2>1. The service</h2>
      <p>
        {COMPANY.product} is software you use in your web browser. We give you access to it for as long as your free trial or paid plan lasts. We
        may improve, change or add features from time to time.
      </p>
      <h2>2. Your account</h2>
      <p>
        You must give correct details when you sign up and keep your password safe. You are responsible for everything done through your
        organization's account, including by users you invite. Tell us at once if you think someone has used your account without permission.
      </p>
      <h2>3. Plans and payment</h2>
      <p>
        New organizations get a free trial. After the trial you need a paid plan to keep using the service. Plans are priced by the number of
        users and are paid monthly or yearly, in advance, in Indian Rupees, through our payment partner Razorpay. Your plan starts as soon as
        the payment is confirmed. Prices include or show GST as applicable. We may change prices for future periods and will tell you before
        a change applies to you.
      </p>
      <h2>4. Your data</h2>
      <p>
        The business data you enter (invoices, customers, accounts and so on) belongs to you. We store and process it only to provide the
        service, as described in our <Link to="/privacy">Privacy Policy</Link>. You can export your data at any time while your account is
        active.
      </p>
      <h2>5. Acceptable use</h2>
      <p>
        Do not use the service for anything unlawful, to send spam, to break into or disrupt our systems, or to store content you have no
        right to. We may suspend an account that does.
      </p>
      <h2>6. Availability and liability</h2>
      <p>
        We work to keep the service running and your data backed up, but we cannot promise it will never be interrupted. You are responsible
        for checking the accounts, tax returns and filings you prepare with it. To the extent the law allows, our total liability to you is
        limited to the amount you paid us in the 12 months before the claim.
      </p>
      <h2>7. Ending the service</h2>
      <p>
        You can stop using the service at any time; see our <Link to="/refund-policy">Refund & Cancellation Policy</Link>. We may end or suspend
        access if these terms are broken.
      </p>
      <h2>8. Law</h2>
      <p>These terms are governed by the laws of India. Courts in Bengaluru, Karnataka have jurisdiction.</p>
      <h2>9. Contact</h2>
      <ContactLines />
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This policy explains what information {COMPANY.name} collects when you use {COMPANY.product} and how we use and protect it.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address, phone number, organization name and GSTIN.</li>
        <li>Business data you enter: customers, vendors, items, invoices, bills, payments and other accounting records.</li>
        <li>Usage data: sign-in times, IP address, browser and device, used for security and to improve the service.</li>
        <li>
          Payment details: payments are handled by Razorpay. We receive the payment status and reference, never your full card or bank
          details.
        </li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To provide the service, sign you in and keep your account secure.</li>
        <li>To send emails you need, such as sign-in codes, invoices you send and plan reminders.</li>
        <li>To bill you for your plan and keep the records the law requires.</li>
        <li>To answer your support requests.</li>
      </ul>
      <h2>Sharing</h2>
      <p>
        We do not sell your data. We share it only with service providers that help us run the service (hosting, email delivery and payment
        processing), under confidentiality, or when the law requires it.
      </p>
      <h2>Security and storage</h2>
      <p>
        Data is sent over encrypted connections (HTTPS), passwords are stored hashed, and access inside your organization is controlled by
        roles. We keep your data while your account is active and as long as the law requires afterwards.
      </p>
      <h2>Your choices</h2>
      <p>
        You can view, correct and export your data in the app. To delete your account or ask about your data, contact us below.
      </p>
      <h2>Contact</h2>
      <ContactLines />
    </LegalLayout>
  );
}

export function RefundPolicyPage() {
  return (
    <LegalLayout title="Refund & Cancellation Policy">
      <h2>Free trial</h2>
      <p>Every new organization gets a free trial. No payment is taken during the trial.</p>
      <h2>Cancellation</h2>
      <p>
        Plans are prepaid for a month or a year and do not renew automatically: you choose to pay for each new period. You can stop using the
        service at any time; your plan stays active until the end of the period you paid for.
      </p>
      <h2>Refunds</h2>
      <ul>
        <li>If you were charged twice, or charged but your plan did not start, we refund the extra or failed amount in full.</li>
        <li>
          If you are not satisfied, you can ask for a full refund within 7 days of your first payment for a plan. Write to us with your
          organization name and payment reference.
        </li>
        <li>Apart from the above, payments for a period that has already started are not refunded.</li>
      </ul>
      <h2>How refunds are paid</h2>
      <p>
        Approved refunds are made to the original payment method (UPI, card, net banking or wallet) through Razorpay within 5–7 working days.
        Your bank may take a few more days to show it.
      </p>
      <h2>Contact</h2>
      <ContactLines />
    </LegalLayout>
  );
}

export function ShippingPolicyPage() {
  return (
    <LegalLayout title="Shipping & Delivery Policy">
      <p>
        {COMPANY.product} is online software. Nothing physical is shipped, and there are no shipping charges.
      </p>
      <h2>Delivery</h2>
      <ul>
        <li>The service is delivered online, through your web browser, at the address where you sign in.</li>
        <li>Your account is ready as soon as you sign up, and your free trial starts at once.</li>
        <li>
          A paid plan starts as soon as the payment is confirmed, usually within a few seconds. You will see it under Plan in the Admin
          console and receive a confirmation.
        </li>
      </ul>
      <h2>If your plan did not start</h2>
      <p>
        If you paid but your plan is not active within 1 hour, contact us with your payment reference and we will activate it or refund you.
      </p>
      <h2>Contact</h2>
      <ContactLines />
    </LegalLayout>
  );
}

export function ContactPage() {
  return (
    <LegalLayout title="Contact Us">
      <p>We are happy to help with sign-up, plans, payments, refunds or anything else about {COMPANY.product}.</p>
      <div className="legal-contact">
        <div>
          <h2>Company</h2>
          <p>{COMPANY.name}</p>
        </div>
        <div>
          <h2>Address</h2>
          <p>{COMPANY.address}</p>
        </div>
        <div>
          <h2>Phone</h2>
          <p>
            <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
          </p>
        </div>
        <div>
          <h2>Email</h2>
          <p>
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
          </p>
        </div>
      </div>
      <p>We reply on working days (Monday to Saturday, 10 am to 6 pm IST), usually within one working day.</p>
      <p>
        Signed-in users can also open a request from <strong>Support</strong> in the app.
      </p>
    </LegalLayout>
  );
}
