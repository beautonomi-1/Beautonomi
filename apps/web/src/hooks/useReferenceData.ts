"use client";

import { useState, useEffect, useCallback } from "react";

export interface ReferenceDataItem {
  id: string;
  type: string;
  value: string;
  label: string;
  description?: string;
  display_order: number;
  is_active: boolean;
  metadata: Record<string, any>;
}

export interface ReferenceDataMap {
  [type: string]: ReferenceDataItem[];
}

// Reference data types available
export type ReferenceDataType =
  | "service_type"
  | "duration"
  | "price_type"
  | "availability"
  | "tax_rate"
  | "team_role"
  | "reminder_unit"
  | "extra_time"
  | "payment_method"
  | "booking_status"
  | "currency"
  | "cancellation_reason"
  | "discount_type"
  | "notification_channel"
  | "product_unit"
  | "working_day"
  | "commission_type"
  | "addon_category";

// Cache for reference data to avoid repeated fetches
let referenceDataCache: ReferenceDataMap | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to fetch and use reference data for dropdowns across the provider portal.
 * 
 * @param types - Optional array of specific types to fetch. If not provided, fetches all.
 * @returns Object containing reference data, loading state, error, and helper functions
 * 
 * @example
 * ```tsx
 * const { data, isLoading, getOptions } = useReferenceData(["service_type", "duration"]);
 * 
 * // Use in a Select component
 * <Select>
 *   {getOptions("service_type").map(opt => (
 *     <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
 *   ))}
 * </Select>
 * ```
 */
export function useReferenceData(types?: ReferenceDataType[]) {
  const [data, setData] = useState<ReferenceDataMap>(referenceDataCache || {});
  const [isLoading, setIsLoading] = useState(!referenceDataCache);
  const [error, setError] = useState<string | null>(null);

  const fetchReferenceData = useCallback(async () => {
    // Check cache validity
    if (
      referenceDataCache &&
      cacheTimestamp &&
      Date.now() - cacheTimestamp < CACHE_DURATION
    ) {
      setData(referenceDataCache);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const typesQuery = types?.length ? `?type=${types.join(",")}` : "";
      const response = await fetch(`/api/provider/reference-data${typesQuery}`);

      if (!response.ok) {
        throw new Error("Failed to fetch reference data");
      }

      const result = await response.json();
      const referenceData = result.data || {};

      // Update cache
      referenceDataCache = { ...referenceDataCache, ...referenceData };
      cacheTimestamp = Date.now();

      setData(referenceDataCache ?? {});
    } catch (err) {
      console.error("Error fetching reference data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch reference data");
      
      // Use fallback data if available
      if (referenceDataCache) {
        setData(referenceDataCache ?? {});
      }
    } finally {
      setIsLoading(false);
    }
  }, [types]);

  useEffect(() => {
    fetchReferenceData();
  }, [fetchReferenceData]);

  /**
   * Get options for a specific reference data type
   */
  const getOptions = useCallback(
    (type: ReferenceDataType): ReferenceDataItem[] => {
      return data[type] || [];
    },
    [data]
  );

  /**
   * Get a single option by type and value
   */
  const getOption = useCallback(
    (type: ReferenceDataType, value: string): ReferenceDataItem | undefined => {
      return data[type]?.find((item) => item.value === value);
    },
    [data]
  );

  /**
   * Get the label for a specific value
   */
  const getLabel = useCallback(
    (type: ReferenceDataType, value: string): string => {
      const option = getOption(type, value);
      return option?.label || value;
    },
    [getOption]
  );

  /**
   * Refresh the reference data (bypass cache)
   */
  const refresh = useCallback(async () => {
    referenceDataCache = null;
    cacheTimestamp = null;
    await fetchReferenceData();
  }, [fetchReferenceData]);

  return {
    data,
    isLoading,
    error,
    getOptions,
    getOption,
    getLabel,
    refresh,
  };
}

/**
 * Clear the reference data cache
 */
export function clearReferenceDataCache() {
  referenceDataCache = null;
  cacheTimestamp = null;
}

/**
 * Prefetch reference data (can be called on app init)
 */
export async function prefetchReferenceData(): Promise<ReferenceDataMap> {
  if (
    referenceDataCache &&
    cacheTimestamp &&
    Date.now() - cacheTimestamp < CACHE_DURATION
  ) {
    return referenceDataCache;
  }

  try {
    const response = await fetch("/api/provider/reference-data");
    if (!response.ok) {
      throw new Error("Failed to fetch reference data");
    }

    const result = await response.json();
    referenceDataCache = result.data || {};
    cacheTimestamp = Date.now();

    return referenceDataCache ?? {};
  } catch (err) {
    console.error("Error prefetching reference data:", err);
    return {};
  }
}

export default useReferenceData;
