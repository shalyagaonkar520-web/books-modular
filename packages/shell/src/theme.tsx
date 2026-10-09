/**
 * Light / dark mode shared by every Rooman One app. Same storage key and
 * event as Rooman Books, so a choice made in one app carries over on the same
 * origin. With nothing saved, the operating system's preference is used.
 */
import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rooman_theme';
const EVENT = 'rooman-theme-change';

function storedTheme(): ThemeMode | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
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
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
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
      if (event.key === THEME_STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
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

/** A button that switches between light and dark mode. */
export function ThemeToggle() {
  const [mode, set] = useTheme();
  const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'Switch to dark mode' : 'Switch to light mode';
  return (
    <button type="button" className="rs-icon-btn" onClick={() => set(next)} aria-label={label} title={label}>
      <span aria-hidden="true">{mode === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}
