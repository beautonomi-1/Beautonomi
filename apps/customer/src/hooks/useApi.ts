/**
 * Generic data fetching hook with loading, error, refresh support.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";

const DEFAULT_LOADING_TIMEOUT_MS = 15000;

interface UseApiOptions {
  enabled?: boolean;
  timeoutMs?: number;
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
  const { enabled = true, timeoutMs = DEFAULT_LOADING_TIMEOUT_MS } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

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
      const result = await api.get<T>(path);
      if (!mountedRef.current || id !== requestIdRef.current) return;
      if (result.error) {
        setError(getApiErrorMessage(result.error, "Request failed"));
        setData(null);
      } else {
        setData(result.data);
      }
    } catch (err) {
      if (!mountedRef.current || id !== requestIdRef.current) return;
      setError(getApiErrorMessage(err, "Request failed"));
    } finally {
      if (mountedRef.current && id === requestIdRef.current) setLoading(false);
    }
  }, [path, enabled]);

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
    await fetchData();
  }, [fetchData]);

  const mutate = useCallback((newData: T) => {
    setData(newData);
  }, []);

  return { data, loading, error, timedOut, refresh, mutate };
}
