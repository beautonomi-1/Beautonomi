/**
 * Server-side Feature Flags Utility
 * For use in Server Components and API routes
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  tenant_id?: string | null;
}

/**
 * Optional context used to evaluate advanced flag targeting.
 * When provided, rollout_percent, platforms_allowed, and roles_allowed
 * are respected server-side (matching mobile/web bundle behaviour).
 */
export interface FeatureFlagCheckContext {
  /** Platform identifier: "web" | "ios" | "android" | "admin" */
  platform?: string;
  /** Caller's role (used against roles_allowed column). */
  role?: string;
  /** App semver string (used against min_app_version column). */
  appVersion?: string;
  /**
   * Stable identifier for rollout bucketing (e.g. user ID or session ID).
   * When omitted, rollout_percent is not applied (flag is treated as fully on).
   */
  bucketId?: string;
}

type FlagRowDb = {
  feature_key: string;
  enabled: boolean;
  tenant_id: string | null;
  metadata?: Record<string, unknown> | null;
  rollout_percent?: number | null;
  platforms_allowed?: string[] | null;
  roles_allowed?: string[] | null;
  min_app_version?: string | null;
};

// ─── Rollout bucketing ────────────────────────────────────────────────────────

/** Stable 0–99 bucket for a given feature + bucketId pair (deterministic, no DB). */
function getBucket(featureKey: string, bucketId: string): number {
  let hash = 5381;
  const str = `${featureKey}:${bucketId}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash % 100;
}

/** Returns true if the flag row passes all advanced targeting for the given context. */
function compareAppVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .trim()
      .replace(/^v/i, "")
      .split(/[+-]/)[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const caller = parse(a);
  const required = parse(b);
  const maxLen = Math.max(caller.length, required.length);
  for (let i = 0; i < maxLen; i++) {
    const c = caller[i] ?? 0;
    const r = required[i] ?? 0;
    if (c < r) return -1;
    if (c > r) return 1;
  }
  return 0;
}

function passesContext(row: FlagRowDb, ctx: FeatureFlagCheckContext | undefined): boolean {
  if (!row.enabled) return false;
  if (!ctx) return true;

  // Platform filter
  if (ctx.platform && row.platforms_allowed && row.platforms_allowed.length > 0) {
    if (!row.platforms_allowed.includes(ctx.platform)) return false;
  }

  // Role filter
  if (ctx.role && row.roles_allowed && row.roles_allowed.length > 0) {
    if (!row.roles_allowed.includes(ctx.role)) return false;
  }

  // Semver min_app_version: tolerate v-prefixes and build metadata from native runtimes.
  if (ctx.appVersion && row.min_app_version) {
    if (compareAppVersions(ctx.appVersion, row.min_app_version) < 0) return false;
  }

  // Rollout percent
  if (ctx.bucketId && row.rollout_percent != null && row.rollout_percent < 100) {
    const bucket = getBucket(row.feature_key, ctx.bucketId);
    if (bucket >= row.rollout_percent) return false;
  }

  return true;
}

function resolveRowFromMatches(
  matches: FlagRowDb[],
  tenantId: string | null | undefined,
  ctx: FeatureFlagCheckContext | undefined
): boolean {
  // Tenant row takes precedence over global row (same key)
  if (tenantId) {
    const tenantRow = matches.find((r) => r.tenant_id === tenantId);
    if (tenantRow) return passesContext(tenantRow, ctx);
  }
  const globalRow = matches.find((r) => r.tenant_id == null);
  return globalRow ? passesContext(globalRow, ctx) : false;
}

function enabledForKeyFromRows(
  rows: FlagRowDb[],
  featureKey: string,
  tenantId: string | null | undefined,
  ctx?: FeatureFlagCheckContext
): boolean {
  const matches = rows.filter((r) => r.feature_key === featureKey);
  return resolveRowFromMatches(matches, tenantId, ctx);
}

/**
 * Get Supabase client for server-side operations
 */
async function getSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  );
}

/**
 * Check if a feature is enabled (server-side). Uses service role for reads (RLS-safe).
 *
 * When `tenantId` is set, a tenant-specific row overrides the global row for that key.
 * When `ctx` is provided, rollout_percent, platforms_allowed, roles_allowed, and
 * min_app_version are enforced — matching the behaviour of the mobile/web public bundle.
 * Without `ctx`, only `enabled` and tenant override are checked (legacy behaviour preserved).
 */
export async function isFeatureEnabledServer(
  featureKey: string,
  tenantId?: string | null,
  ctx?: FeatureFlagCheckContext
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("feature_flags")
      .select("feature_key, enabled, tenant_id, rollout_percent, platforms_allowed, roles_allowed, min_app_version")
      .eq("feature_key", featureKey);

    if (tenantId) {
      q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    } else {
      q = q.is("tenant_id", null);
    }

    const { data, error } = await q;

    if (error || !data?.length) {
      if (error) console.warn(`Feature flag not found or error: ${featureKey}`, error);
      return false;
    }

    return resolveRowFromMatches(data as FlagRowDb[], tenantId, ctx);
  } catch (error) {
    console.error(`Error checking feature flag ${featureKey}:`, error);
    return false;
  }
}

/**
 * Returns metadata for a feature flag (tenant override wins over global).
 */
export async function getFeatureFlagMetadata(
  featureKey: string,
  tenantId?: string | null,
): Promise<Record<string, unknown>> {
  try {
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("feature_flags")
      .select("feature_key, tenant_id, metadata")
      .eq("feature_key", featureKey);

    if (tenantId) {
      q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    } else {
      q = q.is("tenant_id", null);
    }

    const { data, error } = await q;
    if (error || !data?.length) return {};

    const rows = data as Array<{ tenant_id: string | null; metadata?: Record<string, unknown> | null }>;
    const tenantRow = tenantId ? rows.find((r) => r.tenant_id === tenantId) : null;
    const globalRow = rows.find((r) => r.tenant_id == null);
    const meta = tenantRow?.metadata ?? globalRow?.metadata;
    return meta && typeof meta === "object" ? meta : {};
  } catch (error) {
    console.error(`Error reading feature flag metadata ${featureKey}:`, error);
    return {};
  }
}

/**
 * Check multiple features at once (server-side)
 */
export async function checkMultipleFeaturesServer(
  featureKeys: string[],
  tenantId?: string | null,
  ctx?: FeatureFlagCheckContext
): Promise<Record<string, boolean>> {
  if (featureKeys.length === 0) return {};

  try {
    const supabase = getSupabaseAdmin();

    let q = supabase
      .from("feature_flags")
      .select("feature_key, enabled, tenant_id, rollout_percent, platforms_allowed, roles_allowed, min_app_version")
      .in("feature_key", featureKeys);

    if (tenantId) {
      q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    } else {
      q = q.is("tenant_id", null);
    }

    const { data, error } = await q;

    if (error) {
      console.error("Error fetching feature flags:", error);
      return featureKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {});
    }

    const rows = (data ?? []) as FlagRowDb[];
    const result: Record<string, boolean> = {};
    featureKeys.forEach((key) => {
      result[key] = enabledForKeyFromRows(rows, key, tenantId, ctx);
    });

    return result;
  } catch (error) {
    console.error("Error checking feature flags:", error);
    return featureKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {});
  }
}

/**
 * Get all feature flags (server-side, admin only)
 */
export async function getAllFeatureFlagsServer(): Promise<FeatureFlag[]> {
  try {
    const supabase = await getSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.user_metadata?.role !== "superadmin") {
      throw new Error("Unauthorized: Superadmin access required");
    }

    const { data, error } = await supabase
      .from("feature_flags")
      .select("*")
      .order("category", { ascending: true })
      .order("feature_name", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch feature flags: ${error.message}`);
    }

    return data ?? [];
  } catch (error) {
    console.error("Error fetching feature flags:", error);
    throw error;
  }
}

/**
 * Check if user has a specific permission (server-side)
 */
export async function hasPermissionServer(
  userRole: string,
  permissionKey: string
): Promise<boolean> {
  try {
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase.rpc("has_permission", {
      user_role: userRole,
      permission_key_param: permissionKey,
    });

    if (error) {
      console.error("Error checking permission:", error);
      return false;
    }

    return data ?? false;
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}
