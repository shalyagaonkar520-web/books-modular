import { useCallback, useState } from 'react';
import { ApiError } from '@/api/client';
/**
 * Wraps a mutating request: tracks in-flight state, surfaces the API message and
 * per-field validation errors, and returns whether the call succeeded.
 */
export function useSubmit() {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});
    const reset = useCallback(() => {
        setError(null);
        setFieldErrors({});
    }, []);
    const run = useCallback(async (action) => {
        setSubmitting(true);
        setError(null);
        setFieldErrors({});
        try {
            return await action();
        }
        catch (err) {
            if (err instanceof ApiError) {
                setError(err.message);
                setFieldErrors(err.fieldErrors);
            }
            else {
                setError('Something went wrong. Please try again.');
            }
            return null;
        }
        finally {
            setSubmitting(false);
        }
    }, []);
    return { submitting, error, fieldErrors, run, reset, setError };
}
