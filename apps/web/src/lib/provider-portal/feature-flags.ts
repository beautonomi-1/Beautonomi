/**
 * Feature flags utility for provider portal
 * Integrates with the feature_flags table to check if features are enabled
 */

import { fetcher } from "@/lib/http/fetcher";
import { safeAsync } from "./error-handler";

interface FeatureFlag {
  feature_key: string;
  feature_name: string;
  enabled: boolean;
  category?: string;
  metadata?: Record<string, any>;
}

// Cache for feature flags to reduce API calls
let featureFlagsCache: Map<string, boolean> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a feature is enabled
 * Uses caching to reduce API calls
 */
export async function isFeatureEnabled(featureKey: string): Promise<boolean> {
  // Check cache first
  const now = Date.now();
  if (featureFlagsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return featureFlagsCache.get(featureKey) ?? false;
  }

  // Fetch from API
  try {
    const response = await safeAsync(
      () => fetcher.get<{ data: FeatureFlag[] }>("/api/provider/feature-flags"),
      { data: [] }
    );

    const flags = response?.data;
    if (flags && Array.isArray(flags)) {
      // Update cache
      featureFlagsCache = new Map();
      flags.forEach((flag) => {
        featureFlagsCache!.set(flag.feature_key, flag.enabled);
      });
      cacheTimestamp = now;
      return featureFlagsCache.get(featureKey) ?? false;
    }

    // If API fails, return false (feature disabled by default)
    return false;
  } catch (error) {
    console.error(`Failed to check feature flag ${featureKey}:`, error);
    return false; // Default to disabled on error
  }
}

/**
 * Check multiple features at once
 */
export async function areFeaturesEnabled(
  featureKeys: string[]
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  
  // Check cache first
  const now = Date.now();
  if (featureFlagsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    featureKeys.forEach((key) => {
      results[key] = featureFlagsCache!.get(key) ?? false;
    });
    return results;
  }

  // Fetch from API
  try {
    const result = await safeAsync(
      async () => {
        const response = await fetcher.get<{ data: FeatureFlag[] }>("/api/provider/feature-flags");
        return response.data || [];
      },
      []
    );

    if (result && Array.isArray(result)) {
      // Update cache
      featureFlagsCache = new Map();
      result.forEach((flag) => {
        featureFlagsCache!.set(flag.feature_key, flag.enabled);
      });
      cacheTimestamp = now;

      featureKeys.forEach((key) => {
        results[key] = featureFlagsCache!.get(key) ?? false;
      });
    } else {
      // Default all to false if API fails
      featureKeys.forEach((key) => {
        results[key] = false;
      });
    }
  } catch (error) {
    console.error("Failed to check feature flags:", error);
    // Default all to false on error
    featureKeys.forEach((key) => {
      results[key] = false;
    });
  }

  return results;
}

/**
 * Clear the feature flags cache (useful after feature flag updates)
 */
export function clearFeatureFlagsCache(): void {
  featureFlagsCache = null;
  cacheTimestamp = 0;
}

/**
 * React hook for feature flags (if using React)
 */
export function useFeatureFlag(_featureKey: string): boolean {
  // This would need to be implemented with useState/useEffect
  // For now, this is a placeholder for future React integration
  return false;
}
