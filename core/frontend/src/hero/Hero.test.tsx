import { fireEvent, render, screen } from '@testing-library/react';
import { CARD_ORDER, creative } from './creatives';
import { Hero } from './Hero';

describe('Hero', () => {
  it('builds the 37-card ring and settles straight away without Web Animations', () => {
    const { container } = render(<Hero trialUrl="https://books.example.test/register" />);
    expect(container.querySelectorAll('.ring .card')).toHaveLength(37);
    // jsdom has no Element.animate, so the entrance is skipped, never left invisible
    expect(container.querySelector('.hx')).not.toHaveClass('intro');
  });

  it('opens and closes the menu with the burger and Escape', () => {
    render(<Hero trialUrl="/register" />);
    const burger = screen.getByRole('button', { name: 'Opens menu' });
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(burger);
    expect(burger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(burger).toHaveAttribute('aria-expanded', 'false');
    expect(burger).toHaveFocus();
  });

  it('closes the menu on an outside click', () => {
    render(<Hero trialUrl="/register" />);
    const burger = screen.getByRole('button', { name: 'Opens menu' });
    fireEvent.click(burger);
    fireEvent.click(document.body);
    expect(burger).toHaveAttribute('aria-expanded', 'false');
  });

  it('points the nav CTA at the trial and keeps one level-1 heading', () => {
    render(<Hero trialUrl="https://books.example.test/register" />);
    expect(screen.getByRole('link', { name: 'Start free trial' })).toHaveAttribute('href', 'https://books.example.test/register');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('cleans up its listeners on unmount', () => {
    const { unmount } = render(<Hero trialUrl="/register" />);
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});

describe('ring creatives', () => {
  it.each(CARD_ORDER)('%s renders markup', (kind) => {
    expect(creative(kind).length).toBeGreaterThan(100);
  });
});
