import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import {
  fetchProviderBookingsPage,
  PROVIDER_BOOKINGS_PAGE_SIZE,
} from "@/lib/fetch-paged-provider-bookings";
import { getApiErrorCode } from "@/lib/api-error";
import { PROVIDER_BOOKINGS_REFRESH_EVENT } from "@/lib/provider-bookings-events";

export interface UsePagedProviderBookingsResult<T> {
  data: T[] | null;
  loading: boolean;
  /** True while additional pages load after the first page is shown. */
  loadingMore: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Local replace (e.g. optimistic status) — same idea as `useApi` mutate. */
  mutate: (next: T[] | null) => void;
  pageSize: typeof PROVIDER_BOOKINGS_PAGE_SIZE;
}

export interface UsePagedProviderBookingsOptions {
  enabled?: boolean;
  timeoutMs?: number;
  /**
   * When true (default), render page 1 immediately and fetch remaining pages in
   * the background. When false, wait for all pages (legacy behaviour).
   */
  progressive?: boolean;
}

/**
 * Loads the full booking list for a filter by walking server `offset` pages
 * (GET /api/provider/bookings max 1000 rows per request).
 */
export function usePagedProviderBookings<T extends { id?: string }>(
  path: string,
  options?: UsePagedProviderBookingsOptions,
): UsePagedProviderBookingsResult<T> {
  const { enabled = true, timeoutMs, progressive = true } = options ?? {};
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled && path));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  /** Path that last completed successfully; used to keep schedule visible when a refresh fails for the same range. */
  const lastSuccessfulPathRef = useRef<string | null>(null);
  const hasDataRef = useRef(false);

  const run = useCallback(
    async (runOptions?: { silent?: boolean }) => {
      if (!enabled || !path) {
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const id = ++requestId.current;
      const silent = runOptions?.silent === true;
      const hasExistingData =
        lastSuccessfulPathRef.current === path && hasDataRef.current;
      if (!silent || !hasExistingData) {
        setLoading(true);
        setError(null);
      }

      const fetchOpts = { pageSize: PROVIDER_BOOKINGS_PAGE_SIZE, timeoutMs };

      try {
        if (!progressive) {
          const { fetchAllProviderBookingsPages } = await import(
            "@/lib/fetch-paged-provider-bookings"
          );
          const rows = await fetchAllProviderBookingsPages<T>(path, fetchOpts);
          if (id !== requestId.current) return;
          setData(rows);
          hasDataRef.current = true;
          lastSuccessfulPathRef.current = path;
          setError(null);
          return;
        }

        // A silent refresh over an already-populated list must never publish a
        // partial walk: doing so would visibly shrink the schedule to one page on
        // every realtime event, and a mid-walk failure would leave a truncated
        // list looking complete. Those refreshes accumulate and swap once.
        const publishPartialPages = !(silent && hasExistingData);

        const firstPage = await fetchProviderBookingsPage<T>(path, 0, fetchOpts);
        if (id !== requestId.current) return;

        if (publishPartialPages) setData(firstPage);
        lastSuccessfulPathRef.current = path;
        setError(null);
        setLoading(false);

        if (firstPage.length < PROVIDER_BOOKINGS_PAGE_SIZE) {
          if (!publishPartialPages) setData(firstPage);
          hasDataRef.current = true;
          setLoadingMore(false);
          return;
        }

        if (publishPartialPages) hasDataRef.current = true;
        setLoadingMore(true);
        let offset = PROVIDER_BOOKINGS_PAGE_SIZE;
        let accumulated = [...firstPage];

        while (id === requestId.current) {
          const page = await fetchProviderBookingsPage<T>(path, offset, fetchOpts);
          if (id !== requestId.current) return;
          accumulated = accumulated.concat(page);
          if (publishPartialPages) setData(accumulated);
          if (page.length < PROVIDER_BOOKINGS_PAGE_SIZE) break;
          offset += PROVIDER_BOOKINGS_PAGE_SIZE;
        }

        if (id !== requestId.current) return;
        if (!publishPartialPages) setData(accumulated);
        hasDataRef.current = true;
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
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [path, enabled, timeoutMs, progressive],
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

  return { data, loading, loadingMore, error, refresh, mutate, pageSize: PROVIDER_BOOKINGS_PAGE_SIZE };
}
