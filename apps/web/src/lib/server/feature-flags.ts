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

type FlagRowDb = {
  feature_key: string;
  enabled: boolean;
  tenant_id: string | null;
};

function enabledForKeyFromRows(
  rows: FlagRowDb[],
  featureKey: string,
  tenantId: string | null | undefined
): boolean {
  const matches = rows.filter((r) => r.feature_key === featureKey);
  if (tenantId) {
    const t = matches.find((r) => r.tenant_id === tenantId);
    if (t) return Boolean(t.enabled);
  }
  const g = matches.find((r) => r.tenant_id == null);
  return g ? Boolean(g.enabled) : false;
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
            // This can be ignored if you have proxy refreshing cookies
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Check if a feature is enabled (server-side). Uses service role for reads (RLP-safe).
 * When tenantId is set, a tenant-specific row overrides the global row for that key.
 */
export async function isFeatureEnabledServer(
  featureKey: string,
  tenantId?: string | null
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    let q = supabase.from("feature_flags").select("enabled, tenant_id").eq("feature_key", featureKey);
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

    if (tenantId) {
      const tenantRow = data.find((r) => r.tenant_id === tenantId);
      if (tenantRow) return Boolean(tenantRow.enabled);
    }
    const globalRow = data.find((r) => r.tenant_id == null);
    return globalRow ? Boolean(globalRow.enabled) : false;
  } catch (error) {
    console.error(`Error checking feature flag ${featureKey}:`, error);
    return false;
  }
}

/**
 * Check multiple features at once (server-side)
 */
export async function checkMultipleFeaturesServer(
  featureKeys: string[],
  tenantId?: string | null
): Promise<Record<string, boolean>> {
  if (featureKeys.length === 0) return {};

  try {
    const supabase = getSupabaseAdmin();

    let q = supabase
      .from("feature_flags")
      .select("feature_key, enabled, tenant_id")
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
      result[key] = enabledForKeyFromRows(rows, key, tenantId);
    });

    return result;
  } catch (error) {
    console.error("Error checking feature flags:", error);
    return featureKeys.reduce((acc, key) => ({ ...acc, [key]: false }), {});
  }
}

/**
 * Get all feature flags (server-side, admin only)
 * @returns Promise<FeatureFlag[]>
 */
export async function getAllFeatureFlagsServer(): Promise<FeatureFlag[]> {
  try {
    const supabase = await getSupabaseClient();

    // Check if user is superadmin
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
 * @param userRole - The user's role
 * @param permissionKey - The permission key to check
 * @returns Promise<boolean>
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
