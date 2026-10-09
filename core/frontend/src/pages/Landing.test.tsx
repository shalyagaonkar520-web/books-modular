import { render, screen, within } from '@testing-library/react';
import { App } from '../App';
import { appUrls } from '../config';
import { Landing } from './Landing';

describe('Landing page', () => {
  it('leads with the one-login promise and links to the free trial and sign-in', () => {
    render(<Landing />);
    expect(screen.getByRole('heading', { level: 1, name: /One login, every app/ })).toBeInTheDocument();
    const trials = screen.getAllByRole('link', { name: 'Start free trial' });
    expect(trials.length).toBeGreaterThanOrEqual(2);
    trials.forEach((link) => expect(link.getAttribute('href')).toMatch(/\/register$/));
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/signin');
  });

  it('marks only Books as available and the rest honestly', () => {
    render(<Landing />);
    const apps = screen.getByRole('region', { name: 'The apps' });
    expect(within(apps).getAllByText('Available now')).toHaveLength(1);
    expect(within(apps).getByText('Coming soon')).toBeInTheDocument();
    expect(within(apps).getAllByText('Planned')).toHaveLength(2);
    expect(within(apps).getByRole('link', { name: /Open Rooman Books/ })).toBeInTheDocument();
    expect(within(apps).queryByRole('link', { name: /Open Rooman Bookings/ })).toBeNull();
  });

  it('has a skip link to the main content', () => {
    render(<Landing />);
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });
});

describe('App routing', () => {
  it('shows the landing page at / and sign-in at /signin', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { unmount } = render(<App path="/" />);
    expect(screen.getByRole('heading', { level: 1, name: /One login/ })).toBeInTheDocument();
    unmount();
    render(<App path="/signin/" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

describe('appUrls', () => {
  it('derives sibling app hosts from the current host', () => {
    expect(appUrls({ protocol: 'https:', hostname: 'id.rooman.one' }).books).toBe('https://books.rooman.one');
    expect(appUrls({ protocol: 'https:', hostname: 'rooman.one' }).bookings).toBe('https://bookings.rooman.one');
    expect(appUrls({ protocol: 'http:', hostname: 'localhost' }).books).toBe('http://books.localhost');
  });
});
