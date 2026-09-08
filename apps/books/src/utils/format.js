/** Formatting helpers shared by every module. */
export function formatCurrency(amount, currency = 'INR') {
    const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}
/** Compact form for dashboard tiles: ₹1.25 L, ₹3.4 Cr. */
export function formatCurrencyCompact(amount, currency = 'INR') {
    const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
    const abs = Math.abs(value);
    const symbol = currency === 'INR' ? '₹' : '';
    const sign = value < 0 ? '-' : '';
    if (currency === 'INR') {
        if (abs >= 10000000)
            return `${sign}${symbol}${(abs / 10000000).toFixed(2)} Cr`;
        if (abs >= 100000)
            return `${sign}${symbol}${(abs / 100000).toFixed(2)} L`;
        if (abs >= 1000)
            return `${sign}${symbol}${(abs / 1000).toFixed(1)}K`;
    }
    return formatCurrency(value, currency);
}
export function formatNumber(value, maximumFractionDigits = 2) {
    const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits }).format(num);
}
export function formatQuantity(value) {
    const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return Number.isInteger(num) ? String(num) : formatNumber(num, 3);
}
export function formatPercent(value) {
    const num = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return `${formatNumber(num, 2)}%`;
}
/** ISO date (yyyy-mm-dd) -> 8 Sep 2026 */
export function formatDate(iso) {
    if (!iso)
        return '—';
    const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
    if (Number.isNaN(date.getTime()))
        return '—';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function formatDateTime(iso) {
    if (!iso)
        return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()))
        return '—';
    return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function todayIso() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}
export function addDaysIso(iso, days) {
    const date = new Date(`${iso}T00:00:00`);
    date.setDate(date.getDate() + days);
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}
export function daysBetween(fromIso, toIso) {
    const from = new Date(`${fromIso}T00:00:00`).getTime();
    const to = new Date(`${toIso}T00:00:00`).getTime();
    return Math.round((to - from) / 86400000);
}
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
/** snake_case / kebab-case -> Title Case */
export function titleCase(value) {
    if (!value)
        return '';
    return value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
export function initials(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
}
/** Parse a user-entered number, tolerating blanks and stray characters. */
export function parseNumber(value, fallback = 0) {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : fallback;
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
}
export function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
