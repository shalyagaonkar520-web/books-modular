/**
 * Rooman One public landing page ("/"). One dark composition from top to
 * bottom: the hero, then sections in the same language (glass panels with a
 * foot-light, cyan tiles, heavy uppercase headings) that reveal as they
 * scroll into view. Describes the suite as it is: Books is live; the other
 * apps are marked "Coming soon" or "Planned". No invented customers or quotes.
 */
import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { CardCylinder } from '../cylinder/CardCylinder';
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
  { icon: 'gst', title: 'GST-ready', body: 'GST invoices, returns data and e-Way Bills with UPI QR codes.' },
  { icon: 'pay', title: 'Razorpay built in', body: 'Collect online and see payments matched against invoices.' },
  { icon: 'payroll', title: 'Payroll and payslips', body: 'Run payroll and give staff their own portal for payslips.' },
  { icon: 'fx', title: 'Multi-currency', body: 'Invoice overseas customers and keep the ledger in rupees.' },
];

const TRUST = [
  { icon: 'lock', title: 'Your data stays yours', body: 'Every record is tied to your organization. No other business can ever see it.' },
  { icon: 'key', title: 'Admin accounts protected', body: 'Two-step sign-in for administrators, and every admin action is recorded.' },
  { icon: 'backup', title: 'Backed up every night', body: 'Encrypted copies kept off-site, with restores tested regularly.' },
  { icon: 'ledger', title: 'Records you can trust', body: 'GST records are never deleted. Corrections are logged, not overwritten.' },
];

/** Reveal-on-scroll. Content is only hidden once JS has armed it, so it can never be stranded invisible. */
function useReveal(root: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'));
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver !== 'function') {
      items.forEach((item) => item.classList.add('in'));
      return;
    }
    el.classList.add('lp-anim');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [root]);
}

/** A field of stars for the whole page, drawn as two box-shadow lists like the hero's. */
function useSky(sky: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const el = sky.current;
    if (!el) return;
    const layer = (count: number, blur: number, aMin: number, aMax: number) =>
      Array.from({ length: count }, () => {
        const a = (aMin + Math.random() * (aMax - aMin)).toFixed(3);
        return `${(Math.random() * 100).toFixed(2)}vw ${(Math.random() * 100).toFixed(2)}vh ${blur}px 0 rgba(255,255,255,${a})`;
      }).join(',');
    const [a, b] = Array.from(el.children) as HTMLElement[];
    a.style.boxShadow = layer(120, 0, 0.04, 0.24);
    b.style.boxShadow = layer(14, 1.2, 0.3, 0.6);
  }, [sky]);
}

const delay = (i: number) => ({ '--d': `${i * 90}ms` }) as CSSProperties;

function SectionHead({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="lp-head" data-reveal>
      <p className="lp-eyebrow">
        <i aria-hidden="true">
          <svg viewBox="5 1 14 22" preserveAspectRatio="none">
            <path
              d="M13.9 1.6 5.5 13.6a.7.7 0 0 0 .6 1.1h4.2l-1 7.7a.7.7 0 0 0 1.25.55l8.3-12.1a.7.7 0 0 0-.6-1.1h-4.2l1-7.7a.7.7 0 0 0-1.25-.55Z"
              fill="rgba(16,112,152,.72)"
              stroke="rgba(190,236,255,.6)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </i>
        {eyebrow}
      </p>
      <h2 id={id} className="lp-h2">
        {title}
      </h2>
      {lead && (
        <p className="lp-lead">
          {lead}
        </p>
      )}
    </div>
  );
}

export function Landing() {
  const urls = appUrls();
  const trialUrl = `${urls.books}/register`;
  const rootRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);
  useSky(skyRef);

  return (
    <div className="lp" ref={rootRef}>
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <div className="lp-sky" ref={skyRef} aria-hidden="true">
        <i />
        <i />
      </div>

      <Hero trialUrl={trialUrl} />

      <main id="main">
        <section className="lp-section" id="apps" aria-labelledby="apps-title">
          <div className="lp-wrap">
            <SectionHead id="apps-title" eyebrow="The suite" title="The apps" lead="Each app does one job well. Together they share your team, your customers and your numbers." />
            <ul className="lp-apps">
              {APPS.map((app, i) => (
                <li key={app.key} className={`lp-panel lp-app lp-app-${app.status}`} data-reveal style={delay(i)}>
                  <div className="lp-app-head">
                    <Tile icon={app.key} />
                    <h3>Rooman {app.name}</h3>
                  </div>
                  <span className={`lp-status lp-status-${app.status}`}>{STATUS_LABEL[app.status]}</span>
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

        <section className="lp-section lp-pay" id="payments" aria-labelledby="pay-title">
          <div className="lp-wrap">
            <SectionHead
              id="pay-title"
              eyebrow="Payments"
              title="Every card, one ledger"
              lead="Customers pay by card or UPI through Razorpay. Every payment lands in Books, matched to its invoice."
            />
          </div>
        </section>
        <CardCylinder />

        <section className="lp-section" id="how" aria-labelledby="how-title">
          <div className="lp-wrap">
            <SectionHead id="how-title" eyebrow="Three steps" title="How it works" />
            <ol className="lp-steps">
              {STEPS.map((step, index) => (
                <li key={step.title} className="lp-panel" data-reveal style={delay(index)}>
                  <span className="lp-step-num" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
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
            <SectionHead id="india-title" eyebrow="Made for India" title="Built for how India does business" />
            <Features items={INDIA} />
          </div>
        </section>

        <section className="lp-section" id="trust" aria-labelledby="trust-title">
          <div className="lp-wrap">
            <SectionHead id="trust-title" eyebrow="Security" title="Secure by design" />
            <Features items={TRUST} />
          </div>
        </section>

        <section className="lp-final" aria-labelledby="final-title">
          <div className="lp-wrap">
            <div className="lp-final-panel" data-reveal>
              <h2 id="final-title" className="lp-h2">
                Pay only for <span className="lp-accent">what you use</span>
              </h2>
              <p>Choose your apps and modules, monthly or yearly. Try everything free for 3 days first.</p>
              <div className="lp-cta-row">
                <a className="lp-gbtn lp-gbtn-lg" href={trialUrl}>
                  <span>Start free trial</span>
                </a>
                <a className="lp-ghost" href="/signin">
                  Sign in
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <span className="lp-footer-brand">
            <b>ROOMAN</b> ONE
          </span>
          <nav aria-label="Footer">
            <a href="#apps">Apps</a>
            <a href="#how">How it works</a>
            <a href="#trust">Security</a>
            <a href="/signin">Sign in</a>
          </nav>
          <span className="lp-copy">© {new Date().getFullYear()} Rooman Technologies</span>
        </div>
      </footer>
    </div>
  );
}

function Features({ items }: { items: { icon: string; title: string; body: string }[] }) {
  return (
    <ul className="lp-grid4">
      {items.map((item, i) => (
        <li key={item.title} className="lp-panel lp-feature" data-reveal style={delay(i)}>
          <Tile icon={item.icon} />
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </li>
      ))}
    </ul>
  );
}

const ICON_PATHS: Record<string, string> = {
  books: 'M5 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H5zM19 7v13M8 8h6M8 12h6',
  bookings: 'M4 6h16v14H4zM4 10h16M9 3v5M15 3v5M8 14h3',
  billing: 'M4 7h16v11H4zM4 11h16M8 15h3M17 3l3 4M7 3 4 7',
  crm: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 6.5a3 3 0 0 1 0 5.6M18 14.6c1.8.6 3 2.4 3 5.4',
  gst: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
  pay: 'M3 7h18v11H3zM3 11h18M7 15h4',
  payroll: 'M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.4 4.5 3.2-2 3-4.5 3-4.5-1.3-4.5-3',
  fx: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3c2.5 2.6 3.5 5.6 3.5 9s-1 6.4-3.5 9c-2.5-2.6-3.5-5.6-3.5-9s1-6.4 3.5-9z',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2',
  key: 'M14.5 9.5a4.5 4.5 0 1 1-1.3-3.2M14.5 9.5 21 16v3h-3v-2h-2v-2h-2l-1.6-1.6',
  backup: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  ledger: 'M5 4h14v16H5zM9 4v16M12 8h4M12 12h4M12 16h2',
};

/** The cyan-to-navy tile from the hero badge, holding a line icon. */
function Tile({ icon }: { icon: string }) {
  return (
    <span className="lp-tile" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={ICON_PATHS[icon]} />
      </svg>
    </span>
  );
}
