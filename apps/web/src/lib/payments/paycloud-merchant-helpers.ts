import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pick the sole active merchant for provider self-add, or null if ambiguous/missing.
 */
export async function resolveSingleActivePaycloudMerchant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ id: string } | { error: "NO_MERCHANT" | "MERCHANT_AMBIGUOUS"; count: number }> {
  const { data: merchants, error } = await supabase
    .from("paycloud_merchants")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if (error) throw error;
  const rows = merchants ?? [];
  if (rows.length === 0) return { error: "NO_MERCHANT", count: 0 };
  if (rows.length > 1) return { error: "MERCHANT_AMBIGUOUS", count: rows.length };
  return { id: rows[0].id };
}

export async function validatePaycloudAppMatchesMerchantEnv(
  supabase: SupabaseClient,
  paycloudAppId: string,
  merchantEnvironment: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: app } = await supabase
    .from("tenant_paycloud_apps")
    .select("environment")
    .eq("id", paycloudAppId)
    .maybeSingle();
  if (!app) {
    return { ok: false, message: "PayCloud app not found." };
  }
  if (app.environment !== merchantEnvironment) {
    return {
      ok: false,
      message: `PayCloud app environment (${app.environment}) must match merchant environment (${merchantEnvironment}).`,
    };
  }
  return { ok: true };
}
