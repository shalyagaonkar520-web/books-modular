import { render } from '@testing-library/react';
import { Landing } from './Landing';

describe('Landing scroll reveal', () => {
  it('shows every section at once when IntersectionObserver is unavailable', () => {
    // jsdom has no IntersectionObserver: nothing may be left hidden
    const { container } = render(<Landing />);
    expect(container.querySelector('.lp')).not.toHaveClass('lp-anim');
    const items = container.querySelectorAll('[data-reveal]');
    expect(items.length).toBeGreaterThan(10);
    items.forEach((item) => expect(item).toHaveClass('in'));
  });

  it('arms the reveal and shows items as they intersect', () => {
    const observed: Element[] = [];
    let callback: IntersectionObserverCallback = () => undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe = (el: Element) => observed.push(el);
        unobserve = () => undefined;
        disconnect = () => undefined;
      },
    );
    const { container } = render(<Landing />);
    expect(container.querySelector('.lp')).toHaveClass('lp-anim');
    const first = observed[0];
    expect(first).not.toHaveClass('in');
    callback([{ isIntersecting: true, target: first } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(first).toHaveClass('in');
    vi.unstubAllGlobals();
  });
});
