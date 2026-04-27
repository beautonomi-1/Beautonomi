import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAllProviderBookingsPages,
  PROVIDER_BOOKINGS_PAGE_SIZE,
} from "@/lib/fetch-paged-provider-bookings";

export interface UsePagedProviderBookingsResult<T> {
  data: T[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Local replace (e.g. optimistic status) — same idea as `useApi` mutate. */
  mutate: (next: T[] | null) => void;
  pageSize: typeof PROVIDER_BOOKINGS_PAGE_SIZE;
}

/**
 * Loads the full booking list for a filter by walking server `offset` pages
 * (GET /api/provider/bookings max 1000 rows per request).
 */
export function usePagedProviderBookings<T extends { id?: string }>(
  path: string,
  options?: { enabled?: boolean; timeoutMs?: number },
): UsePagedProviderBookingsResult<T> {
  const { enabled = true, timeoutMs } = options ?? {};
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const run = useCallback(async () => {
    if (!enabled || !path) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllProviderBookingsPages<T>(path, {
        pageSize: PROVIDER_BOOKINGS_PAGE_SIZE,
        timeoutMs,
      });
      if (id !== requestId.current) return;
      setData(rows);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path, enabled, timeoutMs]);

  useEffect(() => {
    void run();
  }, [run]);

  const refresh = useCallback(async () => {
    await run();
  }, [run]);

  const mutate = useCallback((next: T[] | null) => {
    setData(next);
  }, []);

  return { data, loading, error, refresh, mutate, pageSize: PROVIDER_BOOKINGS_PAGE_SIZE };
}
