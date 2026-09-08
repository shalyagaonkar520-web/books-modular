import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';
/**
 * Runs an async loader and tracks loading/error state.
 * `deps` behaves like a useEffect dependency list; `reload()` refetches.
 */
export function useAsync(loader, deps = []) {
    const [state, setState] = useState({ data: null, loading: true, error: null });
    const [nonce, setNonce] = useState(0);
    const loaderRef = useRef(loader);
    loaderRef.current = loader;
    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setState((prev) => ({ ...prev, loading: true, error: null }));
        loaderRef
            .current(controller.signal)
            .then((data) => {
            if (active)
                setState({ data, loading: false, error: null });
        })
            .catch((error) => {
            if (!active || error.name === 'AbortError')
                return;
            const message = error instanceof ApiError ? error.message : 'Something went wrong while loading this page.';
            setState({ data: null, loading: false, error: message });
        });
        return () => {
            active = false;
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, nonce]);
    const reload = useCallback(() => setNonce((n) => n + 1), []);
    const setData = useCallback((value) => setState({ data: value, loading: false, error: null }), []);
    return { ...state, reload, setData };
}
