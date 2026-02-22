/**
 * Utility functions for working with feature flags
 */

import { FEATURE_FLAGS, PERMISSIONS } from './permissions';

/**
 * Get feature flag key from constant or string
 */
export function getFeatureKey(key: string | keyof typeof FEATURE_FLAGS): string {
  if (key in FEATURE_FLAGS) {
    return FEATURE_FLAGS[key as keyof typeof FEATURE_FLAGS];
  }
  return key;
}

/**
 * Get permission key from constant or string
 */
export function getPermissionKey(key: string | keyof typeof PERMISSIONS): string {
  if (key in PERMISSIONS) {
    return PERMISSIONS[key as keyof typeof PERMISSIONS];
  }
  return key;
}

/**
 * Group feature flags by category
 */
export function groupFeaturesByCategory<T extends { category: string | null }>(
  features: T[]
): Record<string, T[]> {
  return features.reduce((acc, feature) => {
    const category = feature.category || 'uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(feature);
    return acc;
  }, {} as Record<string, T[]>);
}

/**
 * Check if any of the provided features are enabled
 */
export async function anyFeatureEnabled(
  featureKeys: string[],
  checkFn: (key: string) => Promise<boolean>
): Promise<boolean> {
  const results = await Promise.all(
    featureKeys.map(key => checkFn(key))
  );
  return results.some(enabled => enabled);
}

/**
 * Check if all of the provided features are enabled
 */
export async function allFeaturesEnabled(
  featureKeys: string[],
  checkFn: (key: string) => Promise<boolean>
): Promise<boolean> {
  const results = await Promise.all(
    featureKeys.map(key => checkFn(key))
  );
  return results.every(enabled => enabled);
}

/**
 * Get enabled features from a list
 */
export async function getEnabledFeatures(
  featureKeys: string[],
  checkFn: (key: string) => Promise<boolean>
): Promise<string[]> {
  const results = await Promise.all(
    featureKeys.map(async (key) => ({
      key,
      enabled: await checkFn(key),
    }))
  );
  return results.filter(r => r.enabled).map(r => r.key);
}
