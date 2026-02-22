/**
 * Feature Flags Utility
 * Functions to check if features are enabled
 */

export interface FeatureFlag {
  id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  enabled: boolean;
  category: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  /** Control plane: rollout percentage 0-100 (default 100) */
  rollout_percent?: number | null;
  /** Allowed platforms: web, customer, provider; null = all */
  platforms_allowed?: string[] | null;
  /** Allowed roles; null = all */
  roles_allowed?: string[] | null;
  /** Minimum app version (semver); null = no minimum */
  min_app_version?: string | null;
  /** Allowed environments: production, staging, development; null = all */
  environments_allowed?: string[] | null;
}

/**
 * Check if a feature is enabled
 * @param featureKey - The key of the feature to check
 * @returns Promise<boolean> - True if feature is enabled, false otherwise
 */
export async function isFeatureEnabled(featureKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/feature-flags/check?key=${encodeURIComponent(featureKey)}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      console.warn(`Failed to check feature flag: ${featureKey}`);
      return false;
    }

    const data = await response.json();
    return data.enabled ?? false;
  } catch (error) {
    console.error(`Error checking feature flag ${featureKey}:`, error);
    return false;
  }
}

/**
 * Check multiple features at once
 * @param featureKeys - Array of feature keys to check
 * @returns Promise<Record<string, boolean>> - Object mapping feature keys to enabled status
 */
export async function checkMultipleFeatures(
  featureKeys: string[]
): Promise<Record<string, boolean>> {
  try {
    const response = await fetch('/api/feature-flags/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keys: featureKeys }),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn('Failed to check feature flags');
      // Return all false as fallback
      return featureKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {});
    }

    const data = await response.json();
    return data.features ?? {};
  } catch (error) {
    console.error('Error checking feature flags:', error);
    // Return all false as fallback
    return featureKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {});
  }
}

/**
 * Get all feature flags (admin only)
 * @returns Promise<FeatureFlag[]>
 */
export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
  try {
    const response = await fetch('/api/admin/feature-flags', {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch feature flags');
    }

    const data = await response.json();
    return data.featureFlags ?? [];
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    throw error;
  }
}

/**
 * Update a feature flag (admin only)
 * @param id - Feature flag ID
 * @param updates - Partial feature flag data to update
 * @returns Promise<FeatureFlag>
 */
export async function updateFeatureFlag(
  id: string,
  updates: Partial<FeatureFlag>
): Promise<FeatureFlag> {
  try {
    const response = await fetch(`/api/admin/feature-flags/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update feature flag');
    }

    const data = await response.json();
    return data.featureFlag;
  } catch (error) {
    console.error('Error updating feature flag:', error);
    throw error;
  }
}

/**
 * Create a new feature flag (admin only)
 * @param featureFlag - Feature flag data
 * @returns Promise<FeatureFlag>
 */
export async function createFeatureFlag(
  featureFlag: Omit<FeatureFlag, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>
): Promise<FeatureFlag> {
  try {
    const response = await fetch('/api/admin/feature-flags', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(featureFlag),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create feature flag');
    }

    const data = await response.json();
    return data.featureFlag;
  } catch (error) {
    console.error('Error creating feature flag:', error);
    throw error;
  }
}

/**
 * Delete a feature flag (admin only)
 * @param id - Feature flag ID
 */
export async function deleteFeatureFlag(id: string): Promise<void> {
  try {
    const response = await fetch(`/api/admin/feature-flags/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete feature flag');
    }
  } catch (error) {
    console.error('Error deleting feature flag:', error);
    throw error;
  }
}
