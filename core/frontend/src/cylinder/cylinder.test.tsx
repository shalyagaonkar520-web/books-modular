import { render } from '@testing-library/react';
import { CardCylinder } from './CardCylinder';
import { PRODUCTS } from './products';
import { cardMetrics, easeProgress, poseFor, scrollTarget, wrapOffset } from './cylinder';

describe('cylinder maths', () => {
  it('keeps the credit-card ratio and clamps the size', () => {
    expect(cardMetrics(1440, 900)).toEqual({ cardW: 336, cardH: 211 });
    expect(cardMetrics(320, 568).cardW).toBe(150);
    const { cardW, cardH } = cardMetrics(1000, 700);
    expect(cardW / cardH).toBeCloseTo(1.5925, 1);
  });

  it('maps the scroll through the section onto the cards, clamped at both ends', () => {
    // section 3000px tall, viewport 1000px: 2000px of travel over 5 cards
    expect(scrollTarget(200, 3000, 1000, 5)).toBe(0); // not reached yet
    expect(scrollTarget(-1000, 3000, 1000, 5)).toBe(2); // halfway: middle card
    expect(scrollTarget(-2000, 3000, 1000, 5)).toBe(4); // end: last card
    expect(scrollTarget(-9000, 3000, 1000, 5)).toBe(4);
  });

  it('dwells on each card and passes through the half-way point', () => {
    expect(easeProgress(2)).toBe(2);
    expect(easeProgress(2.5)).toBeCloseTo(2.5);
    expect(Math.abs(easeProgress(2.1) - 2)).toBeLessThan(0.01); // still facing front
  });

  it('wraps offsets around the ring', () => {
    expect(wrapOffset(0, 4, 5)).toBe(1);
    expect(wrapOffset(4, 0, 5)).toBe(-1);
    expect(wrapOffset(2, 2, 5)).toBe(0);
  });

  it('puts the active card in front, neighbours tilted back, and hides cards beyond 3', () => {
    const front = poseFor(0, 211, 900);
    expect(front).toMatchObject({ visible: true, y: 0, z: 400, rot: 0 });
    const above = poseFor(1, 211, 900);
    expect(above.y).toBeLessThan(0);
    expect(above.rot).toBe(132);
    expect(poseFor(-1, 211, 900).y).toBeGreaterThan(0);
    expect(poseFor(3.2, 211, 900).visible).toBe(false);
  });
});

describe('CardCylinder', () => {
  it('renders one volumetric card per product, with honest status', () => {
    const { container } = render(<CardCylinder />);
    const cards = container.querySelectorAll('.cyl-card');
    expect(cards).toHaveLength(PRODUCTS.length);
    // 5 slices each: back, 3 structural, front
    expect(cards[0].children).toHaveLength(5);
    expect(container.querySelectorAll('.cyl-front')).toHaveLength(PRODUCTS.length);
    expect(container.querySelectorAll('.cyl-back')).toHaveLength(PRODUCTS.length);
    for (const product of PRODUCTS) expect(container.textContent).toContain(product.name);
    // only Books is live today
    expect(container.querySelectorAll('.cyl-status-live')).toHaveLength(1);
    expect(container.querySelector('.cyl-status-live')?.closest('.cyl-card')?.textContent).toContain('Books');
    expect(container.querySelector('video')).toBeNull(); // no external media
  });
});
