import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";
import type { PaycloudAppCredentials } from "@/lib/payments/paycloud-client";

type AppRow = {
  app_id: string;
  app_rsa_private_key: string;
  gateway_rsa_public_key: string;
  api_base_url?: string | null;
  is_enabled?: boolean;
  environment?: string;
};

/**
 * Resolve PayCloud app credentials: merchant-linked app → tenant row → global row.
 */
export async function resolvePaycloudAppCredentials(
  supabase: SupabaseClient,
  params: {
    environment: PaycloudEnvironment;
    tenantId: string | null;
    paycloudAppId?: string | null;
    requirePrivateKey?: boolean;
  },
): Promise<PaycloudAppCredentials | null> {
  const requirePrivate = params.requirePrivateKey !== false;

  if (params.paycloudAppId) {
    const { data: linked } = await supabase
      .from("tenant_paycloud_apps")
      .select("app_id, app_rsa_private_key, gateway_rsa_public_key, api_base_url, is_enabled, environment")
      .eq("id", params.paycloudAppId)
      .maybeSingle();
    // Skip linked app when env mismatches merchant — fall through to tenant/global for the correct env.
    if (
      linked &&
      linked.is_enabled !== false &&
      linked.gateway_rsa_public_key &&
      linked.environment === params.environment
    ) {
      if (!requirePrivate || (linked.app_rsa_private_key && linked.gateway_rsa_public_key)) {
        return toCredentials(linked as AppRow);
      }
    }
  }

  if (params.tenantId) {
    const { data: tenantApp } = await supabase
      .from("tenant_paycloud_apps")
      .select("app_id, app_rsa_private_key, gateway_rsa_public_key, api_base_url, is_enabled")
      .eq("tenant_id", params.tenantId)
      .eq("environment", params.environment)
      .eq("is_enabled", true)
      .maybeSingle();
    if (tenantApp) {
      if (!requirePrivate || (tenantApp.app_rsa_private_key && tenantApp.gateway_rsa_public_key)) {
        return toCredentials(tenantApp as AppRow);
      }
    }
  }

  const { data: globalApp } = await supabase
    .from("tenant_paycloud_apps")
    .select("app_id, app_rsa_private_key, gateway_rsa_public_key, api_base_url, is_enabled")
    .is("tenant_id", null)
    .eq("environment", params.environment)
    .eq("is_enabled", true)
    .maybeSingle();

  if (!globalApp) return null;
  if (requirePrivate && (!globalApp.app_rsa_private_key || !globalApp.gateway_rsa_public_key)) {
    return null;
  }
  return toCredentials(globalApp as AppRow);
}

/** Gateway public key only (webhook signature verify). */
export async function resolvePaycloudGatewayPublicKey(
  supabase: SupabaseClient,
  params: {
    environment: PaycloudEnvironment;
    tenantId: string | null;
    paycloudAppId?: string | null;
  },
): Promise<string | null> {
  const creds = await resolvePaycloudAppCredentials(supabase, {
    ...params,
    requirePrivateKey: false,
  });
  return creds?.gateway_rsa_public_key ?? null;
}

function toCredentials(row: AppRow): PaycloudAppCredentials {
  return {
    app_id: row.app_id ?? "",
    app_rsa_private_key: row.app_rsa_private_key ?? "",
    gateway_rsa_public_key: row.gateway_rsa_public_key ?? "",
    api_base_url: row.api_base_url ?? undefined,
  };
}
