/** Mirrors the server-side password policy so users see problems before submitting. */
export const PASSWORD_HINT = 'At least 8 characters with upper and lower case letters and one digit';

/** App-content key for PASSWORD_HINT: render `t(PASSWORD_HINT_KEY)` where `t` is available. */
export const PASSWORD_HINT_KEY = 'settings.password.hint';

type Translate = (key: string) => string;

/** Pass the app-content `t` to get the admin-editable wording; without it the built-in English is used. */
export function validatePassword(value: string, t?: Translate): string | null {
  const say = (key: string, fallback: string) => {
    if (!t) return fallback;
    const text = t(key);
    return text && text !== key ? text : fallback;
  };
  if (value.length < 8) return say('settings.password.tooShort', 'Password must be at least 8 characters long');
  if (value.toLowerCase() === value || value.toUpperCase() === value)
    return say('settings.password.mixedCase', 'Password must contain both upper and lower case letters');
  if (!/\d/.test(value)) return say('settings.password.digit', 'Password must contain at least one digit');
  return null;
}
