/**
 * Generic data fetching hook with loading, error, refresh support.
 * Includes in-memory response cache and request deduplication to reduce
 * redundant network calls across component mounts/navigations.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import type { ApiError } from "@beautonomi/types";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  buildApiCacheKey,
  isNeverCachePath,
  prefetchApi,
  MONEY_SURFACE_STALE_TIME_MS,
} from "@/lib/api-cache-helpers";
import {
  responseCache,
  inflightRequests,
  pruneResponseCache,
  clearApiCache,
} from "@/lib/api-response-cache";
import { useAuth } from "@/providers/AuthProvider";

export { clearApiCache, prefetchApi, MONEY_SURFACE_STALE_TIME_MS };

const DEFAULT_LOADING_TIMEOUT_MS = 15000;
/** In-memory reuse — show cached data instantly; silent refresh on resume keeps UI stable. */
const DEFAULT_STALE_TIME_MS = 5 * 60 * 1000;
const RESUME_REFETCH_JITTER_BUCKETS = 16;
const RESUME_REFETCH_JITTER_MS = 120;

function isTransientFetchErrorCode(code: string | null | undefined): boolean {
  return code === "CANCELLED" || code === "TIMEOUT" || code === "NETWORK_ERROR";
}

function resumeRefetchJitterMs(cacheKey: string): number {
  let hash = 0;
  for (let i = 0; i < cacheKey.length; i += 1) {
    hash = (hash + cacheKey.charCodeAt(i)) % RESUME_REFETCH_JITTER_BUCKETS;
  }
  return hash * RESUME_REFETCH_JITTER_MS;
}

interface UseApiOptions {
  enabled?: boolean;
  timeoutMs?: number;
  /** Keep response in memory for this duration to reduce remount refetch churn. */
  staleTimeMs?: number;
  /** Silent revalidate every time the screen gains focus (money / ledger surfaces). */
  revalidateOnFocus?: boolean;
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
    revalidateOnFocus = false,
  } = options;
  const { session } = useAuth();
  const cacheKey = buildApiCacheKey(session?.user?.id, path);
  // Payment / checkout state must never be served from a stale entry, so those
  // paths read and write nothing. In-flight dedupe still applies (same tick).
  const cacheable = !isNeverCachePath(path);

  const [data, setData] = useState<T | null>(() => {
    if (!enabled || !cacheable) return null;
    const c = responseCache.get(cacheKey) as
      | { data: T | null; error: string | null; expiresAt: number }
      | undefined;
    return c && c.expiresAt > Date.now() ? c.data : null;
  });
  const [error, setError] = useState<string | null>(() => {
    if (!enabled || !cacheable) return null;
    const c = responseCache.get(cacheKey) as
      | { data: T | null; error: string | null; expiresAt: number }
      | undefined;
    return c && c.expiresAt > Date.now() ? c.error : null;
  });
  const [loading, setLoading] = useState(() => {
    if (!enabled) return false;
    if (!cacheable) return true;
    const c = responseCache.get(cacheKey) as
      | { data: T | null; error: string | null; expiresAt: number }
      | undefined;
    return !(c && c.expiresAt > Date.now());
  });
  const [timedOut, setTimedOut] = useState(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async (silent = false) => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++requestIdRef.current;
    try {
      setTimedOut(false);

      const now = Date.now();
      const cached = cacheable
        ? (responseCache.get(cacheKey) as
            | { data: T | null; error: string | null; expiresAt: number }
            | undefined)
        : undefined;
      if (!silent && cached && cached.expiresAt > now) {
        if (!mountedRef.current || id !== requestIdRef.current) return;
        setData(cached.data);
        setError(cached.error);
        setLoading(false);
        return;
      }

      const hasExistingData = cached?.data != null;
      if (silent && hasExistingData) {
        if (!mountedRef.current || id !== requestIdRef.current) return;
        setData(cached!.data);
        setError(cached!.error);
        setError(null);
      } else if (!silent) {
        setLoading(true);
        setError(null);
      } else {
        setError(null);
      }

      const inflight = inflightRequests.get(cacheKey) as
        | Promise<{ data: T | null; error: string | null; errorCode?: string | null; cancelled?: boolean }>
        | undefined;
      const requestPromise =
        inflight ??
        (async () => {
          const result = await api.get<T>(path, timeoutMs > 0 ? { timeout: timeoutMs } : undefined);
          if (result.error) {
            const apiErr = result.error as ApiError;
            if (apiErr.code === "CANCELLED") {
              return { data: null, error: null, errorCode: "CANCELLED", cancelled: true };
            }
            return {
              data: null,
              error: getApiErrorMessage(apiErr, "Request failed"),
              errorCode: apiErr.code ?? null,
            };
          }
          return { data: result.data, error: null, errorCode: null };
        })();

      if (!inflight) {
        inflightRequests.set(cacheKey, requestPromise as Promise<{ data: unknown | null; error: string | null }>);
      }

      let payload: {
        data: T | null;
        error: string | null;
        errorCode?: string | null;
        cancelled?: boolean;
      };
      try {
        payload = await requestPromise;
      } finally {
        if (!inflight) {
          inflightRequests.delete(cacheKey);
        }
      }
      if (!mountedRef.current || id !== requestIdRef.current) return;

      if (payload.cancelled || isTransientFetchErrorCode(payload.errorCode)) {
        return;
      }

      if (payload.error) {
        setError(payload.error);
        const existing = cacheable ? responseCache.get(cacheKey) : undefined;
        if (!existing?.data) {
          if (cacheable) {
            responseCache.set(cacheKey, {
              data: null,
              error: payload.error,
              expiresAt: Date.now() + staleTimeMs,
            });
          }
          setData(null);
        }
      } else {
        if (cacheable) {
          responseCache.set(cacheKey, {
            data: payload.data,
            error: null,
            expiresAt: Date.now() + staleTimeMs,
          });
        }
        setData(payload.data);
        setError(null);
      }
      pruneResponseCache(Date.now());
    } catch (err) {
      if (!mountedRef.current || id !== requestIdRef.current) return;
      const existing = cacheable ? responseCache.get(cacheKey) : undefined;
      if (existing?.data != null) return;
      setError(getApiErrorMessage(err, "Request failed"));
    } finally {
      if (mountedRef.current && id === requestIdRef.current) setLoading(false);
    }
  }, [cacheKey, path, enabled, staleTimeMs, timeoutMs, cacheable]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  useEffect(() => {
    if (!enabled) return;
    const onFocusOrRecover = () => {
      if (!mountedRef.current) return;
      const jitterMs = resumeRefetchJitterMs(cacheKey);
      setTimeout(() => {
        if (!mountedRef.current) return;
        void fetchData(true);
      }, jitterMs);
    };
    const subFocus = DeviceEventEmitter.addListener("beautonomi:app:focus", onFocusOrRecover);
    const subRecover = DeviceEventEmitter.addListener("beautonomi:network:recover", onFocusOrRecover);
    return () => {
      subFocus.remove();
      subRecover.remove();
    };
  }, [enabled, cacheKey, fetchData]);

  useEffect(() => {
    if (!enabled || !revalidateOnFocus) return;
    const onScreenFocus = () => {
      if (!mountedRef.current) return;
      void fetchData(true);
    };
    const sub = DeviceEventEmitter.addListener("beautonomi:app:focus", onScreenFocus);
    return () => sub.remove();
  }, [enabled, revalidateOnFocus, fetchData]);

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
    if (cacheable) {
      responseCache.set(cacheKey, {
        data: newData,
        error: null,
        expiresAt: Date.now() + staleTimeMs,
      });
    }
    setData(newData);
    setError(null);
  }, [cacheKey, staleTimeMs, cacheable]);

  return { data, loading, error, timedOut, refresh, mutate };
}
