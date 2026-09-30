import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/api/client';
import { useAppContent } from '@/app/AppContentContext';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Runs an async loader and tracks loading/error state.
 * `deps` behaves like a useEffect dependency list; `reload()` refetches.
 */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []): AsyncState<T> & { reload: () => void; setData: (value: T) => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const { t } = useAppContent();
  // A ref so a content refresh never re-runs the loader.
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    loaderRef
      .current(controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active || (error as Error).name === 'AbortError') return;
        const message = error instanceof ApiError ? error.message : tRef.current('common.error.loadPage');
        setState({ data: null, loading: false, error: message });
      });
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((value: T) => setState({ data: value, loading: false, error: null }), []);

  return { ...state, reload, setData };
}
