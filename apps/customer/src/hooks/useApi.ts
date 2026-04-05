/**
 * Generic data fetching hook with loading, error, refresh support.
 * Includes in-memory response cache and request deduplication to reduce
 * redundant network calls across component mounts/navigations.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { getRuntimeMarketHost } from "@/config/public-env";

const DEFAULT_LOADING_TIMEOUT_MS = 15000;
const DEFAULT_STALE_TIME_MS = 20000;
const MAX_CACHE_ENTRIES = 200;

interface CacheEntry<T> {
  data: T | null;
  error: string | null;
  expiresAt: number;
}

const responseCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<{ data: unknown | null; error: string | null }>>();

export function clearApiCache(): void {
  responseCache.clear();
  inflightRequests.clear();
}

function pruneResponseCache(now: number): void {
  for (const [key, entry] of responseCache.entries()) {
    if (entry.expiresAt <= now) {
      responseCache.delete(key);
    }
  }

  if (responseCache.size <= MAX_CACHE_ENTRIES) return;

  const overflow = responseCache.size - MAX_CACHE_ENTRIES;
  let removed = 0;
  for (const key of responseCache.keys()) {
    responseCache.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

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
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const runtimeMarketHost = getRuntimeMarketHost().trim().toLowerCase() || "default";
  const cacheKey = `${runtimeMarketHost}::${path}`;

  const fetchData = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++requestIdRef.current;
    try {
      setLoading(true);
      setError(null);
      setTimedOut(false);

      const now = Date.now();
      const cached = responseCache.get(cacheKey) as CacheEntry<T> | undefined;
      if (cached && cached.expiresAt > now) {
        if (!mountedRef.current || id !== requestIdRef.current) return;
        setData(cached.data);
        setError(cached.error);
        setLoading(false);
        return;
      }

      const inflight = inflightRequests.get(cacheKey) as Promise<{ data: T | null; error: string | null }> | undefined;
      const requestPromise =
        inflight ??
        (async () => {
          const result = await api.get<T>(path);
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
  }, [cacheKey, path, enabled, staleTimeMs]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

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
