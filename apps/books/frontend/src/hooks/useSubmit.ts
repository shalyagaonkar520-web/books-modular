import { useCallback, useRef, useState } from 'react';

import { ApiError } from '@/api/client';

/**
 * Wraps a mutating request: tracks in-flight state, surfaces the API message and
 * per-field validation errors, and returns whether the call succeeded.
 *
 * `run` resolves to the action's value, or `null` on failure. Reading `error`
 * straight after `await run(...)` sees the *previous* render's value (the state
 * update has not been applied yet), which showed nothing on the first failure -
 * so `run` also stashes the message on `errorRef`, a stable ref that is updated
 * synchronously before it returns. Callers that toast the failure inline should
 * read `errorRef.current`, not `error`.
 */
export function useSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
    errorRef.current = null;
    setFieldErrors({});
  }, []);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    setSubmitting(true);
    setError(null);
    errorRef.current = null;
    setFieldErrors({});
    try {
      return await action();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      errorRef.current = message;
      setError(message);
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitting, error, fieldErrors, run, reset, setError, errorRef };
}
