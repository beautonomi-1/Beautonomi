/**
 * Generic data fetching hooks with loading, error, refresh support.
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
  /** After this many ms while loading, timedOut becomes true so UI can show "Retry" */
  timeoutMs?: number;
  /** Keep response in memory for this duration to reduce remount refetch churn. */
  staleTimeMs?: number;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** True when loading has exceeded timeoutMs; show "Taking too long? Retry" and call refresh */
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
        // Only the request creator clears the inflight map entry.
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
    const t = setTimeout(() => {
      setTimedOut(true);
    }, timeoutMs);
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

export function useApiPost<TReq, TRes>(path: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(
    async (body: TReq): Promise<{ data: TRes | null; error: string | null }> => {
      try {
        setLoading(true);
        setError(null);
        const result = await api.post<TRes>(path, body as Record<string, unknown>);
        if (result.error) {
          const msg = getApiErrorMessage(result.error, "Request failed");
          if (mountedRef.current) setError(msg);
          return { data: null, error: msg };
        }
        return { data: result.data, error: null };
      } catch (err) {
        const msg = getApiErrorMessage(err, "Request failed");
        if (mountedRef.current) setError(msg);
        return { data: null, error: msg };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [path]
  );

  return { execute, loading, error };
}

export function useApiMutation<TRes>(method: "put" | "patch" | "post" | "delete" = "put") {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(
    async (path: string, body?: Record<string, unknown> | object): Promise<{ data: TRes | null; error: string | null }> => {
      try {
        setLoading(true);
        setError(null);
        let result;
        if (method === "delete") {
          result = await api.delete<TRes>(path);
        } else if (method === "patch") {
          result = await api.patch<TRes>(path, body as Record<string, unknown>);
        } else if (method === "post") {
          result = await api.post<TRes>(path, body as Record<string, unknown>);
        } else {
          result = await api.put<TRes>(path, body as Record<string, unknown>);
        }
        if (result.error) {
          const msg = getApiErrorMessage(result.error, "Request failed");
          if (mountedRef.current) setError(msg);
          return { data: null, error: msg };
        }
        return { data: result.data, error: null };
      } catch (err) {
        const msg = getApiErrorMessage(err, "Request failed");
        if (mountedRef.current) setError(msg);
        return { data: null, error: msg };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [method]
  );

  return { execute, loading, error };
}
