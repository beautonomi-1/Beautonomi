import type { SupabaseClient } from "@supabase/supabase-js";

type TenantHints = {
  userId?: string | null;
  providerId?: string | null;
};

/**
 * Best-effort tenant for OneSignal credential resolution (tenant-scoped platform_settings).
 * Returns null when unknown — callers should still send via env/global/any-scope fallback.
 */
export async function resolveTenantIdForPush(
  admin: SupabaseClient,
  hints?: TenantHints,
): Promise<string | null> {
  const providerId =
    typeof hints?.providerId === "string" && hints.providerId.trim()
      ? hints.providerId.trim()
      : null;
  if (providerId) {
    const { data } = await admin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const tid = (data as { tenant_id?: string | null } | null)?.tenant_id;
    if (typeof tid === "string" && tid.trim()) return tid.trim();
  }

  const userId =
    typeof hints?.userId === "string" && hints.userId.trim() ? hints.userId.trim() : null;
  if (!userId) return null;

  const { data: userRow } = await admin
    .from("users")
    .select("preferred_home_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const home = (userRow as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id;
  if (typeof home === "string" && home.trim()) return home.trim();

  const { data: provRow } = await admin
    .from("providers")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  const provTenant = (provRow as { tenant_id?: string | null } | null)?.tenant_id;
  if (typeof provTenant === "string" && provTenant.trim()) return provTenant.trim();

  return null;
}
