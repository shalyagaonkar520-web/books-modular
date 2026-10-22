/**
 * Serves the tenant app's editable content (see api/appContent.ts) to every
 * component: `t(key, vars)` for texts, `branding`, `isModuleEnabled(key)` and
 * the `product` the app is served as (`isInProduct(key)`).
 *
 * The bundled defaults render immediately (no flash of empty labels); the
 * published document is fetched on mount and swapped in when it arrives.
 * Signed out, that is the shared (all-organizations) copy; signed in, it is the
 * user's own organization's copy (shared content + that org's customizations),
 * re-fetched whenever the signed-in organization changes.
 * Without a provider (e.g. isolated component tests) the defaults are served.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  DEFAULT_APP_CONTENT,
  brandPalette,
  shadeColor,
  fetchMyAppContent,
  fetchPublicAppContent,
  interpolate,
  type AppBranding,
  type AppContent,
  type AppModuleKey,
  type AppProduct,
} from '@/api/appContent';
import { useTheme, type ThemeMode } from './theme';
import { useOptionalAuth } from '@/auth/AuthContext';

type TextVars = Record<string, string | number | null | undefined>;

export interface AppContentValue {
  content: AppContent;
  branding: AppBranding;
  t: (key: string, vars?: TextVars) => string;
  /** In the product and switched on for the organization: what the sidebar and routes show. */
  isModuleEnabled: (key: AppModuleKey) => boolean;
  /** In the product the app is served as (Rooman Books has every module), whatever the organization switched off. */
  isInProduct: (key: AppModuleKey) => boolean;
  /** Undefined until the server says (then the app is Rooman Books, with every module). */
  product: AppProduct | undefined;
  /** Re-fetch the published document (e.g. after the admin saves it). */
  reload: () => Promise<void>;
}

function buildValue(content: AppContent, reload: () => Promise<void>): AppContentValue {
  const t = (key: string, vars?: TextVars) => {
    const text = content.texts[key] || DEFAULT_APP_CONTENT.texts[key] || key;
    return interpolate(text, { appName: content.branding.appName, ...vars });
  };
  const isInProduct = (key: AppModuleKey) => !content.product || content.product.modules.includes(key);
  return {
    content,
    branding: content.branding,
    t,
    isModuleEnabled: (key) => content.modules[key] !== false && isInProduct(key),
    isInProduct,
    product: content.product,
    reload,
  };
}

const DEFAULT_VALUE = buildValue(DEFAULT_APP_CONTENT, async () => undefined);

const AppContentContext = createContext<AppContentValue>(DEFAULT_VALUE);

const BRAND_VARS = ['--primary', '--primary-hover', '--primary-soft'] as const;

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Point the stylesheet's brand variables at the configured colour (or back to
 * the stylesheet's own). In dark mode a very dark brand colour is lightened so
 * buttons and links stay readable on the dark surfaces.
 */
function applyBrandColor(color: string, mode: ThemeMode) {
  const style = document.documentElement.style;
  if (color.toLowerCase() === DEFAULT_APP_CONTENT.branding.primaryColor.toLowerCase()) {
    // The default colour is what index.css already declares (light and dark), hand-tuned hover/tint included.
    BRAND_VARS.forEach((name) => style.removeProperty(name));
    return;
  }
  if (mode === 'dark') {
    const base = luminance(color) < 0.12 ? shadeColor(color, 0.4) : color;
    style.setProperty('--primary', base);
    style.setProperty('--primary-hover', shadeColor(base, 0.15));
    style.setProperty('--primary-soft', rgba(base, 0.18));
    return;
  }
  const palette = brandPalette(color);
  style.setProperty('--primary', palette.primary);
  style.setProperty('--primary-hover', palette.hover);
  style.setProperty('--primary-soft', palette.soft);
}

export function AppContentProvider({ children, initialContent }: { children: ReactNode; initialContent?: AppContent }) {
  const [content, setContent] = useState<AppContent>(initialContent ?? DEFAULT_APP_CONTENT);
  const latestRequest = useRef(0);

  const auth = useOptionalAuth();
  const orgId = auth?.user ? (auth.organization?.id ?? null) : null;

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    const next = orgId ? await fetchMyAppContent() : await fetchPublicAppContent();
    if (request === latestRequest.current) setContent(next);
  }, [orgId]);

  useEffect(() => {
    void reload();
    return () => {
      // Drop a response that lands after unmount.
      latestRequest.current += 1;
    };
  }, [reload]);

  const [themeMode] = useTheme();
  useEffect(() => {
    applyBrandColor(content.branding.primaryColor, themeMode);
  }, [content.branding.primaryColor, themeMode]);

  const value = useMemo(() => buildValue(content, reload), [content, reload]);
  return <AppContentContext.Provider value={value}>{children}</AppContentContext.Provider>;
}

export function useAppContent(): AppContentValue {
  return useContext(AppContentContext);
}
