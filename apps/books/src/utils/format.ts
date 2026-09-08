/** Formatting helpers shared by every module. */

export function formatCurrency(amount: number | null | undefined, currency = 'INR'): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Compact form for dashboard tiles: ₹1.25 L, ₹3.4 Cr. */
export function formatCurrencyCompact(amount: number | null | undefined, currency = 'INR'): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  const symbol = currency === 'INR' ? '₹' : '';
  const sign = value < 0 ? '-' : '';
  if (currency === 'INR') {
    if (abs >= 1_00_00_000) return `${sign}${symbol}${(abs / 1_00_00_000).toFixed(2)} Cr`;
    if (abs >= 1_00_000) return `${sign}${symbol}${(abs / 1_00_000).toFixed(2)} L`;
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(value, currency);
}

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 2): string {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits }).format(num);
}

export function formatQuantity(value: number | null | undefined): string {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Number.isInteger(num) ? String(num) : formatNumber(num, 3);
}

export function formatPercent(value: number | null | undefined): string {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${formatNumber(num, 2)}%`;
}

/** ISO date (yyyy-mm-dd) -> 8 Sep 2026 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`).getTime();
  const to = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** snake_case / kebab-case -> Title Case */
export function titleCase(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Parse a user-entered number, tolerating blanks and stray characters. */
export function parseNumber(value: string | number, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
