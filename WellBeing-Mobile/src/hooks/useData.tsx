import { type QueryKey, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useState } from 'react';
import type { ApiResponse } from '../api/client';
import { ErrorState, SkeletonList } from '../components/ui';
import type { PageMeta } from '../types';

/** One API call as a cached query. Errors are not retried automatically for 4xx answers. */
export function useApi<T>(key: QueryKey, fn: () => Promise<ApiResponse<T>>, options: { refetchInterval?: number; enabled?: boolean } = {}) {
  return useQuery({ queryKey: key, queryFn: async () => (await fn()).data, ...options });
}

export const PAGE_SIZE = 15;

/** A server-paginated list that loads the next page on demand ("load more"). */
export function usePaged<T>(key: QueryKey, fn: (page: number, pageSize: number) => Promise<ApiResponse<T[]>>, options: { enabled?: boolean } = {}) {
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await fn(pageParam, PAGE_SIZE);
      return { items: res.data, meta: res.meta as PageMeta | undefined };
    },
    getNextPageParam: (last) => (last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    ...options,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.meta?.total ?? items.length;
  return { ...query, items, total };
}

/** Pull-to-refresh state for any query. */
export function useRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);
  return { refreshing, onRefresh };
}

export function useInvalidate() {
  const client = useQueryClient();
  return useCallback((...roots: string[]) => Promise.all(roots.map((r) => client.invalidateQueries({ queryKey: [r] }))), [client]);
}

/** Shows a skeleton while loading and a retryable error state; renders children once data exists. */
export function Boundary<T>({
  query,
  skeleton,
  children,
}: {
  query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <>{skeleton ?? <SkeletonList />}</>;
  if (query.error && query.data === undefined) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}
