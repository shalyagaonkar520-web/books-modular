/**
 * The landing hero: a scaled design canvas with the headline and a 3D ring
 * of feature cards. Markup is static; engine.ts adds the behaviour after mount.
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
          </div>
        </div>
      </div>
    </header>
  );
}
