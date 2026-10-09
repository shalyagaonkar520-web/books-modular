import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellHeader, initials, type ShellHeaderProps } from './index';

function setup(overrides: Partial<ShellHeaderProps> = {}) {
  const props: ShellHeaderProps = {
    currentApp: 'books',
    apps: [
      { key: 'books', name: 'Books', url: 'https://books.example.test', enabled: true },
      { key: 'bookings', name: 'Bookings', url: 'https://bookings.example.test', enabled: false },
    ],
    orgs: [
      { id: 'o1', name: 'Acme Traders', code: 'ACME01' },
      { id: 'o2', name: 'Beta Stores', code: 'BETA02' },
    ],
    currentOrgId: 'o1',
    user: { name: 'Ravi Kumar', email: 'ravi@example.test' },
    upgradeUrl: 'https://id.example.test/plans',
    onSwitchOrg: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
  render(<ShellHeader {...props} />);
  return props;
}

describe('ShellHeader', () => {
  it('lists enabled apps as links and locked apps with an Upgrade prompt', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Rooman One/ }));
    expect(screen.getByRole('link', { name: 'Books' })).toHaveAttribute('href', 'https://books.example.test');
    expect(screen.queryByRole('link', { name: 'Bookings' })).toBeNull();
    expect(screen.getByText('Bookings').closest('li')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', 'https://id.example.test/plans');
  });

  it('switches organization and ignores a click on the current one', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Acme Traders' }));
    await userEvent.click(screen.getByRole('button', { name: /Acme Traders ACME01/ }));
    expect(props.onSwitchOrg).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Acme Traders' }));
    await userEvent.click(screen.getByRole('button', { name: /Beta Stores/ }));
    expect(props.onSwitchOrg).toHaveBeenCalledWith('o2');
  });

  it('shows the org name without a switcher when the user has one org', () => {
    setup({ orgs: [{ id: 'o1', name: 'Acme Traders', code: 'ACME01' }] });
    expect(screen.getByText('Acme Traders')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acme Traders' })).toBeNull();
  });

  it('signs out from the profile menu and closes menus on Escape', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Ravi Kumar' }));
    expect(screen.getByText('ravi@example.test')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('ravi@example.test')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Ravi Kumar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(props.onSignOut).toHaveBeenCalled();
  });

  it('toggles the theme and remembers it', async () => {
    document.documentElement.dataset.theme = 'light';
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('rooman_theme')).toBe('dark');
  });
});

describe('initials', () => {
  it.each([
    ['Ravi Kumar', 'RK'],
    ['ravi', 'R'],
    ['  Anita  Rao  Shetty ', 'AS'],
    ['', '?'],
  ])('%s -> %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
