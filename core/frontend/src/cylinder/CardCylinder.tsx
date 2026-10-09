/**
 * Scroll-driven 3D cylinder of product cards. The section is several screens
 * tall; its stage stays pinned while you scroll, and scrolling turns the
 * cylinder from the first product to the last. Each card has volume (stacked
 * slices), a front (the product) and a back (what it does), and the front
 * card tilts toward the cursor with inertia.
 *
 * Card art is animated CSS (the CSP allows media from 'self' only).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PERSPECTIVE, cardMetrics, easeProgress, poseFor, scrollTarget, wrapOffset, type Metrics } from './cylinder';
import { PRODUCTS, STATUS_LABEL, type Product } from './products';
import './cylinder.css';

const CARD_COUNT = PRODUCTS.length;
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
    <section className="cyl" ref={sectionRef} aria-label="Rooman One products" style={{ height: `${100 + (CARD_COUNT - 1) * 50}vh` }}>
      <div className="cyl-stage" style={{ perspective: `${PERSPECTIVE}px` }} aria-hidden="true">
        <div className="cyl-space" style={size}>
          {PRODUCTS.map((product, i) => {
            const art = { '--c1': product.colors[0], '--c2': product.colors[1], '--delay': `${-i * 2.3}s` } as CSSProperties;
            return (
              <div
                key={product.key}
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
                        <Front product={product} />
                      </div>
                    );
                  }
                  if (layer === 0) {
                    return (
                      <div key={layer} className="cyl-face cyl-back" style={{ transform: `translateZ(${z}px) rotateX(180deg)` }}>
                        <div className="cyl-art cyl-art-blur" style={art} />
                        <Back product={product} />
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

function Icon({ path }: { path: string }) {
  return (
    <span className="cyl-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

/** Front: the product, its tagline and whether it is available yet. */
function Front({ product }: { product: Product }) {
  return (
    <div className="cyl-content">
      <div className="cyl-brand">
        <span>ROOMAN</span>
        <b>{product.name}</b>
      </div>
      <Icon path={product.icon} />
      <p className="cyl-tagline">{product.tagline}</p>
      <span className={`cyl-status cyl-status-${product.status}`}>{STATUS_LABEL[product.status]}</span>
    </div>
  );
}

/** Back: what the product does, under a dark band like a card's stripe. */
function Back({ product }: { product: Product }) {
  return (
    <div className="cyl-content">
      <div className="cyl-band">
        <span>Rooman {product.name}</span>
        <i>Rooman One</i>
      </div>
      <ul className="cyl-points">
        {product.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}
