/**
 * Serves the tenant app's editable content (see api/appContent.ts) to every
 * component: `t(key, vars)` for texts, `branding`, and `isModuleEnabled(key)`.
 *
 * The bundled defaults render immediately (no flash of empty labels); the
 * published document is fetched once on mount and swapped in when it arrives.
 * Without a provider (e.g. isolated component tests) the defaults are served.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  DEFAULT_APP_CONTENT,
  brandPalette,
  fetchPublicAppContent,
  interpolate,
  type AppBranding,
  type AppContent,
  type AppModuleKey,
} from '@/api/appContent';

type TextVars = Record<string, string | number | null | undefined>;

export interface AppContentValue {
  content: AppContent;
  branding: AppBranding;
  t: (key: string, vars?: TextVars) => string;
  isModuleEnabled: (key: AppModuleKey) => boolean;
  /** Re-fetch the published document (e.g. after the admin saves it). */
  reload: () => Promise<void>;
}

function buildValue(content: AppContent, reload: () => Promise<void>): AppContentValue {
  const t = (key: string, vars?: TextVars) => {
    const text = content.texts[key] || DEFAULT_APP_CONTENT.texts[key] || key;
    return interpolate(text, { appName: content.branding.appName, ...vars });
  };
  return {
    content,
    branding: content.branding,
    t,
    isModuleEnabled: (key) => content.modules[key] !== false,
    reload,
  };
}

const DEFAULT_VALUE = buildValue(DEFAULT_APP_CONTENT, async () => undefined);

const AppContentContext = createContext<AppContentValue>(DEFAULT_VALUE);

const BRAND_VARS = ['--primary', '--primary-hover', '--primary-soft'] as const;

/** Point the stylesheet's brand variables at the configured colour (or back to the stylesheet's own). */
function applyBrandColor(color: string) {
  const style = document.documentElement.style;
  if (color.toLowerCase() === DEFAULT_APP_CONTENT.branding.primaryColor.toLowerCase()) {
    // The default colour is what index.css already declares, hand-tuned hover/tint included.
    BRAND_VARS.forEach((name) => style.removeProperty(name));
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

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    const next = await fetchPublicAppContent();
    if (request === latestRequest.current) setContent(next);
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      // Drop a response that lands after unmount.
      latestRequest.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    applyBrandColor(content.branding.primaryColor);
  }, [content.branding.primaryColor]);

  const value = useMemo(() => buildValue(content, reload), [content, reload]);
  return <AppContentContext.Provider value={value}>{children}</AppContentContext.Provider>;
}

export function useAppContent(): AppContentValue {
  return useContext(AppContentContext);
}
