/**
 * Maths for the scroll-driven card cylinder. Kept free of the DOM so it can be
 * unit tested. Cards travel on a horizontal-axis cylinder: the active card
 * faces the camera, its neighbours tilt back above and below it, the next
 * ones peek past the screen edge, and the rest leave the screen entirely.
 */

export interface Metrics {
  cardW: number;
  cardH: number;
}

export interface Pose {
  visible: boolean;
  y: number;
  z: number;
  /** rotation about X before the -sign flip, in degrees */
  rot: number;
}

export const PERSPECTIVE = 1350;
const GAP = 36; // between the centre card and its neighbours
const PEEK = -55; // push the peeking card's edge 55px past the screen boundary

/** Card size from the viewport: shrink on short screens to save vertical space. */
export function cardMetrics(w: number, h: number): Metrics {
  let cardW = Math.round(w * 0.16 + 130);
  const heightFactor = Math.min(1.0, Math.max(0.65, h / 850));
  cardW = Math.round(cardW * heightFactor);
  cardW = Math.min(336, Math.max(150, cardW));
  return { cardW, cardH: Math.round(cardW / 1.5925) }; // standard credit-card ratio
}

/**
 * Scroll position to a card index. The section is taller than the screen;
 * scrolling through it moves from card 0 to card `count - 1`.
 */
export function scrollTarget(sectionTop: number, sectionHeight: number, viewH: number, count: number): number {
  const travel = Math.max(1, sectionHeight - viewH);
  const f = Math.min(1, Math.max(0, -sectionTop / travel));
  return f * (count - 1);
}

/**
 * Magnetic step: a brief dwell with the card facing front, then a quick move
 * to the next one. Identity at whole and half numbers.
 */
export function easeProgress(p: number): number {
  const rounded = Math.round(p);
  const diff = p - rounded; // [-0.5, 0.5]
  return rounded + (Math.sign(diff) * Math.pow(Math.abs(diff) * 2, 4.2)) / 2;
}

/** Shortest signed distance from the active index on a ring of `count` cards. */
export function wrapOffset(i: number, active: number, count: number): number {
  let offset = i - active;
  const half = count / 2;
  while (offset > half) offset -= count;
  while (offset < -half) offset += count;
  return offset;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Position and rotation for a card `offset` places from the active one. */
export function poseFor(offset: number, cardH: number, viewH: number): Pose {
  const abs = Math.abs(offset);
  const sign = Math.sign(offset);
  // Cards may travel fully off-screen up to offset 3, so nothing pops out.
  if (abs > 3) return { visible: false, y: 0, z: 0, rot: 0 };
  const D = PERSPECTIVE;
  let y: number;
  let z: number;
  let rot: number;

  if (abs <= 1) {
    // centre -> first neighbour
    const t = smooth(abs);
    y = -sign * t * (cardH + GAP);
    z = 400 + t * (220 - 400);
    rot = t * 132; // tilts back to show the card's back face
  } else if (abs <= 2) {
    // first neighbour -> peeking at the screen edge
    const t = smooth(abs - 1);
    const zEnd = -60;
    // perspective-aware: where the card must sit for its edge to land at the boundary
    const yEnd = (viewH / 2 - PEEK) / (D / (D - zEnd)) - cardH / 2;
    const yStart = cardH + GAP;
    y = -sign * (yStart + t * (yEnd - yStart));
    z = 220 + t * (zEnd - 220);
    rot = 132 + t * (175 - 132);
  } else {
    // peeking -> completely off-screen (edge 100px past the boundary)
    const t = smooth(Math.min(abs - 2, 1));
    const zStart = -60;
    const zEnd = -250;
    const yStart = (viewH / 2 - PEEK) / (D / (D - zStart)) - cardH / 2;
    const yEnd = (viewH / 2 + 100) / (D / (D - zEnd)) + cardH / 2;
    y = -sign * (yStart + t * (yEnd - yStart));
    z = zStart + t * (zEnd - zStart);
    rot = 175 + t * (195 - 175);
  }
  return { visible: true, y: y || 0, z, rot }; // y || 0 turns -0 into 0 for the front card
}
