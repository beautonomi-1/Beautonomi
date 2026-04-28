import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { mergeAuthFromSettingsJson } from "@/lib/config/auth-policy-public";

/**
 * Global + optional tenant `platform_settings` row; merges `settings.auth`.
 */
export async function resolvePublicAuthPolicyForTenant(
  tenantId: string | null | undefined
): Promise<ReturnType<typeof mergeAuthFromSettingsJson>> {
  const supabase = getSupabaseAdmin();
  const { data: globalRow } = await supabase
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true)
    .is("tenant_id", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const global = (globalRow as { settings?: Record<string, unknown> } | null)?.settings;

  if (!tenantId) {
    return mergeAuthFromSettingsJson(global, null);
  }
  const { data: tenantRow } = await supabase
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tenantS = (tenantRow as { settings?: Record<string, unknown> } | null)?.settings;
  return mergeAuthFromSettingsJson(global, tenantS ?? null);
}
