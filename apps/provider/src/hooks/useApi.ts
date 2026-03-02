/**
 * Generic data fetching hooks with loading, error, refresh support.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api-client";

interface UseApiOptions {
  enabled?: boolean;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  mutate: (newData: T) => void;
}

export function useApi<T>(path: string, options: UseApiOptions = {}): UseApiResult<T> {
  const { enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
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
      const result = await api.get<T>(path);
      if (!mountedRef.current || id !== requestIdRef.current) return;
      if (result.error) {
        setError(result.error.message);
        setData(null);
      } else {
        setData(result.data);
      }
    } catch (err) {
      if (!mountedRef.current || id !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "Request failed");
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

  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const mutate = useCallback((newData: T) => {
    setData(newData);
  }, []);

  return { data, loading, error, refresh, mutate };
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
          if (mountedRef.current) setError(result.error.message);
          return { data: null, error: result.error.message };
        }
        return { data: result.data, error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Request failed";
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
          if (mountedRef.current) setError(result.error.message);
          return { data: null, error: result.error.message };
        }
        return { data: result.data, error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Request failed";
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
