/**
 * Merge global feature_flag rows (tenant_id IS NULL) with tenant-specific overrides.
 * For each feature_key, a tenant row replaces the global row.
 */
export type FeatureFlagMergeRow = {
  feature_key: string;
  enabled: boolean;
  rollout_percent?: number | null;
  platforms_allowed?: string[] | null;
  roles_allowed?: string[] | null;
  min_app_version?: string | null;
  environments_allowed?: string[] | null;
};

export function mergeGlobalAndTenantFeatureFlags<T extends FeatureFlagMergeRow>(
  globalRows: T[],
  tenantRows: T[]
): T[] {
  const byKey = new Map<string, T>();
  for (const row of globalRows) {
    byKey.set(row.feature_key, row);
  }
  for (const row of tenantRows) {
    byKey.set(row.feature_key, row);
  }
  return Array.from(byKey.values());
}
