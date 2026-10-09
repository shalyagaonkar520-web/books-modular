/**
 * Scroll-driven 3D card cylinder. The section is several screens tall; its
 * stage stays pinned while you scroll, and scrolling turns the cylinder from
 * the first card to the last. Each card has volume (stacked slices), a front
 * and a back face, and the front card tilts toward the cursor with inertia.
 *
 * Card art is animated CSS (the CSP allows media from 'self' only) and the
 * card details are masked samples, never real card data.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import '@fontsource/jetbrains-mono/500.css';
import { PERSPECTIVE, cardMetrics, easeProgress, poseFor, scrollTarget, wrapOffset, type Metrics } from './cylinder';
import './cylinder.css';

const CARD_COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#FF2D55', '#AF52DE', '#00C7BE'];

export const CARD_DETAILS = [
  { last4: '4892', name: 'KUMAR TRADERS' },
  { last4: '5124', name: 'SHARMA CLINIC' },
  { last4: '9035', name: 'BLUE LOTUS SPA' },
  { last4: '2468', name: 'NAIR & SONS' },
  { last4: '7713', name: 'MEHTA EXPORTS' },
];

const CARD_COUNT = CARD_DETAILS.length;
// Volumetric thickness: dense parallel slices from -1.47px to 1.47px
const THICKNESS = [-1.47, -0.73, 0, 0.73, 1.47];
const MAX_TILT_Y = 15; // left-right, degrees
const MAX_TILT_X = 12; // up-down, degrees

export function CardCylinder() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const progress = useRef(0);
  const target = useRef(0);
  const mouse = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const [metrics, setMetrics] = useState<Metrics>(() => cardMetrics(window.innerWidth, window.innerHeight));

  // card size follows the viewport
  useEffect(() => {
    const onResize = () => setMetrics(cardMetrics(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // cursor offset from the window centre, clamped to [-1, 1]; eases back on leave
  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const onMove = (e: MouseEvent) => {
      mouse.current.targetX = Math.max(-1, Math.min(1, (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2)));
      mouse.current.targetY = Math.max(-1, Math.min(1, (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2)));
    };
    const onLeave = () => {
      mouse.current.targetX = 0;
      mouse.current.targetY = 0;
    };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // scroll position -> target card index
  useEffect(() => {
    const onScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      target.current = scrollTarget(el.getBoundingClientRect().top, el.offsetHeight, window.innerHeight, CARD_COUNT);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // 60fps render loop, paused while the section is off-screen
  useEffect(() => {
    let frame = 0;
    let running = false;

    const render = () => {
      // inertia: progress glides toward the scroll target, the tilt lags the cursor
      progress.current += (target.current - progress.current) * 0.1;
      mouse.current.x += (mouse.current.targetX - mouse.current.x) * 0.08;
      mouse.current.y += (mouse.current.targetY - mouse.current.y) * 0.08;
      const active = easeProgress(progress.current);
      const viewH = window.innerHeight;

      for (let i = 0; i < CARD_COUNT; i++) {
        const card = cardsRef.current[i];
        if (!card) continue;
        const offset = wrapOffset(i, active, CARD_COUNT);
        const pose = poseFor(offset, metrics.cardH, viewH);
        if (!pose.visible) {
          card.style.visibility = 'hidden';
          continue;
        }
        card.style.visibility = 'visible';
        const centre = Math.max(0, 1 - Math.abs(offset)); // 1 at the front, 0 from the first neighbour on
        const rotX = -Math.sign(offset) * pose.rot - mouse.current.y * MAX_TILT_X * centre;
        const rotY = mouse.current.x * MAX_TILT_Y * centre;
        card.style.zIndex = String(Math.round(pose.z));
        card.style.transform = `translateY(${pose.y.toFixed(2)}px) translateZ(${pose.z.toFixed(2)}px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) rotateZ(-3deg)`;
      }
    };
    const tick = () => {
      render();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    render(); // first frame without waiting
    if (typeof IntersectionObserver !== 'function' || !sectionRef.current) {
      start();
      return stop;
    }
    const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), { rootMargin: '200px 0px' });
    observer.observe(sectionRef.current);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [metrics]);

  const size = { width: `${metrics.cardW}px`, height: `${metrics.cardH}px` };

  return (
    <section className="cyl" ref={sectionRef} aria-label="Cards your customers pay with" style={{ height: `${100 + (CARD_COUNT - 1) * 55}vh` }}>
      <div className="cyl-stage" style={{ perspective: `${PERSPECTIVE}px` }} aria-hidden="true">
        <div className="cyl-space" style={size}>
          {CARD_DETAILS.map((details, i) => {
            const art = {
              '--c1': CARD_COLORS[(i * 2) % CARD_COLORS.length],
              '--c2': CARD_COLORS[(i * 2 + 3) % CARD_COLORS.length],
              '--delay': `${-i * 2.3}s`,
            } as CSSProperties;
            return (
              <div
                key={details.last4}
                className="cyl-card"
                ref={(el) => {
                  cardsRef.current[i] = el;
                }}
                style={size}
              >
                {THICKNESS.map((z, layer) => {
                  if (layer === THICKNESS.length - 1) {
                    return (
                      <div key={layer} className="cyl-face cyl-front" style={{ transform: `translateZ(${z}px)` }}>
                        <div className="cyl-art" style={art} />
                        <div className="cyl-front-content">
                          <Chip id={i} />
                          <Wordmark />
                          <div className="cyl-circles">
                            <span />
                            <span />
                          </div>
                        </div>
                      </div>
                    );
                  }
                  if (layer === 0) {
                    return (
                      <div key={layer} className="cyl-face cyl-back" style={{ transform: `translateZ(${z}px) rotateX(180deg)` }}>
                        <div className="cyl-art cyl-art-blur" style={art} />
                        <div className="cyl-stripe" />
                        <div className="cyl-details">
                          <div className="cyl-number">•••• •••• •••• {details.last4}</div>
                          <div className="cyl-owner">
                            <span>{details.name}</span>
                            <span className="cyl-dot">•</span>
                            <span>CVV •••</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return <div key={layer} className="cyl-slice" style={{ transform: `translateZ(${z}px)` }} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Silver metallic contact chip. */
function Chip({ id }: { id: number }) {
  const gradient = `cylChip${id}`;
  return (
    <svg className="cyl-chip" viewBox="0 0 60 60" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20 8H40V14C40.0016 14.5299 40.2128 15.0377 40.5875 15.4125C40.9623 15.7872 41.4701 15.9984 42 16H59V24H42C41.4701 24.0016 40.9623 24.2128 40.5875 24.5875C40.2128 24.9623 40.0016 25.4701 40 26V52H20V8ZM18 8H8.00039C4.47435 8 1.56576 10.6083 1.08 14H18V8ZM1 16V24V26V34V36V44H18V36H1V34H18V26H1V24H18V16H1ZM1.08 46C1.56576 49.3917 4.47435 52 8.00039 52H18V46H1.08ZM42 14V8H52.0004C55.5264 8 58.4342 10.6084 58.92 14H42ZM59 26H42V34H59V26ZM59 36H42V44H59V36ZM52.0004 52H42V46H58.92C58.4342 49.3916 55.5264 52 52.0004 52Z"
        fill={`url(#${gradient})`}
      />
      <defs>
        <linearGradient id={gradient} x1="30" y1="8" x2="30" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" />
          <stop offset="1" stopColor="#999999" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Rooman One wordmark for the card's top-right corner. */
function Wordmark() {
  return (
    <div className="cyl-wordmark">
      <span>ROOMAN</span>
      <b>ONE</b>
    </div>
  );
}
