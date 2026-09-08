import { describe, expect, it } from 'vitest';

import {
  addDaysIso,
  daysBetween,
  formatBytes,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatNumber,
  formatQuantity,
  initials,
  parseNumber,
  round2,
  titleCase,
} from './format';

describe('formatCurrency', () => {
  it('formats rupees with two decimals', () => {
    expect(formatCurrency(150000)).toBe('₹1,50,000.00');
  });

  it('treats null, undefined and NaN as zero', () => {
    expect(formatCurrency(null)).toBe('₹0.00');
    expect(formatCurrency(undefined)).toBe('₹0.00');
    expect(formatCurrency(Number.NaN)).toBe('₹0.00');
  });

  it('keeps negative amounts signed', () => {
    expect(formatCurrency(-2500)).toContain('2,500.00');
    expect(formatCurrency(-2500).startsWith('-')).toBe(true);
  });
});

describe('formatCurrencyCompact', () => {
  it('uses lakh and crore for large rupee amounts', () => {
    expect(formatCurrencyCompact(12500000)).toBe('₹1.25 Cr');
    expect(formatCurrencyCompact(250000)).toBe('₹2.50 L');
    expect(formatCurrencyCompact(4500)).toBe('₹4.5K');
  });

  it('falls back to full formatting under a thousand', () => {
    expect(formatCurrencyCompact(940)).toBe('₹940.00');
  });

  it('signs negative amounts', () => {
    expect(formatCurrencyCompact(-250000)).toBe('-₹2.50 L');
  });
});

describe('number helpers', () => {
  it('formats quantities without trailing zeros for integers', () => {
    expect(formatQuantity(12)).toBe('12');
    expect(formatQuantity(12.5)).toBe('12.5');
  });

  it('formats numbers in the Indian grouping', () => {
    expect(formatNumber(1234567, 0)).toBe('12,34,567');
  });

  it('parses messy numeric input', () => {
    expect(parseNumber('₹1,250.75')).toBe(1250.75);
    expect(parseNumber('')).toBe(0);
    expect(parseNumber('abc', 7)).toBe(7);
    expect(parseNumber(42)).toBe(42);
  });

  it('rounds to two decimals like the server', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(1234.5649)).toBe(1234.56);
  });
});

describe('date helpers', () => {
  it('formats ISO dates for display', () => {
    expect(formatDate('2026-09-08')).toBe('8 Sept 2026');
  });

  it('shows a dash for missing or invalid dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('adds days without drifting across months', () => {
    expect(addDaysIso('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDaysIso('2026-09-01', 15)).toBe('2026-09-16');
  });

  it('counts days between two dates', () => {
    expect(daysBetween('2026-09-01', '2026-09-16')).toBe(15);
    expect(daysBetween('2026-09-16', '2026-09-01')).toBe(-15);
  });
});

describe('text helpers', () => {
  it('title cases snake_case source values', () => {
    expect(titleCase('customer_payment')).toBe('Customer Payment');
    expect(titleCase(null)).toBe('');
  });

  it('builds initials from a name', () => {
    expect(initials('Khadar Basha')).toBe('KB');
    expect(initials('Asha')).toBe('A');
    expect(initials('')).toBe('');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
