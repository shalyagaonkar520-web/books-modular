/**
 * The landing hero: a scaled design canvas with the headline, a 3D ring of
 * feature cards and a browser mock of Rooman Books in front of it. Markup is
 * static; engine.ts adds the behaviour after mount.
 */
import { useLayoutEffect, useRef } from 'react';
// Bundled, so the page needs no third-party font requests (the CSP allows fonts from 'self' only).
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/900.css';
import '@fontsource/playfair-display/600.css';
import { startHero } from './engine';
import './hero.css';

interface HeroProps {
  trialUrl: string;
}

export function Hero({ trialUrl }: HeroProps) {
  const rootRef = useRef<HTMLElement>(null);

  // Layout effect: arm the entrance state before the first paint.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.add('intro');
    return startHero(root);
  }, []);

  return (
    <header className="hx" ref={rootRef}>
      <div className="stage">
        <div className="bg" />
        <div className="stars a" />
        <div className="stars b" />

        <div className="canvas">
          <div className="stack">
            <nav className="nav" aria-label="Main">
              <svg className="mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="hxSw" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#8ef4ff" />
                    <stop offset=".5" stopColor="#35d8ff" />
                    <stop offset="1" stopColor="#0a86d8" />
                  </linearGradient>
                  <linearGradient id="hxSw2" x1="40" y1="10" x2="10" y2="40" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#a6f7ff" />
                    <stop offset="1" stopColor="#0f9ae0" stopOpacity=".25" />
                  </linearGradient>
                </defs>
                <g transform="rotate(-32 24 24)">
                  <ellipse cx="24" cy="24" rx="18.5" ry="9.6" stroke="url(#hxSw2)" strokeWidth="3.1" strokeLinecap="round" strokeDasharray="58 30" strokeDashoffset="14" />
                  <circle cx="41.4" cy="20.6" r="3.1" fill="#bff6ff" />
                </g>
                <circle cx="24" cy="24" r="6.6" fill="url(#hxSw)" />
                <circle cx="24" cy="24" r="2.6" fill="#fff" />
              </svg>
              <a className="wm" href="/" aria-label="Rooman One home">
                <span className="kick">ROOMAN</span>
                <span className="name" id="hxWmName">
                  ONE
                </span>
              </a>
              <button className="burger" type="button" aria-label="Opens menu" aria-expanded="false" aria-controls="hxNavmenu">
                <span />
                <span />
                <span />
              </button>
              <div className="navmenu" id="hxNavmenu">
                <div className="links">
                  <a href="#apps">Apps</a>
                  <a href="#how">How it works</a>
                  <a href="#india">Built for India</a>
                  <a href="#trust">Security</a>
                  <a href="/signin">Sign in</a>
                </div>
                <a className="btn" href={trialUrl}>
                  <span id="hxCtaLabel">Start free trial</span>
                </a>
              </div>
            </nav>

            <div className="badge">
              <i>
                <svg viewBox="5 1 14 22" preserveAspectRatio="none" aria-hidden="true">
                  <path
                    d="M13.9 1.6 5.5 13.6a.7.7 0 0 0 .6 1.1h4.2l-1 7.7a.7.7 0 0 0 1.25.55l8.3-12.1a.7.7 0 0 0-.6-1.1h-4.2l1-7.7a.7.7 0 0 0-1.25-.55Z"
                    fill="rgba(16,112,152,.72)"
                    stroke="rgba(190,236,255,.6)"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>
              </i>
              <b id="hxBadgeTxt">One suite for Indian businesses</b>
            </div>

            <h1 className="h1 l1" id="hxH1a" aria-label="One login, every app. Rooman One.">
              One login, every app
            </h1>
            <div className="h1 l2" id="hxH1b" aria-hidden="true">
              <span className="accent">Rooman One</span>
            </div>
            <p className="sub s1" id="hxSub1">
              <b>
                Accounting / Bookings / <span className="nb">Billing</span>
              </b>{' '}
              under one account, one customer list
            </p>
            <p className="sub s2" id="hxSub2">
              and data that flows between apps on its own.
            </p>
            <a className="btn cta2" href="#apps">
              <span id="hxVpLabel">See the apps</span>
            </a>
          </div>

          <div className="showcase">
            <div className="ring" aria-hidden="true" />
            <BrowserMock />
          </div>
        </div>
      </div>
    </header>
  );
}

const INVOICES = [
  { no: 'INV-000123', who: 'Kumar Traders', date: '09 Oct', amount: '₹1,180.00', status: 'paid', label: 'Paid' },
  { no: 'INV-000122', who: 'Sharma Clinic', date: '08 Oct', amount: '₹24,780.00', status: 'sent', label: 'Sent' },
  { no: 'INV-000121', who: 'Blue Lotus Spa', date: '06 Oct', amount: '₹8,850.00', status: 'due', label: 'Due in 5 days' },
  { no: 'INV-000120', who: 'Nair & Sons', date: '03 Oct', amount: '₹62,540.00', status: 'paid', label: 'Paid' },
];

/** A miniature Rooman Books dashboard with illustrative figures. */
function BrowserMock() {
  return (
    <div className="browser" aria-hidden="true">
      <div className="bar">
        <div className="dots">
          <i style={{ background: '#ee5c62' }} />
          <i style={{ background: '#f6b719' }} />
          <i style={{ background: '#12c02f' }} />
        </div>
        <div className="omni">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
            <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />
          </svg>
          <span>books.rooman.one</span>
        </div>
        <div className="tools">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4m0 0L8 8m4-4 4 4" />
            <path d="M4 15v5h16v-5" />
          </svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <svg viewBox="0 0 24 24" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 3 8l9 5 9-5-9-5Z" fill="#fff" opacity=".95" />
            <path d="M3 13l9 5 9-5" fill="none" opacity=".55" />
          </svg>
        </div>
      </div>
      <div className="page">
        <div className="appbar">
          <span className="sq" />
          Rooman One <span className="muted">/</span> Books
          <span className="org">Kumar Traders</span>
          <span className="av">RK</span>
        </div>
        <div className="dash">
          <ul className="side">
            <li className="on">Dashboard</li>
            <li>Sales</li>
            <li>Purchases</li>
            <li>Banking</li>
            <li>GST</li>
            <li>Payroll</li>
            <li>Reports</li>
          </ul>
          <div className="main">
            <h4>Good morning, Ravi</h4>
            <p className="hint">Here is where your business stands today.</p>
            <div className="kpis">
              <div className="kpi">
                <span>Receivables</span>
                <b>₹4,82,300</b>
                <i>12 invoices open</i>
              </div>
              <div className="kpi">
                <span>Payables</span>
                <b>₹1,26,900</b>
                <i className="warn">3 bills due this week</i>
              </div>
              <div className="kpi">
                <span>Cash in bank</span>
                <b>₹9,14,050</b>
                <i>Reconciled today</i>
              </div>
              <div className="kpi">
                <span>GST payable</span>
                <b>₹38,420</b>
                <i className="warn">GSTR-3B due 20 Oct</i>
              </div>
            </div>
            <div className="tbl">
              <div className="row head">
                <span>Invoice</span>
                <span>Customer</span>
                <span>Date</span>
                <span className="num">Amount</span>
                <span>Status</span>
              </div>
              {INVOICES.map((inv) => (
                <div className="row" key={inv.no}>
                  <span>{inv.no}</span>
                  <span>{inv.who}</span>
                  <span>{inv.date}</span>
                  <span className="num">{inv.amount}</span>
                  <span className={`st ${inv.status}`}>{inv.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
