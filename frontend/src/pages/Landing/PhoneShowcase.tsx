/** Landing section: how a phone connects to the business and what you can do with it, with a looping animated demo. */
import { useEffect, useState } from 'react';
import { Camera, Check, Mail, Mic, Monitor, Send, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';

import '@/styles/workspace.css';

const STEPS = [
  { icon: Mail, title: 'Invite by email', body: 'Add an employee, pick their workspace (Sales, Warehouse, Purchase…). They get a secure one-time link.' },
  { icon: Smartphone, title: 'They open it on their phone', body: 'They choose their own password and land in their own AI workspace. No app to install.' },
  { icon: Sparkles, title: 'They just say what they need', body: 'Type, talk or snap a photo: “Add this product”, “Today’s sales?”, “Invoice Sharma for 10 cartons”.' },
  { icon: ShieldCheck, title: 'You stay in control', body: 'You choose what each person can see and do. The AI can never go beyond it, and every change is logged.' },
];

/** The scripted chat that loops inside the phone. Each step shows a little more. */
const TIMELINE = [700, 2200, 3600, 4800, 6200, 7400, 11000];
const DEMO_TEXT = 'Create customer Mohan Traders and email him an invoice for 10 aloe hand wash';

export function PhoneShowcase() {
  const [step, setStep] = useState(0);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reduced) {
      setStep(5);
      return;
    }
    let timers: number[] = [];
    const run = () => {
      setStep(0);
      timers = TIMELINE.map((ms, i) => window.setTimeout(() => (i === TIMELINE.length - 1 ? run() : setStep(i + 1)), ms));
    };
    run();
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [reduced]);

  return (
    <section id="mobile" className="zb-landing-section lp-mobile">
      <div className="zb-section-heading text-center">
        <span className="zb-section-badge">AI ON EVERY PHONE</span>
        <h2 className="zb-section-title">Connect your team's phones. Just tell it what to do.</h2>
        <p className="zb-section-desc">Each person gets their own smart assistant, limited to exactly what you allow. Your books, in everyone's pocket.</p>
      </div>

      <div className="lp-mobile-grid">
        <ol className="lp-mobile-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="lp-mobile-step" style={{ animationDelay: `${i * 120}ms` }}>
              <span className="lp-mobile-step-icon">
                <s.icon size={20} aria-hidden="true" />
              </span>
              <div>
                <strong>
                  {i + 1}. {s.title}
                </strong>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="lp-mobile-stage" aria-hidden="true">
          <div className="lp-link">
            <span className="lp-link-node">
              <Monitor size={22} />
              <small>You</small>
            </span>
            <span className="lp-link-line">
              <i />
              <i />
              <i />
            </span>
            <span className="lp-link-node is-phone">
              <Smartphone size={22} />
              <small>Your team</small>
            </span>
          </div>

          <div className="lp-phone">
            <span className="lp-phone-ring" />
            <span className="lp-phone-ring is-late" />
            <div className="lp-phone-body">
              <div className="lp-phone-notch" />
              <div className="lp-phone-head">
                <span className="lp-phone-avatar">
                  <Sparkles size={13} />
                </span>
                <div>
                  <b>Buddy</b>
                  <small>Rooman Books</small>
                </div>
              </div>
              <div className="lp-phone-chat">
                <div className="lp-bub lp-bub-bot">Hii boss! What do you wanna do today?</div>
                {step >= 1 ? <div className="lp-bub lp-bub-me">{DEMO_TEXT}</div> : null}
                {step === 2 ? (
                  <div className="lp-bub lp-bub-bot lp-dots">
                    <i />
                    <i />
                    <i />
                  </div>
                ) : null}
                {step >= 3 ? (
                  <div className="lp-bub lp-bub-bot lp-plan">
                    <b>Here's what I'll do:</b>
                    <span>1 · Add customer Mohan Traders</span>
                    <span>2 · Create invoice: 10 × Aloe Hand Wash</span>
                    <span>3 · Email it to him</span>
                    <em className={step === 4 ? 'is-pressed' : ''}>
                      <Check size={12} /> Confirm
                    </em>
                  </div>
                ) : null}
                {step >= 5 ? (
                  <div className="lp-bub lp-bub-bot">
                    <Check size={13} className="lp-ok" /> All done, boss. Customer added, invoice sent.
                  </div>
                ) : null}
              </div>
              <div className="lp-phone-compose">
                <Camera size={15} />
                <span>{step >= 1 && step < 3 ? 'Sending…' : 'Type, talk or send a photo'}</span>
                <Mic size={15} className="lp-mic" />
                <span className="lp-send">
                  <Send size={13} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lp-ways">
        <div className="lp-way">
          <span className="lp-way-icon is-mic">
            <Mic size={22} aria-hidden="true" />
          </span>
          <strong>Talk</strong>
          <p>Tap the mic and speak. “What are today's sales?” It answers, and can even read the answer aloud.</p>
        </div>
        <div className="lp-way">
          <span className="lp-way-icon is-cam">
            <Camera size={22} aria-hidden="true" />
          </span>
          <strong>Snap</strong>
          <p>Photograph a product: it reads the pack, checks for duplicates, asks only for price, GST and stock, and adds it.</p>
        </div>
        <div className="lp-way">
          <span className="lp-way-icon is-type">
            <Send size={22} aria-hidden="true" />
          </span>
          <strong>Type</strong>
          <p>Plain, everyday words. Changes always show a preview and wait for your OK.</p>
        </div>
      </div>
    </section>
  );
}
