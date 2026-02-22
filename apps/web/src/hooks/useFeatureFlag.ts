'use client';

import { useState, useEffect } from 'react';
import { isFeatureEnabled, checkMultipleFeatures } from '@/lib/feature-flags';

/**
 * Hook to check if a single feature is enabled
 * @param featureKey - The key of the feature to check
 * @returns { enabled: boolean, loading: boolean }
 */
export function useFeatureFlag(featureKey: string) {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function checkFeature() {
      setLoading(true);
      try {
        const isEnabled = await isFeatureEnabled(featureKey);
        if (mounted) {
          setEnabled(isEnabled);
        }
      } catch (error) {
        console.error(`Error checking feature flag ${featureKey}:`, error);
        if (mounted) {
          setEnabled(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    checkFeature();

    return () => {
      mounted = false;
    };
  }, [featureKey]);

  return { enabled, loading };
}

/**
 * Hook to check multiple features at once
 * @param featureKeys - Array of feature keys to check
 * @returns { features: Record<string, boolean>, loading: boolean }
 */
export function useMultipleFeatureFlags(featureKeys: string[]) {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function checkFeatures() {
      setLoading(true);
      try {
        const results = await checkMultipleFeatures(featureKeys);
        if (mounted) {
          setFeatures(results);
        }
      } catch (error) {
        console.error('Error checking feature flags:', error);
        if (mounted) {
          // Set all to false on error
          const fallback = featureKeys.reduce(
            (acc, key) => ({ ...acc, [key]: false }),
            {}
          );
          setFeatures(fallback);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (featureKeys.length > 0) {
      checkFeatures();
    } else {
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [featureKeys.join(',')]); // Re-run when keys change

  return { features, loading };
}
