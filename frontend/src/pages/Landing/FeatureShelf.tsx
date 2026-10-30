/**
 * The landing page hero: an endless shelf of books, one per feature. The
 * active book is turned in 3D to show its cover; click it (or the ring, or
 * press Enter) and a sheet of paper grows out of the cover into a page that
 * explains the feature, its poster bleeding in like ink.
 *
 * One requestAnimationFrame loop drives the shelf, tilt and cursor; captions,
 * the sheet and its text use the Web Animations API. No opacity fades: every
 * reveal is a mask slide, a clip or a scale.
 */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowRight, Eye } from 'lucide-react';

import { FEATURE_BOOKS, SHELVES, type FeatureBook } from './featureBooks';

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const SHEET_EASE = 'cubic-bezier(.76,0,.18,1)';
const COPIES = 3;
const TILT_Z = -4.5;
const BLOBS: Array<[number, number, number]> = [
  [150, 330, 0],
  [340, 600, 120],
  [250, 120, 220],
  [90, 760, 300],
  [400, 250, 360],
  [260, 860, 420],
  [230, 470, 180],
];

const smoothstep = (x: number) => x * x * (3 - 2 * x);
const stepB = (r: number) => (Math.abs(r) < 1 ? (r + Math.sin(Math.PI * r) / Math.PI) / 2 : Math.sign(r) * 0.5);

function Spine({ book }: { book: FeatureBook }) {
  const Icon = book.icon;
  return (
    <div className="book-face-inner book-spine" style={{ background: book.look.bg, color: book.look.ink }}>
      <span className="book-spine-art" style={{ background: book.look.accent }}>
        <Icon aria-hidden="true" />
      </span>
      <span className="book-spine-title">{book.title}</span>
      <span className="book-spine-foot">
        <span>ROOMAN</span>
        <span className="book-spine-badge">BOOKS</span>
      </span>
    </div>
  );
}

function Cover({ book }: { book: FeatureBook }) {
  const Icon = book.icon;
  return (
    <div className="book-face-inner book-cover" style={{ background: book.look.bg, color: book.look.ink }}>
      <span className="book-cover-kicker">A ROOMAN BOOKS FEATURE</span>
      <span className="book-cover-title">{book.title}</span>
      <span className="book-cover-art">
        <span className="book-cover-sun" style={{ background: book.look.accent }} />
        <Icon className="book-cover-icon" aria-hidden="true" />
      </span>
      <span className="book-cover-tagline">{book.tagline}</span>
      <span className="book-cover-badge">{SHELVES.find((s) => s.key === book.shelf)?.label}</span>
    </div>
  );
}

/** The poster on the detail page: the cover again, as SVG so the ink mask can reveal it. */
function Poster({ book }: { book: FeatureBook }) {
  const Icon = book.icon;
  const words = book.title.toUpperCase().split(' ');
  const lines: string[] = [];
  words.forEach((w) => {
    const last = lines[lines.length - 1];
    if (last && `${last} ${w}`.length <= 11) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  });
  return (
    <svg viewBox="0 0 474 900" className="sheet-poster" aria-hidden="true">
      <defs>
        <filter id="ink-filter" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves={3} seed={7} />
          <feDisplacementMap in="SourceGraphic" scale={120} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <mask id="ink-mask" maskUnits="userSpaceOnUse" x="-200" y="-200" width="874" height="1300">
          <g filter="url(#ink-filter)">
            {BLOBS.map(([cx, cy], i) => (
              <circle key={i} className="ink-blob" cx={cx} cy={cy} r={0} fill="#fff" />
            ))}
          </g>
        </mask>
        <clipPath id="poster-clip">
          <rect width="474" height="900" rx="4" />
        </clipPath>
      </defs>
      <g clipPath="url(#poster-clip)" mask="url(#ink-mask)">
        <rect width="474" height="900" fill={book.look.bg} />
        <text x="40" y="70" fill={book.look.ink} className="poster-kicker">
          A ROOMAN BOOKS FEATURE
        </text>
        {lines.map((line, i) => (
          <text key={i} x="38" y={150 + i * 70} fill={book.look.ink} className="poster-title">
            {line}
          </text>
        ))}
        <circle cx="290" cy="560" r="150" fill={book.look.accent} />
        <Icon x={150} y={430} width={250} height={250} color={book.look.ink} strokeWidth={1.4} />
        <text x="40" y="820" fill={book.look.ink} className="poster-tagline">
          {book.tagline.toUpperCase()}
        </text>
        <rect x="350" y="836" width="90" height="30" fill="none" stroke={book.look.ink} strokeWidth="2" />
        <text x="395" y="857" textAnchor="middle" fill={book.look.ink} className="poster-badge">
          BOOKS
        </text>
      </g>
    </svg>
  );
}

export function FeatureShelf({ onStart }: { onStart: () => void }) {
  const books = FEATURE_BOOKS;
  const n = books.length;
  const total = n * COPIES;

  const heroRef = useRef<HTMLElement>(null);
  const wrapRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const tapeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const tabsRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const captionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cursorRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ go: (delta: number) => void; goTo: (index: number) => void; open: () => void; close: () => void } | null>(null);

  const [detail, setDetail] = useState(5);

  useEffect(() => {
    const hero = heroRef.current!;
    const wrap = wrapRef.current!;
    const stage = stageRef.current!;
    const sheet = sheetRef.current!;
    const cursor = cursorRef.current!;
    // No Web Animations (old browsers, tests): swap without moving.
    const reduced = typeof Element.prototype.animate !== 'function' || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

    let H = 300;
    let ws = 50;
    let d = 158;
    let gap = 9;
    const measure = () => {
      H = probeRef.current?.getBoundingClientRect().height || 300;
      ws = (H * 142) / 840;
      d = (H * 474) / 900;
      gap = H * 0.03;
      stage.style.setProperty('--ws', `${ws}px`);
      stage.style.setProperty('--d', `${d}px`);
      stage.style.setProperty('--hpx', `${H}px`);
    };
    measure();

    const start = 5;
    let s = start + n;
    let T = s;
    let dragging = false;
    let hover = -1;
    const lift = new Array<number>(total).fill(0);
    let active = -1;
    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let cx = mx;
    let cy = my;
    let tiltX = 0;
    let tiltY = 0;
    let inHero = false;
    let isOpen = false;
    let last = performance.now();
    let raf = 0;

    const rel = (v: number) => {
      let r = (((v - s) % total) + total) % total;
      if (r > total / 2) r -= total;
      return r;
    };
    const centreIndex = () => ((Math.round(s) % n) + n) % n;

    // ---- caption ---------------------------------------------------------
    const captionText = (i: number) => [books[i].title, books[i].tagline, SHELVES.find((x) => x.key === books[i].shelf)?.label ?? ''];
    const swapCaption = (i: number, dir: number) => {
      const texts = captionText(i);
      captionRefs.current.forEach((mask, line) => {
        if (!mask) return;
        const span = document.createElement('span');
        span.textContent = texts[line];
        if (mask.children.length) span.style.position = 'absolute';
        span.style.left = '0';
        span.style.right = '0';
        const olds = [...mask.children].filter((c) => !(c as HTMLElement).dataset.leaving) as HTMLElement[];
        mask.appendChild(span);
        if (reduced || !dir) {
          olds.forEach((o) => o.remove());
          span.style.position = '';
          return;
        }
        span.animate([{ transform: `translateY(${dir * 105}%)` }, { transform: 'translateY(0)' }], { duration: 650, easing: EASE, fill: 'both' });
        olds.forEach((o) => {
          o.dataset.leaving = '1';
          const from = getComputedStyle(o).transform;
          const anim = o.animate([{ transform: from === 'none' ? 'translateY(0)' : from }, { transform: `translateY(${-dir * 105}%)` }], {
            duration: 650,
            easing: EASE,
            fill: 'both',
          });
          anim.onfinish = () => {
            o.remove();
            const first = mask.firstElementChild as HTMLElement | null;
            if (first) first.style.position = '';
          };
        });
      });
    };

    const moveIndicator = (i: number) => {
      const tabs = tabsRef.current;
      const ind = indicatorRef.current;
      if (!tabs || !ind) return;
      const idx = SHELVES.findIndex((x) => x.key === books[i].shelf);
      const btn = tabs.querySelectorAll<HTMLButtonElement>('button[data-shelf]')[idx];
      if (!btn) return;
      ind.style.width = `${btn.offsetWidth}px`;
      ind.style.transform = `translateX(${btn.offsetLeft}px)`;
      tabs.querySelectorAll('button[data-shelf]').forEach((b, j) => b.classList.toggle('is-active', j === idx));
    };

    const setActive = (i: number, dir: number) => {
      if (i === active) return;
      active = i;
      swapCaption(i, dir);
      moveIndicator(i);
    };

    // ---- frame ------------------------------------------------------------
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = reduced ? 1 : dragging ? 18 : 5.2;
      s += (T - s) * (reduced ? 1 : 1 - Math.exp(-k * dt));
      if (Math.abs(T - s) < 1e-4) s = T;
      const loops = Math.floor(s / total);
      if (Math.abs(loops) > 4) {
        s -= loops * total;
        T -= loops * total;
      }

      const W = wrap.clientWidth;
      const rect = wrap.getBoundingClientRect();
      const shelfCy = rect.top + rect.height / 2;
      const settled = Math.abs(T - s) < 0.3;
      const onCover = inHero && !isOpen && settled && Math.abs(mx - (rect.left + W / 2)) < 0.55 * d && Math.abs(my - shelfCy) < 0.55 * H;
      const tyTarget = onCover ? ((mx - (rect.left + W / 2)) / (0.55 * d)) * 9 : ((mx - window.innerWidth / 2) / window.innerWidth) * 5;
      const txTarget = onCover ? (-(my - shelfCy) / (H / 2)) * 6 : 0;
      const te = 1 - Math.exp(-7 * dt);
      tiltY += (tyTarget - tiltY) * te;
      tiltX += (txTarget - tiltX) * te;

      const le = reduced ? 1 : 1 - Math.exp(-12 * dt);
      for (let v = 0; v < total; v++) {
        const el = tapeRefs.current[v];
        if (!el) continue;
        const r = rel(v);
        const x = r * (ws + gap) + (d - ws + 1.6 * gap) * stepB(r);
        if (Math.abs(x) > W / 2 + 1.5 * d) {
          el.style.visibility = 'hidden';
          continue;
        }
        el.style.visibility = 'visible';
        lift[v] += ((hover === v && Math.abs(r) > 0.5 ? 1 : 0) - lift[v]) * le;
        const o = smoothstep(Math.max(0, 1 - Math.abs(r)));
        const y = -o * 0.025 * H - lift[v] * 0.045 * H;
        el.style.transform =
          `translate3d(${x}px, ${y}px, ${o * 0.2 * H}px) rotateZ(${TILT_Z * o}deg) ` +
          `rotateX(${tiltX * o}deg) rotateY(${-90 * o + tiltY * o}deg)`;
        el.style.zIndex = String(Math.round(100 - Math.abs(r) * 4));
        el.style.setProperty('--shade-sp', String(o * 0.55));
        el.style.setProperty('--shade-cv', String((1 - o) * 0.5));
      }

      const ring = isOpen ? 0 : smoothstep(Math.max(0, 1 - Math.abs(T - s) * 3));
      if (playRef.current) {
        playRef.current.style.left = `${W / 2 - 0.5 * d - 6}px`;
        playRef.current.style.top = `${rect.height / 2 + 0.36 * H}px`;
        playRef.current.style.transform = `translate(-50%, -50%) scale(${ring})`;
      }

      const ce = 1 - Math.exp(-16 * dt);
      cx += (mx - cx) * ce;
      cy += (my - cy) * ce;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      cursor.classList.toggle('is-open', onCover);

      const now_i = centreIndex();
      if (now_i !== active) setActive(now_i, Math.sign(T - s) || 1);
      raf = requestAnimationFrame(frame);
    };

    // ---- inputs -----------------------------------------------------------
    const go = (delta: number) => {
      if (isOpen) return;
      T = Math.round(T) + delta;
    };
    const goTo = (index: number) => {
      if (isOpen) return;
      const current = ((Math.round(T) % n) + n) % n;
      let diff = index - current;
      if (diff > n / 2) diff -= n;
      if (diff < -n / 2) diff += n;
      T = Math.round(T) + diff;
    };

    let blobRaf = 0;
    const coverRect = () => {
      let best: HTMLDivElement | null = null;
      let bestR = Infinity;
      tapeRefs.current.forEach((el, v) => {
        const r = Math.abs(rel(v));
        if (el && r < bestR) {
          bestR = r;
          best = el;
        }
      });
      const face = (best as HTMLDivElement | null)?.querySelector('.book-cv');
      return face?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2 - 80, window.innerHeight / 2 - 150, 160, 300);
    };
    const insetFor = (r: DOMRect) =>
      `inset(${r.top}px ${window.innerWidth - r.right}px ${window.innerHeight - r.bottom}px ${r.left}px round 3px)`;

    const open = () => {
      if (isOpen) return;
      T = Math.round(T);
      s = T;
      isOpen = true;
      flushSync(() => setDetail(centreIndex()));
      const r = coverRect();
      document.body.style.overflow = 'hidden';
      sheet.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      sheet.style.visibility = 'visible';
      sheet.scrollTop = 0;
      sheet.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
      const dur = reduced ? 1 : 1050;
      sheet.animate(
        [
          { clipPath: insetFor(r), transform: `rotate(${TILT_Z}deg)` },
          { clipPath: 'inset(0px 0px 0px 0px round 0px)', transform: 'rotate(0deg)' },
        ],
        { duration: dur, easing: SHEET_EASE, fill: 'both' },
      );
      sheet.querySelectorAll<HTMLElement>('.rise > *').forEach((el, i) => {
        el.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], {
          duration: reduced ? 1 : 900,
          delay: reduced ? 0 : 620 + i * 75,
          easing: EASE,
          fill: 'both',
        });
      });
      const blobs = [...sheet.querySelectorAll<SVGCircleElement>('.ink-blob')];
      blobs.forEach((b) => b.setAttribute('r', '0'));
      const t0 = performance.now() + (reduced ? -5000 : 520);
      cancelAnimationFrame(blobRaf);
      const grow = (t: number) => {
        blobs.forEach((b, i) => {
          const p = Math.min(1, Math.max(0, (t - t0 - BLOBS[i][2]) / 1250));
          b.setAttribute('r', String(720 * (1 - (1 - p) ** 3)));
        });
        if (t - t0 < 2400) blobRaf = requestAnimationFrame(grow);
      };
      blobRaf = requestAnimationFrame(grow);
      (sheet.querySelector('.sheet-close') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    };

    const close = () => {
      if (!isOpen) return;
      const r = coverRect();
      const anim = sheet.animate(
        [
          { clipPath: 'inset(0px 0px 0px 0px round 0px)', transform: 'rotate(0deg)' },
          { clipPath: insetFor(r), transform: `rotate(${TILT_Z}deg)` },
        ],
        { duration: reduced ? 1 : 850, easing: SHEET_EASE, fill: 'both' },
      );
      anim.onfinish = () => {
        sheet.style.visibility = 'hidden';
        sheet.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        isOpen = false;
        document.body.style.overflow = '';
      };
    };
    api.current = { go, goTo, open, close };

    // Clicks on books (delegated), hover, drag.
    let downX = 0;
    let downT = 0;
    let moved = false;
    let pressed = false;
    const onPointerDown = (e: PointerEvent) => {
      pressed = true;
      moved = false;
      downX = e.clientX;
      downT = T;
    };
    const onPointerMoveWrap = (e: PointerEvent) => {
      if (!pressed) return;
      const dx = e.clientX - downX;
      if (!moved && Math.abs(dx) > 5) {
        moved = true;
        dragging = true;
        wrap.setPointerCapture(e.pointerId);
      }
      if (moved) T = downT - dx / (ws + gap);
    };
    const onPointerUp = () => {
      pressed = false;
      if (dragging) {
        dragging = false;
        T = Math.round(T);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (moved) {
        moved = false;
        return;
      }
      const tape = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
      if (!tape) return;
      const r = rel(Number(tape.dataset.v));
      if (Math.abs(r) < 0.5) open();
      else T = Math.round(T + r);
    };
    const onOver = (e: PointerEvent) => {
      const tape = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
      hover = tape ? Number(tape.dataset.v) : -1;
      cursor.classList.toggle('is-spine', !!tape && Math.abs(rel(hover)) > 0.5);
    };
    const onLeaveWrap = () => {
      hover = -1;
      cursor.classList.remove('is-spine');
    };

    const onMove = (e: PointerEvent) => {
      mx = e.clientX;
      my = e.clientY;
      const t = e.target as HTMLElement;
      cursor.classList.toggle('is-btn', !!t.closest('button, a') && !t.closest('[data-v]'));
    };
    const onHeroEnter = () => {
      inHero = true;
      cursor.classList.add('is-visible');
    };
    const onHeroLeave = () => {
      inHero = false;
      cursor.classList.remove('is-visible');
    };

    let wheelTimer = 0;
    const onWheel = (e: WheelEvent) => {
      // Only sideways scrolling turns the shelf; up and down still scroll the page.
      if (isOpen || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      T += (e.deltaX / (ws + gap)) * 0.5;
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => (T = Math.round(T)), 160);
    };

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape' && isOpen) close();
      if (isOpen) return;
      const r = hero.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight * 0.6) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Enter' && (e.target === document.body || hero.contains(e.target as Node))) {
        if (!(e.target as HTMLElement).closest('button, a')) open();
      }
    };

    const onResize = () => {
      measure();
      moveIndicator(active < 0 ? start : active);
    };

    wrap.addEventListener('pointerdown', onPointerDown);
    wrap.addEventListener('pointermove', onPointerMoveWrap);
    wrap.addEventListener('pointerup', onPointerUp);
    wrap.addEventListener('pointercancel', onPointerUp);
    wrap.addEventListener('click', onClick);
    wrap.addEventListener('pointerover', onOver);
    wrap.addEventListener('pointerleave', onLeaveWrap);
    wrap.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onMove);
    hero.addEventListener('pointerenter', onHeroEnter);
    hero.addEventListener('pointerleave', onHeroLeave);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    void document.fonts?.ready.then(onResize);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(blobRaf);
      window.clearTimeout(wheelTimer);
      wrap.removeEventListener('pointerdown', onPointerDown);
      wrap.removeEventListener('pointermove', onPointerMoveWrap);
      wrap.removeEventListener('pointerup', onPointerUp);
      wrap.removeEventListener('pointercancel', onPointerUp);
      wrap.removeEventListener('click', onClick);
      wrap.removeEventListener('pointerover', onOver);
      wrap.removeEventListener('pointerleave', onLeaveWrap);
      wrap.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerenter', onHeroEnter);
      hero.removeEventListener('pointerleave', onHeroLeave);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = '';
      api.current = null;
    };
  }, [n, total, books]);

  const book = books[detail];
  const shelfLabel = SHELVES.find((x) => x.key === book.shelf)?.label ?? '';

  return (
    <section className="shelf-hero" ref={heroRef} aria-label="Rooman Books features">
      <div className="shelf-probe" ref={probeRef} aria-hidden="true" />
      <div className="shelf-grain" aria-hidden="true" />

      <div className="shelf-top">
        <div className="shelf-heading">
          <span className="lbl shelf-heading-kicker">GST-ready accounting · {books.length} features</span>
          <h1>
            Everything your business runs on, <em>on one shelf.</em>
          </h1>
        </div>

        <nav className="shelf-tabs" aria-label="Feature shelves">
          <div className="shelf-tabs-row" ref={tabsRef}>
            <span className="shelf-tab-indicator" ref={indicatorRef} />
            {SHELVES.map((shelf) => (
              <button
                key={shelf.key}
                type="button"
                data-shelf={shelf.key}
                className="lbl shelf-tab"
                onClick={() => api.current?.goTo(books.findIndex((b) => b.shelf === shelf.key))}
              >
                {shelf.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <section className="shelf-wrap" ref={wrapRef} aria-label="Feature shelf">
        <div className="shelf-stage" ref={stageRef}>
          {Array.from({ length: total }, (_, v) => {
            const b = books[v % n];
            return (
              <div key={v} className="book" data-v={v} ref={(el) => (tapeRefs.current[v] = el)} aria-hidden={v < n || v >= 2 * n}>
                <div className="book-sp">
                  <Spine book={b} />
                </div>
                <div className="book-cv">
                  <Cover book={b} />
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="shelf-play" ref={playRef} aria-label="Open feature" onClick={() => api.current?.open()}>
          <Eye size={18} aria-hidden="true" />
        </button>
      </section>

      <div className="shelf-caption" aria-live="polite">
        <div className="shelf-mask shelf-cap-title" ref={(el) => (captionRefs.current[0] = el)} />
        <div className="shelf-mask lbl shelf-cap-sub" ref={(el) => (captionRefs.current[1] = el)} />
        <div className="shelf-mask shelf-cap-year" ref={(el) => (captionRefs.current[2] = el)} />
      </div>

      <button type="button" className="shelf-arrow is-left" aria-label="Previous feature" onClick={() => api.current?.go(-1)}>
        <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
          <path d="M5 1 L1 5 L5 9 M1 5 H17" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button type="button" className="shelf-arrow is-right" aria-label="Next feature" onClick={() => api.current?.go(1)}>
        <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true">
          <path d="M13 1 L17 5 L13 9 M17 5 H1" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>

      <p className="lbl shelf-hint">Click a book to see what it does</p>

      <div className="shelf-cursor" ref={cursorRef} aria-hidden="true">
        <span className="shelf-cursor-ring" />
        <span className="shelf-cursor-dot" />
        <span className="shelf-cursor-label">
          OPEN
          <br />
          READ
        </span>
      </div>

      <div className="feature-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={book.title}>
        <button type="button" className="lbl box sheet-close" onClick={() => api.current?.close()}>
          Close
        </button>
        <div className="sheet-grid">
          <div className="sheet-text">
            <div className="rise">
              <span className="lbl sheet-sub">{book.tagline}</span>
            </div>
            <div className="rise">
              <h2 className="sheet-title">{book.title}</h2>
            </div>
            <div className="rise">
              <span className="lbl sheet-meta">
                {shelfLabel} / {book.points.length} things it does
              </span>
            </div>
            <div className="rise">
              <p className="sheet-summary">{book.summary}</p>
            </div>
            {book.points.map((point) => (
              <div className="rise" key={point}>
                <p className="sheet-point">{point}</p>
              </div>
            ))}
            <div className="rise">
              <span className="sheet-credit">Part of every Starter, Business and Enterprise plan. Free to try.</span>
            </div>
            <div className="rise">
              <span className="sheet-actions">
                <button type="button" className="lbl sheet-cta" onClick={onStart}>
                  Start free trial <ArrowRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="lbl sheet-cta is-quiet"
                  onClick={() => {
                    api.current?.close();
                    window.setTimeout(() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }), 900);
                  }}
                >
                  See plans
                </button>
              </span>
            </div>
          </div>
          <div className="sheet-poster-wrap">
            <Poster book={book} />
          </div>
        </div>
      </div>
    </section>
  );
}

