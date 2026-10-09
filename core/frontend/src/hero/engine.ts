/**
 * Behaviour for the landing hero: starfield, the 3D card ring, the scale law
 * and type fitter, the burger menu and the one-off entrance timeline.
 * Everything is scoped to the hero root and torn down by the returned cleanup.
 */
import { CARD_ORDER, creative } from './creatives';

const CW = 1172; // design canvas width
const CH = 657; // design canvas height
const TAB_MAX = 1080;
const TAB_MIN = 701;
const DW_MIN = 920;
const R = 891; // ring radius = perspective, so the camera sits at the ring centre
const N = 37;
const STEP = 360 / N;
const CULL = 42;
const SPEED = 1.9; // degrees per second

type Mode = 'desk' | 'tab' | 'phone';

/** Ink and cap targets in design px. `w: null` keeps the natural width. */
interface FitTarget {
  id: string;
  w: number | null;
  cap: number;
  pre?: string;
  baseline?: number;
  centreIn?: boolean;
}

const TARGETS: FitTarget[] = [
  { id: 'hxH1a', w: 563.5, cap: 37.2, pre: 'translateX(-50%)', baseline: 204.5 },
  { id: 'hxH1b', w: null, cap: 37.2, pre: 'translateX(-50%)', baseline: 258.5 },
  { id: 'hxSub1', w: null, cap: 8.4, pre: 'translateX(-50%)', baseline: 300.5 },
  { id: 'hxSub2', w: null, cap: 8.4, pre: 'translateX(-50%)', baseline: 316.5 },
  { id: 'hxBadgeTxt', w: 184, cap: 9.4, pre: 'translate(2px,-1px)' },
  { id: 'hxWmName', w: null, cap: 11.4, baseline: 38.5 },
  { id: 'hxCtaLabel', w: null, cap: 8.9, centreIn: true },
  { id: 'hxVpLabel', w: null, cap: 9.5, centreIn: true },
];

export function startHero(root: HTMLElement): () => void {
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const byId = (id: string) => root.querySelector<HTMLElement>(`#${id}`);
  const stage = $<HTMLElement>('.stage');
  const canvas = $<HTMLElement>('.canvas');
  const ring = $<HTMLElement>('.ring');
  const nav = $<HTMLElement>('.nav');
  const burger = $<HTMLButtonElement>('.burger');
  const menu = $<HTMLElement>('.navmenu');
  const links = $<HTMLElement>('.links');
  const reduceMQ = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!reduceMQ?.matches;
  const timers: number[] = [];
  const cleanups: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(target: Window | Document | HTMLElement | VisualViewport, type: K | string, fn: EventListener) => {
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  };

  let k = 1;
  let mode: Mode = 'desk';
  let tboost = 1;

  /* ---------- starfield: one 1x1 div per layer, stars are a box-shadow list ---------- */
  const starLayer = (el: HTMLElement | null, count: number, blur: number, aMin: number, aMax: number) => {
    if (!el) return;
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const a = (aMin + Math.random() * (aMax - aMin)).toFixed(3);
      out.push(`${(Math.random() * 100).toFixed(2)}vw ${(Math.random() * 100).toFixed(2)}vh ${blur}px 0 rgba(255,255,255,${a})`);
    }
    el.style.boxShadow = out.join(',');
  };
  starLayer($('.stars.a'), 150, 0, 0.05, 0.3);
  starLayer($('.stars.b'), 18, 1.2, 0.35, 0.7);

  /* ---------- ring ---------- */
  ring.textContent = '';
  const cards: HTMLElement[] = [];
  for (let i = 0; i < N; i++) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = creative(CARD_ORDER[i % CARD_ORDER.length]) + '<div class="edge"></div>';
    ring.appendChild(card);
    cards.push(card);
  }

  /* The camera sits AT the ring centre (perspective = R), so a card at angle a
     lives at x = R*sin(a), depth R*(1-cos a) toward the viewer, and is turned by
     -a so it stays tangent to the cylinder and faces the camera square-on. The
     slanted top edges are pure perspective, not rotation. */
  let phase = -2;
  const placeCards = () => {
    for (let i = 0; i < N; i++) {
      const el = cards[i];
      const a = (((i * STEP + phase) % 360) + 540) % 360 - 180; // signed -180..180
      if (Math.abs(a) > CULL) {
        if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'; // cull the back half
        continue;
      }
      el.style.visibility = 'visible';
      const r = (a * Math.PI) / 180;
      const c = Math.cos(r);
      el.style.transform = `translate3d(${(R * Math.sin(r)).toFixed(3)}px,0,${(R * (1 - c)).toFixed(3)}px) rotateY(${(-a).toFixed(4)}deg)`;
      el.style.filter = `brightness(${(0.84 + 0.5 * (1 / c - 1)).toFixed(4)})`;
    }
  };

  let last = 0;
  let raf = 0;
  const tick = (t: number) => {
    if (last) {
      const dt = Math.min((t - last) / 1000, 0.1); // a long frame never jumps the wheel
      if (!reduced()) phase -= SPEED * dt;
    }
    last = t;
    placeCards();
    raf = requestAnimationFrame(tick);
  };
  on(document, 'visibilitychange', () => {
    last = 0;
  });

  /* ---------- type fitter ---------- */
  let mctx: CanvasRenderingContext2D | null = null;
  try {
    mctx = document.createElement('canvas').getContext('2d');
  } catch {
    mctx = null; // e.g. test environments without canvas support
  }

  const capRatio = (el: HTMLElement) => {
    if (!mctx) return 0.7;
    const cs = getComputedStyle(el);
    mctx.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
    return (mctx.measureText('H').actualBoundingBoxAscent || 70) / 100;
  };
  // The used width of an absolutely positioned or block box ignores transforms,
  // so the intro's scale animations cannot skew it; inline boxes fall back to the rect.
  const inkWidth = (el: HTMLElement) => {
    const w = parseFloat(getComputedStyle(el).width);
    if (w > 0) return w;
    return el.getBoundingClientRect().width / (mode === 'phone' ? 1 : k);
  };
  // exact cap height (via font-size) and, when asked, exact ink width (via scaleX)
  const fitBox = (el: HTMLElement, tw: number | null, tc: number, pre = '') => {
    el.style.transform = pre;
    el.style.fontSize = `${tc / capRatio(el)}px`;
    if (tw === null) return;
    const w = inkWidth(el);
    if (w > 0) el.style.transform = `${pre ? pre + ' ' : ''}scaleX(${tw / w})`;
  };
  // with line-height 1 the half-leading is (size-(A+D))/2, so the first
  // baseline sits at halfLeading + A below the box top
  const baseline = (el: HTMLElement, y: number) => {
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    let A = size * 0.8;
    let D = size * 0.2;
    if (mctx) {
      mctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = mctx.measureText('H');
      A = m.fontBoundingBoxAscent || A;
      D = m.fontBoundingBoxDescent || D;
    }
    el.style.top = `${y - ((size - (A + D)) / 2 + A)}px`;
  };
  // put the cap-height centre of a label on its button's vertical centre
  const BIAS = 1.1; // the reference sits labels ~0.6px below true centre
  const centreLabel = (btn: HTMLElement, el: HTMLElement, capPx: number) => {
    el.style.top = '0px';
    const probe = document.createElement('i');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    el.appendChild(probe);
    const bRect = btn.getBoundingClientRect();
    const btnH = parseFloat(getComputedStyle(btn).height);
    const s = bRect.height / btnH || 1; // current on-screen scale
    const base = (probe.getBoundingClientRect().top - bRect.top) / s;
    el.removeChild(probe);
    el.style.top = `${btnH / 2 - (base - capPx / 2) + BIAS}px`;
  };

  const layout = () => {
    if (mode === 'phone') {
      // hand back everything the fitter wrote, including transform, or the
      // headline stays shifted after resizing down from a desktop width
      for (const t of TARGETS) {
        const el = byId(t.id);
        if (el) {
          el.style.fontSize = '';
          el.style.top = '';
          el.style.transform = '';
        }
      }
      links.style.fontSize = '';
      links.style.transform = '';
      Array.from(links.children).forEach((a) => ((a as HTMLElement).style.fontSize = ''));
      placeCards();
      return;
    }
    const T = mode === 'tab' ? tboost : 1;
    for (const t of TARGETS) {
      const el = byId(t.id);
      if (!el) continue;
      fitBox(el, t.w === null ? null : t.w * T, t.cap * T, t.pre);
      if (t.baseline !== undefined) baseline(el, t.baseline);
      if (t.centreIn && el.parentElement) centreLabel(el.parentElement, el, t.cap * T);
    }
    links.style.transform = '';
    const kids = Array.from(links.children) as HTMLElement[];
    if (mode === 'tab') {
      kids.forEach((a) => (a.style.fontSize = ''));
    } else if (kids.length) {
      const fs = 7.9 / capRatio(kids[0]); // one shared size, 7.9px caps
      kids.forEach((a) => (a.style.fontSize = `${fs}px`));
      const rowW = inkWidth(links);
      if (rowW > 330) links.style.transform = `scaleX(${330 / rowW})`; // squeeze only if it would crowd the CTA
    }
    placeCards();
  };

  /* ---------- scale law and responsive architecture ---------- */
  const setOpen = (open: boolean) => {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const resize = () => {
    const vw = stage.clientWidth || window.innerWidth;
    const vh = stage.clientHeight || window.innerHeight;
    if (window.innerWidth > TAB_MAX) setOpen(false); // left the burger band

    if (window.innerWidth <= 700) {
      mode = 'phone';
      k = 1;
      ['--k', '--fill', '--stshift', '--sshift', '--rs'].forEach((n) => canvas.style.removeProperty(n));
      layout();
      return;
    }

    let W = CW;
    let ramp = 0;
    mode = 'desk';
    tboost = 1;
    if (window.innerWidth <= TAB_MAX) {
      mode = 'tab';
      // the design window narrows linearly from 1172 (at 1080) to 920 (at 701),
      // so k = vw/W stays continuous at 1080 and type stops shrinking with vw
      W = DW_MIN + ((vw - TAB_MIN) * (CW - DW_MIN)) / (TAB_MAX - TAB_MIN);
      if (vh > vw * 1.15) W = Math.min(W, 900); // portrait: tighter, larger type
      ramp = Math.min(1, (TAB_MAX - vw) / 120); // ease the change in over 120px
      tboost = 1 + 0.14 * ramp;
    }
    // 560, not 657: fill the width and let the mock bleed off the bottom
    k = Math.min(vw / W, vh / 560);

    let fill = Math.max(0, vh / k - CH);
    let ss = 0;
    let rs = 1;
    let st = 0;
    if (fill > 0) {
      // share surplus height three ways
      ss = Math.min(fill * 0.55, 420) * ramp; // wheel + mock travel toward the foot
      rs = 1 + Math.min(fill / 1100, 0.75) * ramp; // wheel grows: a closer camera
      const slack = 219.5 - 125 * rs + ss;
      st = Math.max(0, slack / 2 - 28) * ramp; // hero drops to sit optically centred
      fill -= ss; // the mock keeps what is left
    }
    canvas.style.setProperty('--k', String(k));
    canvas.style.setProperty('--fill', `${fill}px`);
    canvas.style.setProperty('--stshift', `${st}px`);
    canvas.style.setProperty('--sshift', `${ss}px`);
    canvas.style.setProperty('--rs', String(rs));
    layout();
  };

  /* ---------- burger menu ---------- */
  on(burger, 'click', (e) => {
    e.stopPropagation();
    setOpen(!nav.classList.contains('open'));
  });
  on(document, 'click', (e) => {
    if (nav.classList.contains('open') && !nav.contains(e.target as Node)) setOpen(false);
  });
  on(document, 'keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape' && nav.classList.contains('open')) {
      setOpen(false);
      burger.focus();
    }
  });
  on(menu, 'click', (e) => {
    if ((e.target as HTMLElement).closest('a') && nav.classList.contains('open')) setOpen(false);
  });

  /* ---------- wiring ---------- */
  on(window, 'resize', resize);
  if (window.visualViewport) on(window.visualViewport, 'resize', resize);
  resize();
  document.fonts?.ready.then(() => layout()).catch(() => undefined);
  timers.push(window.setTimeout(layout, 400), window.setTimeout(layout, 1400));
  raf = requestAnimationFrame(tick);

  /* ---------- entrance timeline: runs once, then the hero is still ---------- */
  const intro: Animation[] = [];
  const settle = () => {
    intro.forEach((a) => a.cancel());
    root.classList.remove('intro');
  };
  timers.push(window.setTimeout(() => root.classList.remove('intro'), 4000)); // failsafe
  if (!root.classList.contains('intro') || reduced() || typeof Element.prototype.animate !== 'function') {
    settle();
  } else {
    const D = window.innerWidth <= 700 ? 0.66 : 1; // phones travel shorter distances
    const EXPO = 'cubic-bezier(.16,1,.3,1)';
    const SOFT = 'cubic-bezier(.22,.61,.36,1)';
    const Y = (px: number) => `0 ${px * D}px`;
    let lastAnim: Animation | null = null;
    let lastEnd = -1;
    const play = (el: Element | null, from: Keyframe, dur: number, delay: number, easing: string) => {
      if (!el) return;
      const to: Keyframe = { opacity: 1 };
      if (from.translate) to.translate = '0 0';
      if (from.scale != null) to.scale = '1';
      if (from.clipPath) to.clipPath = 'inset(-30% 0 -30% 0)';
      const a = el.animate([from, to], { duration: dur, delay, easing, fill: 'both' });
      intro.push(a);
      if (delay + dur >= lastEnd) {
        lastEnd = delay + dur;
        lastAnim = a;
      }
    };
    // the frame settles
    play(nav, { opacity: 0, translate: Y(-9) }, 620, 60, EXPO);
    play($('.mark'), { opacity: 0, translate: Y(6) }, 520, 150, SOFT);
    play($('.wm'), { opacity: 0, translate: Y(6) }, 520, 185, SOFT);
    root.querySelectorAll('.links a').forEach((a, i) => play(a, { opacity: 0, translate: Y(6) }, 460, 215 + i * 45, SOFT));
    play(burger, { opacity: 0, translate: Y(6) }, 460, 300, SOFT);
    play($('.nav .btn'), { opacity: 0, translate: Y(6) }, 500, 400, SOFT);
    // context, then the message (headline lines wipe up out of their baseline)
    play($('.badge'), { opacity: 0, translate: Y(11), scale: '.985' }, 560, 270, EXPO);
    play(byId('hxH1a'), { opacity: 0, translate: Y(15), clipPath: 'inset(100% 0 -30% 0)' }, 900, 380, EXPO);
    play(byId('hxH1b'), { opacity: 0, translate: Y(15), clipPath: 'inset(100% 0 -30% 0)' }, 900, 470, EXPO);
    play(byId('hxSub1'), { opacity: 0, translate: Y(10) }, 620, 690, EXPO);
    play(byId('hxSub2'), { opacity: 0, translate: Y(10) }, 620, 745, EXPO);
    play($('.cta2'), { opacity: 0, translate: Y(13), scale: '.985' }, 620, 830, EXPO);
    // the payoff: the wheel rises into depth
    play(ring, { opacity: 0, translate: Y(18), scale: '.99' }, 950, 700, EXPO);
    const finalAnim = lastAnim as Animation | null;
    if (finalAnim) finalAnim.finished.then(settle).catch(settle);
    else settle();
  }

  return () => {
    cancelAnimationFrame(raf);
    timers.forEach((t) => window.clearTimeout(t));
    cleanups.forEach((fn) => fn());
    intro.forEach((a) => a.cancel());
  };
}
