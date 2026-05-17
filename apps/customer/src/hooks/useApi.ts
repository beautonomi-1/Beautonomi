/**
 * Generic data fetching hook with loading, error, refresh support.
 * Includes in-memory response cache and request deduplication to reduce
 * redundant network calls across component mounts/navigations.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { getRuntimeMarketHost } from "@/config/public-env";
import {
  responseCache,
  inflightRequests,
  pruneResponseCache,
  clearApiCache,
} from "@/lib/api-response-cache";
import { useAuth } from "@/providers/AuthProvider";

export { clearApiCache };

const DEFAULT_LOADING_TIMEOUT_MS = 15000;
/** In-memory reuse window — longer = snappier revisits / remounts, still refreshable via `refresh()`. */
const DEFAULT_STALE_TIME_MS = 60_000;

interface UseApiOptions {
  enabled?: boolean;
  timeoutMs?: number;
  /** Keep response in memory for this duration to reduce remount refetch churn. */
  staleTimeMs?: number;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  timedOut: boolean;
  refresh: () => Promise<void>;
  mutate: (newData: T) => void;
}

export function useApi<T>(path: string, options: UseApiOptions = {}): UseApiResult<T> {
  const {
    enabled = true,
    timeoutMs = DEFAULT_LOADING_TIMEOUT_MS,
    staleTimeMs = DEFAULT_STALE_TIME_MS,
  } = options;
  const { session } = useAuth();
  const cacheScope = session?.user?.id ?? "_anon";
  const runtimeMarketHost = getRuntimeMarketHost().trim().toLowerCase() || "default";
  const cacheKey = `${cacheScope}::${runtimeMarketHost}::${path}`;

  const [data, setData] = useState<T | null>(() => {
    if (!enabled) return null;
    const c = responseCache.get(cacheKey) as
      | { data: T | null; error: string | null; expiresAt: number }
      | undefined;
    return c && c.expiresAt > Date.now() ? c.data : null;
  });
  const [error, setError] = useState<string | null>(() => {
    if (!enabled) return null;
    const c = responseCache.get(cacheKey) as
      | { data: T | null; error: string | null; expiresAt: number }
      | undefined;
    return c && c.expiresAt > Date.now() ? c.error : null;
  });
  const [loading, setLoading] = useState(() => {
    if (!enabled) return false;
    const c = responseCache.get(cacheKey) as
      | { data: T | null; error: string | null; expiresAt: number }
      | undefined;
    return !(c && c.expiresAt > Date.now());
  });
  const [timedOut, setTimedOut] = useState(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  // `silent=true` → background refresh: never show loading spinner if we
  // already have data. The WhatsApp/Airbnb pattern — show what we know,
  // swap it for fresh data when the network responds.
  const fetchData = useCallback(async (silent = false) => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++requestIdRef.current;
    try {
      setTimedOut(false);

      const now = Date.now();
      const cached = responseCache.get(cacheKey) as
        | { data: T | null; error: string | null; expiresAt: number }
        | undefined;
      // Check cache *before* `setLoading(true)` so a warm in-memory entry
      // never flashes the loading state for one frame.
      if (cached && cached.expiresAt > now) {
        if (!mountedRef.current || id !== requestIdRef.current) return;
        setData(cached.data);
        setError(cached.error);
        setLoading(false);
        return;
      }

      const hasExistingData = cached?.data != null;
      if (silent && hasExistingData) {
        // Background refresh — show existing data while fetching fresh.
        setError(null);
      } else {
        setLoading(true);
        setError(null);
      }

      const inflight = inflightRequests.get(cacheKey) as
        | Promise<{ data: T | null; error: string | null }>
        | undefined;
      const requestPromise =
        inflight ??
        (async () => {
          const result = await api.get<T>(path, timeoutMs > 0 ? { timeout: timeoutMs } : undefined);
          if (result.error) {
            return { data: null, error: getApiErrorMessage(result.error, "Request failed") };
          }
          return { data: result.data, error: null };
        })();

      if (!inflight) {
        inflightRequests.set(cacheKey, requestPromise as Promise<{ data: unknown | null; error: string | null }>);
      }

      let payload: { data: T | null; error: string | null };
      try {
        payload = await requestPromise;
      } finally {
        if (!inflight) {
          inflightRequests.delete(cacheKey);
        }
      }
      if (!mountedRef.current || id !== requestIdRef.current) return;

      responseCache.set(cacheKey, {
        data: payload.data,
        error: payload.error,
        expiresAt: Date.now() + staleTimeMs,
      });
      pruneResponseCache(Date.now());

      if (payload.error) {
        setError(payload.error);
        setData(null);
      } else {
        setData(payload.data);
      }
    } catch (err) {
      if (!mountedRef.current || id !== requestIdRef.current) return;
      setError(getApiErrorMessage(err, "Request failed"));
    } finally {
      if (mountedRef.current && id === requestIdRef.current) setLoading(false);
    }
  }, [cacheKey, path, enabled, staleTimeMs, timeoutMs]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  // Silent background refresh on app focus or network reconnection.
  useEffect(() => {
    if (!enabled) return;
    const onFocusOrRecover = () => {
      if (!mountedRef.current) return;
      const cached = responseCache.get(cacheKey) as
        | { data: T | null; error: string | null; expiresAt: number }
        | undefined;
      const isStale = !cached || cached.expiresAt <= Date.now();
      if (isStale) void fetchData(true);
    };
    const subFocus = DeviceEventEmitter.addListener("beautonomi:app:focus", onFocusOrRecover);
    const subRecover = DeviceEventEmitter.addListener("beautonomi:network:recover", onFocusOrRecover);
    return () => {
      subFocus.remove();
      subRecover.remove();
    };
  }, [enabled, cacheKey, fetchData]);

  useEffect(() => {
    if (!loading || !timeoutMs) {
      setTimedOut(false);
      return () => {};
    }
    const t = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(t);
  }, [loading, timeoutMs]);

  const refresh = useCallback(async () => {
    responseCache.delete(cacheKey);
    await fetchData();
  }, [cacheKey, fetchData]);

  const mutate = useCallback((newData: T) => {
    setData(newData);
  }, []);

  return { data, loading, error, timedOut, refresh, mutate };
}
