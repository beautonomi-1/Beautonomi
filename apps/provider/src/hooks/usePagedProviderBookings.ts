import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import {
  fetchAllProviderBookingsPages,
  PROVIDER_BOOKINGS_PAGE_SIZE,
} from "@/lib/fetch-paged-provider-bookings";
import { getApiErrorCode } from "@/lib/api-error";
import { PROVIDER_BOOKINGS_REFRESH_EVENT } from "@/lib/provider-bookings-events";

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
  /** Path that last completed successfully; used to keep schedule visible when a refresh fails for the same range. */
  const lastSuccessfulPathRef = useRef<string | null>(null);
  const hasDataRef = useRef(false);

  const run = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!enabled || !path) {
        setLoading(false);
        return;
      }
      const id = ++requestId.current;
      const silent = options?.silent === true;
      const hasExistingData =
        lastSuccessfulPathRef.current === path && hasDataRef.current;
      if (!silent || !hasExistingData) {
        setLoading(true);
        setError(null);
      }
      try {
        const rows = await fetchAllProviderBookingsPages<T>(path, {
          pageSize: PROVIDER_BOOKINGS_PAGE_SIZE,
          timeoutMs,
        });
        if (id !== requestId.current) return;
        setData(rows);
        hasDataRef.current = true;
        lastSuccessfulPathRef.current = path;
        setError(null);
      } catch (e) {
        if (id !== requestId.current) return;
        if (getApiErrorCode(e) === "CANCELLED") return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setData((prev) => {
          if (lastSuccessfulPathRef.current === path) return prev;
          hasDataRef.current = false;
          return null;
        });
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [path, enabled, timeoutMs],
  );

  useEffect(() => {
    void run();
  }, [run]);

  const refresh = useCallback(async () => {
    await run();
  }, [run]);

  const mutate = useCallback((next: T[] | null) => {
    hasDataRef.current = next != null;
    setData(next);
  }, []);

  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    if (!enabled || !path) return;
    const onFocusOrRefresh = () => {
      void runRef.current({ silent: true });
    };
    const subFocus = DeviceEventEmitter.addListener("beautonomi:app:focus", onFocusOrRefresh);
    const subRecover = DeviceEventEmitter.addListener("beautonomi:network:recover", onFocusOrRefresh);
    const subBookings = DeviceEventEmitter.addListener(PROVIDER_BOOKINGS_REFRESH_EVENT, onFocusOrRefresh);
    return () => {
      subFocus.remove();
      subRecover.remove();
      subBookings.remove();
    };
  }, [enabled, path]);

  return { data, loading, error, refresh, mutate, pageSize: PROVIDER_BOOKINGS_PAGE_SIZE };
}
