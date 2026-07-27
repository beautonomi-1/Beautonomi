import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";

export type PaycloudMerchantPickResult =
  | { id: string }
  | { error: "NO_MERCHANT" | "MERCHANT_AMBIGUOUS"; count: number };

/**
 * Prefer live when an enabled live app row and active live merchant both exist;
 * otherwise sandbox when configured; else whichever environment has merchants.
 */
export async function resolveTargetPaycloudEnvironment(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PaycloudEnvironment> {
  const { data: merchants } = await supabase
    .from("paycloud_merchants")
    .select("environment")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const merchantEnvs = new Set(
    (merchants ?? [])
      .map((m) => (m as { environment?: string }).environment)
      .filter(Boolean),
  );

  // App rows are admin-owned. A user-scoped client sees none, so treat an unreadable
  // lookup as "unknown" and fall through to the merchant environments below.
  let apps: unknown[] | null = null;
  try {
    const { data } = await supabase
      .from("tenant_paycloud_apps")
      .select("environment, is_enabled, tenant_id")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    apps = data;
  } catch {
    apps = null;
  }

  const appEnabled = (env: PaycloudEnvironment) =>
    (apps ?? []).some(
      (a) =>
        (a as { environment?: string }).environment === env &&
        (a as { is_enabled?: boolean }).is_enabled !== false,
    );

  if (appEnabled("live") && merchantEnvs.has("live")) return "live";
  if (appEnabled("sandbox") && merchantEnvs.has("sandbox")) return "sandbox";
  if (merchantEnvs.has("live")) return "live";
  if (merchantEnvs.has("sandbox")) return "sandbox";
  return appEnabled("live") ? "live" : "sandbox";
}

/**
 * Derive merchant environment when approving a terminal merchant application, so a
 * sandbox-only tenant does not silently mint a live merchant.
 * Defaults to live when a live app row is enabled (real FICA path).
 */
export async function derivePaycloudMerchantApprovalEnvironment(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PaycloudEnvironment> {
  let apps: unknown[] | null = null;
  try {
    const { data } = await supabase
      .from("tenant_paycloud_apps")
      .select("environment, is_enabled, tenant_id")
      .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    apps = data;
  } catch (error) {
    // Approval must not fail because app config is unreadable; live is the safe default.
    console.error("[paycloud] derivePaycloudMerchantApprovalEnvironment lookup failed:", error);
    return "live";
  }

  const liveEnabled = (apps ?? []).some(
    (a) =>
      (a as { environment?: string }).environment === "live" &&
      (a as { is_enabled?: boolean }).is_enabled !== false,
  );
  if (liveEnabled) return "live";

  const sandboxEnabled = (apps ?? []).some(
    (a) =>
      (a as { environment?: string }).environment === "sandbox" &&
      (a as { is_enabled?: boolean }).is_enabled !== false,
  );
  if (sandboxEnabled) return "sandbox";

  return "live";
}

/**
 * Pick the sole active merchant for provider self-add, or null if ambiguous/missing.
 * Filters by the tenant's effective environment so sandbox+live cutover does not break self-add.
 */
export async function resolveSingleActivePaycloudMerchant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PaycloudMerchantPickResult> {
  const targetEnv = await resolveTargetPaycloudEnvironment(supabase, tenantId);

  const { data: merchants, error } = await supabase
    .from("paycloud_merchants")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .eq("environment", targetEnv);

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
