/** Mirrors the server-side password policy so users see problems before submitting. */
export const PASSWORD_HINT = 'At least 8 characters with upper and lower case letters and one digit';

export function validatePassword(value: string): string | null {
  if (value.length < 8) return 'Password must be at least 8 characters long';
  if (value.toLowerCase() === value || value.toUpperCase() === value) return 'Password must contain both upper and lower case letters';
  if (!/\d/.test(value)) return 'Password must contain at least one digit';
  return null;
}
