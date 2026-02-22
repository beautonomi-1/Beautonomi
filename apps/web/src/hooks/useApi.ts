/**
 * Custom hook for API calls with loading and error states
 */

import { useState, useCallback } from 'react';
import { handleApiError } from '@/lib/api/client';
import { toast } from 'sonner';

export interface UseApiOptions<T> {
  showToast?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  initialData?: T | null;
}

export function useApi<T>(options: UseApiOptions<T> = {}) {
  const { showToast = true, onSuccess, onError, initialData = null } = options;

  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (apiCall: () => Promise<T>) => {
      try {
        setLoading(true);
        setError(null);

        const result = await apiCall();
        setData(result);

        if (onSuccess) {
          onSuccess(result);
        }

        return result;
      } catch (err) {
        const errorMessage = handleApiError(err);
        setError(errorMessage);

        if (showToast) {
          toast.error(errorMessage);
        }

        if (onError) {
          onError(errorMessage);
        }

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [showToast, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
  }, [initialData]);

  return {
    data,
    loading,
    error,
    execute,
    reset,
    setData, // Allow manual data updates if needed
  };
}

/**
 * Hook for fetching data on mount
 */
export function useApiData<T>(
  apiCall: () => Promise<T>,
  options: UseApiOptions<T> & { deps?: unknown[] } = {}
) {
  const { deps: _deps = [], ...apiOptions } = options;
  const api = useApi<T>(apiOptions);

  const fetchData = useCallback(async () => {
    return api.execute(apiCall);
  }, [api.execute, apiCall]);

  // Note: This hook doesn't auto-fetch on mount to avoid issues with SSR
  // Call fetchData() manually in useEffect if needed

  return {
    ...api,
    fetchData,
  };
}
