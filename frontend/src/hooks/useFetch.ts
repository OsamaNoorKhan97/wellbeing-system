import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { errorMessage, type ApiResponse } from '../lib/api';
import type { PageMeta } from '../types';

export interface FetchState<T> {
  data: T | null;
  meta: PageMeta | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Loads data when the component mounts and whenever a dependency changes. Stale responses are ignored. */
export function useFetch<T>(fetcher: () => Promise<ApiResponse<T>>, deps: DependencyList = []): FetchState<T> {
  const [state, setState] = useState<{ data: T | null; meta?: PageMeta; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  const [version, setVersion] = useState(0);
  const latest = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const call = ++latest.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    fetcherRef
      .current()
      .then((response) => {
        if (call === latest.current) setState({ data: response.data, meta: response.meta, loading: false, error: null });
      })
      .catch((error) => {
        if (call === latest.current) setState((current) => ({ ...current, loading: false, error: errorMessage(error) }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data: state.data, meta: state.meta, loading: state.loading, error: state.error, reload };
}
