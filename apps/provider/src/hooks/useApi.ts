/**
 * Generic data fetching hooks with loading, error, refresh support.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import type { ApiError } from "@beautonomi/types";
import type { ApiClientRequestBody } from "@beautonomi/api";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { getRuntimeMarketHost } from "@/config/public-env";
import {
  responseCache,
  inflightRequests,
  pruneResponseCache,
  clearApiCache,
  invalidateApiCacheForPath,
} from "@/lib/api-response-cache";
import { useAuth } from "@/providers/AuthProvider";

export { clearApiCache };

const DEFAULT_LOADING_TIMEOUT_MS = 15000;
const DEFAULT_STALE_TIME_MS = 20000;

interface CacheEntry<T> {
  data: T | null;
  error: string | null;
  errorCode: string | null;
  expiresAt: number;
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
  /** API `error.code` when the server returned a structured error (e.g. SUBSCRIPTION_REQUIRED). */
  errorCode: string | null;
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
  const { session } = useAuth();
  const cacheScope = session?.user?.id ?? "_anon";
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const runtimeMarketHost = getRuntimeMarketHost().trim().toLowerCase() || "default";
  const cacheKey = `${cacheScope}::${runtimeMarketHost}::${path}`;

  // `silent=true` → background refresh: never show loading spinner if we
  // already have data. The WhatsApp/Airbnb pattern — show what we know,
  // swap it for fresh data when the network responds.
  const fetchData = useCallback(async (silent = false) => {
    if (!enabled) {
      setLoading(false);
      setErrorCode(null);
      return;
    }
    const id = ++requestIdRef.current;
    try {
      setTimedOut(false);

      const now = Date.now();
      const cached = responseCache.get(cacheKey) as CacheEntry<T> | undefined;
      if (cached && cached.expiresAt > now) {
        if (!mountedRef.current || id !== requestIdRef.current) return;
        setData(cached.data);
        setError(cached.error);
        setErrorCode(cached.errorCode ?? null);
        setLoading(false);
        return;
      }

      // Only show the loading spinner when we don't already have usable data.
      const hasExistingData = cached?.data != null;
      if (silent && hasExistingData) {
        // Background refresh — keep showing existing data, no spinner.
      } else {
        setLoading(true);
        setError(null);
        setErrorCode(null);
      }

      const inflight = inflightRequests.get(cacheKey) as
        | Promise<{ data: T | null; error: string | null; errorCode: string | null }>
        | undefined;
      const requestPromise =
        inflight ??
        (async () => {
          const result = await api.get<T>(path, timeoutMs > 0 ? { timeout: timeoutMs } : undefined);
          if (result.error) {
            const e = result.error as ApiError;
            return {
              data: null,
              error: getApiErrorMessage(e, "Request failed"),
              errorCode: e.code ?? null,
            };
          }
          return { data: result.data, error: null, errorCode: null };
        })();

      if (!inflight) {
        inflightRequests.set(
          cacheKey,
          requestPromise as Promise<{ data: unknown | null; error: string | null; errorCode: string | null }>
        );
      }

      let payload: { data: T | null; error: string | null; errorCode: string | null };
      try {
        payload = await requestPromise;
      } finally {
        // Only the request creator clears the inflight map entry.
        if (!inflight) {
          inflightRequests.delete(cacheKey);
        }
      }
      if (!mountedRef.current || id !== requestIdRef.current) return;

      // §Provider-launch (audit 2026-04): preserve last-known-good data on
      // refresh failure.  Screens like the calendar otherwise clear on any
      // blip (pull-to-refresh, backgrounded, flaky network) and show a
      // generic error over a previously-usable grid. We still propagate
      // the error so consumers can render a subtle banner, but we keep
      // `data` intact when we already had something cached.
      if (payload.error) {
        setError(payload.error);
        setErrorCode(payload.errorCode);
        // Only write the failure result into the response cache when we
        // don't already have a successful entry cached — this lets later
        // reads still hit the good data.
        const existing = responseCache.get(cacheKey);
        if (!existing || existing.error || !existing.data) {
          responseCache.set(cacheKey, {
            data: null,
            error: payload.error,
            errorCode: payload.errorCode,
            expiresAt: Date.now() + staleTimeMs,
          });
          setData(null);
        }
        // else: keep the previously-successful data & cached entry.
      } else {
        responseCache.set(cacheKey, {
          data: payload.data,
          error: null,
          errorCode: null,
          expiresAt: Date.now() + staleTimeMs,
        });
        setData(payload.data);
        setErrorCode(null);
      }
      pruneResponseCache(Date.now());
    } catch (err) {
      if (!mountedRef.current || id !== requestIdRef.current) return;
      // Same "keep stale data" rule for thrown errors (timeout / network).
      setError(getApiErrorMessage(err, "Request failed"));
      setErrorCode(null);
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
  // Skips the loading spinner if data is already present — mirrors how
  // WhatsApp and Airbnb keep their feeds always up-to-date on resume.
  useEffect(() => {
    if (!enabled) return;
    const onFocusOrRecover = () => {
      if (!mountedRef.current) return;
      const cached = responseCache.get(cacheKey) as CacheEntry<T> | undefined;
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
    responseCache.set(cacheKey, {
      data: newData,
      error: null,
      errorCode: null,
      expiresAt: Date.now() + staleTimeMs,
    });
    setData(newData);
  }, [cacheKey, staleTimeMs]);

  return { data, loading, error, errorCode, timedOut, refresh, mutate };
}

export function useApiPost<TReq extends ApiClientRequestBody, TRes>(path: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const execute = useCallback(
    async (
      body: TReq,
    ): Promise<{ data: TRes | null; error: string | null; errorCode: string | null }> => {
      try {
        setLoading(true);
        setError(null);
        setErrorCode(null);
        const result = await api.post<TRes>(path, body);
        if (result.error) {
          // §Provider-audit 2026-04: surface `error.code` so callers can
          // branch on specific server contracts (e.g. CONFLICT, CALENDAR_BLOCK,
          // RESOURCE_CONFLICT) instead of regex-matching the message. This
          // keeps error handling consistent with `useApiMutation`.
          const apiErr = result.error as ApiError;
          const msg = getApiErrorMessage(apiErr, "Request failed");
          if (mountedRef.current) {
            setError(msg);
            setErrorCode(apiErr.code ?? null);
          }
          return { data: null, error: msg, errorCode: apiErr.code ?? null };
        }
        return { data: result.data, error: null, errorCode: null };
      } catch (err) {
        const msg = getApiErrorMessage(err, "Request failed");
        if (mountedRef.current) {
          setError(msg);
          setErrorCode(null);
        }
        return { data: null, error: msg, errorCode: null };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [path]
  );

  return { execute, loading, error, errorCode };
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
    async (
      path: string,
      body?: ApiClientRequestBody
    ): Promise<{ data: TRes | null; error: string | null; errorCode: string | null }> => {
      try {
        setLoading(true);
        setError(null);
        let result;
        if (method === "delete") {
          result = await api.delete<TRes>(path);
        } else if (method === "patch") {
          result = await api.patch<TRes>(path, body);
        } else if (method === "post") {
          result = await api.post<TRes>(path, body);
        } else {
          result = await api.put<TRes>(path, body);
        }
        if (result.error) {
          const apiErr = result.error as ApiError;
          const msg = getApiErrorMessage(apiErr, "Request failed");
          if (mountedRef.current) setError(msg);
          return { data: null, error: msg, errorCode: apiErr.code ?? null };
        }
        invalidateApiCacheForPath(path);
        return { data: result.data, error: null, errorCode: null };
      } catch (err) {
        const msg = getApiErrorMessage(err, "Request failed");
        if (mountedRef.current) setError(msg);
        return { data: null, error: msg, errorCode: null };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [method]
  );

  return { execute, loading, error };
}
