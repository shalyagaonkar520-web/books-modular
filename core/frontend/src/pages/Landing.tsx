/**
 * Rooman One public landing page ("/"). Describes the suite as it is: Books
 * is live; the other apps are marked "Coming soon" or "Planned" until they
 * ship. No invented customers, figures or testimonials.
 */
import { ThemeToggle } from '@rooman/shell';
import { Hero } from '../hero/Hero';
import { appUrls } from '../config';
import '../landing.css';

type AppStatus = 'live' | 'soon' | 'planned';

interface SuiteApp {
  key: string;
  name: string;
  summary: string;
  points: string[];
  status: AppStatus;
}

const STATUS_LABEL: Record<AppStatus, string> = { live: 'Available now', soon: 'Coming soon', planned: 'Planned' };

const APPS: SuiteApp[] = [
  {
    key: 'books',
    name: 'Books',
    summary: 'Accounting built for Indian businesses.',
    points: ['GST invoices, e-Way Bill and UPI QR', 'Payments, bills, banking and ledger', 'Payroll, projects and document vault'],
    status: 'live',
  },
  {
    key: 'bookings',
    name: 'Bookings',
    summary: 'Appointments customers can book and pay for online.',
    points: ['Staff, services and availability', 'Public booking page with Razorpay', 'Paid visits invoiced in Books automatically'],
    status: 'soon',
  },
  {
    key: 'billing',
    name: 'Billing',
    summary: 'Recurring billing for your own customers.',
    points: ['Plans, subscriptions and usage', 'Automatic renewals and reminders', 'Every charge lands in Books'],
    status: 'planned',
  },
  {
    key: 'crm',
    name: 'CRM',
    summary: 'Leads, deals and follow-ups in one place.',
    points: ['Shares one customer list with every app', 'Sees invoices and bookings per customer', 'Workflow rules across apps'],
    status: 'planned',
  },
];

const STEPS = [
  {
    title: 'Sign in once',
    body: 'One account for your whole team. Move between apps without signing in again.',
  },
  {
    title: 'Use the apps your plan includes',
    body: 'Pick the apps and modules you need, monthly or yearly. Give each person access to exactly what their role needs.',
  },
  {
    title: 'Let the data flow',
    body: 'A customer added in one app is known to all of them. A paid booking becomes an invoice and a payment in Books, with no re-typing.',
  },
];

const INDIA = [
  { title: 'GST-ready', body: 'GST invoices, returns data and e-Way Bills with UPI QR codes.' },
  { title: 'Razorpay built in', body: 'Collect online and see payments matched against invoices.' },
  { title: 'Payroll and payslips', body: 'Run payroll and give staff their own portal for payslips.' },
  { title: 'Multi-currency', body: 'Invoice overseas customers and keep the ledger in rupees.' },
];

const TRUST = [
  { title: 'Your data stays yours', body: 'Every record is tied to your organization. No other business can ever see it.' },
  { title: 'Admin accounts protected', body: 'Two-step sign-in for administrators, and every admin action is recorded.' },
  { title: 'Backed up every night', body: 'Encrypted copies kept off-site, with restores tested regularly.' },
  { title: 'Records you can trust', body: 'GST records are never deleted. Corrections are logged, not overwritten.' },
];

export function Landing() {
  const urls = appUrls();
  const trialUrl = `${urls.books}/register`;

  return (
    <div className="lp">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <Hero trialUrl={trialUrl} />

      <main id="main">
        <section className="lp-section" id="apps" aria-labelledby="apps-title">
          <div className="lp-wrap">
            <h2 id="apps-title">The apps</h2>
            <p className="lp-section-lead">Each app does one job well. Together they share your team, your customers and your numbers.</p>
            <ul className="lp-apps">
              {APPS.map((app) => (
                <li key={app.key} className={`lp-app lp-app-${app.status}`}>
                  <div className="lp-app-head">
                    <AppIcon app={app.key} />
                    <h3>Rooman {app.name}</h3>
                    <span className={`lp-badge lp-badge-${app.status}`}>{STATUS_LABEL[app.status]}</span>
                  </div>
                  <p>{app.summary}</p>
                  <ul className="lp-points">
                    {app.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  {app.status === 'live' && (
                    <a className="lp-app-link" href={urls.books}>
                      Open Rooman {app.name} <span aria-hidden="true">→</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section lp-section-alt" id="how" aria-labelledby="how-title">
          <div className="lp-wrap">
            <h2 id="how-title">How it works</h2>
            <ol className="lp-steps">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="lp-step-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section" id="india" aria-labelledby="india-title">
          <div className="lp-wrap">
            <h2 id="india-title">Built for how India does business</h2>
            <ul className="lp-grid4">
              {INDIA.map((item) => (
                <li key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-section lp-section-alt" id="trust" aria-labelledby="trust-title">
          <div className="lp-wrap">
            <h2 id="trust-title">Secure by design</h2>
            <ul className="lp-grid4">
              {TRUST.map((item) => (
                <li key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-final" aria-labelledby="final-title">
          <div className="lp-wrap lp-final-inner">
            <div>
              <h2 id="final-title">Pay only for what you use.</h2>
              <p>Choose your apps and modules, monthly or yearly. Try everything free for 3 days first.</p>
            </div>
            <div className="lp-cta-row">
              <a className="lp-btn lp-btn-light lp-btn-lg" href={trialUrl}>
                Start free trial
              </a>
              <a className="lp-btn lp-btn-outline-light lp-btn-lg" href="/signin">
                Sign in
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span>© {new Date().getFullYear()} Rooman Technologies</span>
          <nav aria-label="Footer">
            <a href="#apps">Apps</a>
            <a href="#trust">Security</a>
            <a href="/signin">Sign in</a>
            <ThemeToggle />
          </nav>
        </div>
      </footer>
    </div>
  );
}

const ICON_PATHS: Record<string, string> = {
  books: 'M5 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H5zM19 7v13M8 8h6M8 12h6',
  bookings: 'M4 6h16v14H4zM4 10h16M9 3v5M15 3v5M8 14h3',
  billing: 'M4 7h16v11H4zM4 11h16M8 15h3M17 3l3 4M7 3 4 7',
  crm: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 6.5a3 3 0 0 1 0 5.6M18 14.6c1.8.6 3 2.4 3 5.4',
};

function AppIcon({ app }: { app: string }) {
  return (
    <span className={`lp-app-icon lp-app-icon-${app}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={ICON_PATHS[app]} />
      </svg>
    </span>
  );
}
