/**
 * The tenant app's editable content: branding, which modules are switched on,
 * and the text catalog (sidebar labels, page titles, empty states, …).
 *
 * The shape mirrors backend/content/app_content_default.json exactly; a copy of
 * that document is bundled so the app renders instantly with the built-in text
 * (and still renders when the API is unreachable).
 */
import defaultContentJson from '@/content/appContentDefault.json';

import { isSafeLogoUrl } from './siteContent';

export type AppModuleKey =
  | 'items'
  | 'customers'
  | 'invoices'
  | 'paymentsReceived'
  | 'expenseDashboard'
  | 'vendors'
  | 'bills'
  | 'expenses'
  | 'paymentsMade'
  | 'financialHub'
  | 'receivablesPayables'
  | 'banking'
  | 'razorpay'
  | 'timeTracking'
  | 'accounting'
  | 'reports'
  | 'documents'
  | 'payroll';

export interface AppBranding {
  appName: string;
  logoUrl: string;
  primaryColor: string;
}

export interface AppContent {
  branding: AppBranding;
  modules: Record<AppModuleKey, boolean>;
  texts: Record<string, string>;
}

/** The bundled defaults (identical to the backend's default document). */
export const DEFAULT_APP_CONTENT = defaultContentJson as AppContent;

/** Limits the backend enforces; mirrored so the editor can flag them before saving. */
export const APP_CONTENT_LIMITS = {
  appNameMin: 1,
  appNameMax: 60,
  logoUrl: 500,
  text: 300,
} as const;

export interface AppModuleMeta {
  key: AppModuleKey;
  label: string;
  /** Route prefixes owned by the module (the prefix itself and anything below it). */
  routes: string[];
}

/** Every module that can be switched off, in sidebar order. Dashboard and Settings are always on. */
export const APP_MODULES: AppModuleMeta[] = [
  { key: 'items', label: 'Items', routes: ['/items'] },
  { key: 'customers', label: 'Customers', routes: ['/customers'] },
  { key: 'invoices', label: 'Invoices', routes: ['/invoices'] },
  { key: 'paymentsReceived', label: 'Payments received', routes: ['/payments-received'] },
  { key: 'expenseDashboard', label: 'Expense dashboard', routes: ['/expense-dashboard'] },
  { key: 'vendors', label: 'Vendors', routes: ['/vendors'] },
  { key: 'bills', label: 'Bills', routes: ['/bills'] },
  { key: 'expenses', label: 'Expenses', routes: ['/expenses'] },
  { key: 'paymentsMade', label: 'Payments made', routes: ['/payments-made'] },
  { key: 'financialHub', label: 'Financial Hub', routes: ['/financial-dashboard'] },
  { key: 'receivablesPayables', label: 'Receivables & Payables', routes: ['/receivables-payables'] },
  { key: 'banking', label: 'Banking', routes: ['/banking'] },
  { key: 'razorpay', label: 'Razorpay payments', routes: ['/razorpay-payments'] },
  { key: 'timeTracking', label: 'Time tracking', routes: ['/time-tracking'] },
  { key: 'accounting', label: 'Accountant', routes: ['/accounting'] },
  { key: 'reports', label: 'Reports', routes: ['/reports'] },
  { key: 'documents', label: 'Documents', routes: ['/documents'] },
  { key: 'payroll', label: 'Payroll', routes: ['/payroll'] },
];

/** The module that owns a pathname, or null for always-on pages (dashboard, settings, profile…). */
export function moduleForPath(pathname: string): AppModuleKey | null {
  for (const module of APP_MODULES) {
    if (module.routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) return module.key;
  }
  return null;
}

/** Human names for the first segment of a text key, used to group the editor. */
export const TEXT_GROUP_LABELS: Record<string, string> = {
  common: 'Common',
  sidebar: 'Sidebar',
  header: 'Header',
  dashboard: 'Dashboard',
  items: 'Items',
  customers: 'Customers',
  vendors: 'Vendors',
  invoices: 'Invoices',
  paymentsReceived: 'Payments received',
  expenseDashboard: 'Expense dashboard',
  bills: 'Bills',
  expenses: 'Expenses',
  paymentsMade: 'Payments made',
  financialHub: 'Financial Hub',
  receivablesPayables: 'Receivables & Payables',
  banking: 'Banking',
  razorpay: 'Razorpay payments',
  timeTracking: 'Time tracking',
  accounting: 'Accountant',
  reports: 'Reports',
  documents: 'Documents',
  payroll: 'Payroll',
  settings: 'Settings',
  auth: 'Sign in & create organization',
  portal: 'Employee portal',
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Merge a (possibly partial or stale) document over the defaults: unknown keys
 * are dropped, wrong types and empty texts fall back to the default, and an
 * unsafe logo URL or malformed colour is never handed to the page.
 */
export function normalizeAppContent(raw: unknown): AppContent {
  const defaults = DEFAULT_APP_CONTENT;
  if (!isRecord(raw)) return defaults;

  const rawBranding = isRecord(raw.branding) ? raw.branding : {};
  const pick = (key: keyof AppBranding, valid: (value: string) => boolean) => {
    const value = rawBranding[key];
    return typeof value === 'string' && valid(value) ? value : defaults.branding[key];
  };
  const branding: AppBranding = {
    appName: pick('appName', (value) => value.trim().length > 0),
    logoUrl: pick('logoUrl', isSafeLogoUrl),
    primaryColor: pick('primaryColor', isHexColor),
  };

  const rawModules = isRecord(raw.modules) ? raw.modules : {};
  const modules = { ...defaults.modules };
  (Object.keys(modules) as AppModuleKey[]).forEach((key) => {
    if (typeof rawModules[key] === 'boolean') modules[key] = rawModules[key] as boolean;
  });

  const rawTexts = isRecord(raw.texts) ? raw.texts : {};
  const texts = { ...defaults.texts };
  Object.keys(texts).forEach((key) => {
    const value = rawTexts[key];
    if (typeof value === 'string' && value !== '') texts[key] = value;
  });

  return { branding, modules, texts };
}

/**
 * Public, unauthenticated read used by the tenant app. Never throws: any
 * failure (network, non-2xx, bad JSON) falls back to the bundled default.
 */
export async function fetchPublicAppContent(signal?: AbortSignal): Promise<AppContent> {
  try {
    const response = await fetch('/api/public/app-content', { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return DEFAULT_APP_CONTENT;
    return normalizeAppContent(await response.json());
  } catch {
    return DEFAULT_APP_CONTENT;
  }
}

/**
 * Client-side checks mirroring the backend limits. Keys are dotted paths
 * (`branding.appName`, `texts.items.title`), the same form the API's 422 errors map to.
 */
export function validateAppContent(content: AppContent): Record<string, string> {
  const errors: Record<string, string> = {};
  const L = APP_CONTENT_LIMITS;
  const { appName, logoUrl, primaryColor } = content.branding;

  if (appName.trim().length < L.appNameMin) errors['branding.appName'] = 'Give the app a name.';
  else if (appName.length > L.appNameMax) errors['branding.appName'] = `Up to ${L.appNameMax} characters allowed (currently ${appName.length}).`;

  if (!logoUrl.trim()) errors['branding.logoUrl'] = 'This field is required.';
  else if (logoUrl.length > L.logoUrl) errors['branding.logoUrl'] = `Up to ${L.logoUrl} characters allowed (currently ${logoUrl.length}).`;
  else if (!isSafeLogoUrl(logoUrl)) errors['branding.logoUrl'] = 'Use a site path starting with “/” or an https:// URL, without spaces.';

  if (!isHexColor(primaryColor)) errors['branding.primaryColor'] = 'Use a hex colour such as #2563eb.';

  Object.keys(content.modules).forEach((key) => {
    if (!(key in DEFAULT_APP_CONTENT.modules)) errors[`modules.${key}`] = 'Unknown module.';
  });

  Object.entries(content.texts).forEach(([key, value]) => {
    if (!(key in DEFAULT_APP_CONTENT.texts)) errors[`texts.${key}`] = 'Unknown text key.';
    else if (value.length > L.text) errors[`texts.${key}`] = `Up to ${L.text} characters allowed (currently ${value.length}).`;
  });

  return errors;
}

/** Replace `{name}` placeholders with the matching variable; unknown placeholders are left as they are. */
export function interpolate(text: string, vars?: Record<string, string | number | null | undefined>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined || value === null ? match : String(value);
  });
}

// ---------------------------------------------------------------------------
// Colour helpers for the branding CSS variables
// ---------------------------------------------------------------------------

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mix a colour towards black (`amount` < 0) or white (`amount` > 0); amount is 0..1. */
export function shadeColor(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const weight = Math.abs(amount);
  return toHex(toRgb(hex).map((c) => c + (target - c) * weight) as [number, number, number]);
}

/** The three brand variables the stylesheet uses, derived from one primary colour. */
export function brandPalette(primary: string): { primary: string; hover: string; soft: string } {
  return { primary, hover: shadeColor(primary, -0.18), soft: shadeColor(primary, 0.92) };
}
