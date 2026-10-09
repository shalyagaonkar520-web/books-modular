/**
 * Light / dark mode for the whole app (tenant app, super admin, org admin
 * panel). The choice is remembered in this browser; with none saved, the
 * operating system's preference is used. The palette lives in styles/index.css
 * under :root[data-theme='dark'].
 */
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'rooman_theme';
const EVENT = 'rooman-theme-change';

function storedTheme(): ThemeMode | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function initialTheme(): ThemeMode {
  const stored = storedTheme();
  if (stored) return stored;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

export function setTheme(mode: ThemeMode): void {
  applyTheme(mode);
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode or blocked storage: the choice just is not remembered.
  }
  window.dispatchEvent(new CustomEvent<ThemeMode>(EVENT, { detail: mode }));
}

/** The current theme, kept in sync with toggles elsewhere on the page and in other tabs. */
export function useTheme(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(() => (document.documentElement.dataset.theme as ThemeMode) || initialTheme());

  useEffect(() => {
    const onChange = (event: Event) => setMode((event as CustomEvent<ThemeMode>).detail);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
        applyTheme(event.newValue);
        setMode(event.newValue);
      }
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return [mode, setTheme];
}

interface ThemeToggleProps {
  /** For the dark top bars of the super admin and org admin panels. */
  onDark?: boolean;
}

/** A sun / moon button that switches between light and dark mode. */
export function ThemeToggle({ onDark = false }: ThemeToggleProps) {
  const [mode, set] = useTheme();
  const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode';
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={() => set(next)}
      aria-label={label}
      title={label}
      style={onDark ? { color: '#e2e8f0' } : undefined}
    >
      {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
