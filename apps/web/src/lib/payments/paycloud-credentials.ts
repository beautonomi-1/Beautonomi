import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaycloudEnvironment } from "@/lib/payments/paycloud";
import type { PaycloudAppCredentials } from "@/lib/payments/paycloud-client";
import { resolvePaycloudAppCredentials } from "@/lib/payments/resolve-paycloud-app-credentials";

export interface ResolvedPaycloudContext {
  environment: PaycloudEnvironment;
  merchant_no: string;
  store_no: string;
  credentials: PaycloudAppCredentials;
  /** tenant_paycloud_apps.id for metadata (intent_contract overrides). */
  paycloud_app_db_id?: string | null;
  tenant_id?: string | null;
}

/**
 * Resolve PayCloud credentials for a provider's assigned terminal.
 */
export async function resolvePaycloudContextForProvider(
  supabase: SupabaseClient,
  providerId: string,
  terminalId: string,
): Promise<ResolvedPaycloudContext | null> {
  const { data: terminal } = await supabase
    .from("paycloud_terminals")
    .select(
      "id, paycloud_merchant_id, provider_id, status, is_active, tenant_id",
    )
    .eq("id", terminalId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (!terminal || !terminal.is_active) return null;
  if (terminal.status === "suspended" || terminal.status === "decommissioned") return null;

  const { data: merchant } = await supabase
    .from("paycloud_merchants")
    .select("merchant_no, store_no, environment, paycloud_app_id, tenant_id, is_active")
    .eq("id", terminal.paycloud_merchant_id)
    .maybeSingle();

  if (!merchant || !merchant.is_active) return null;

  const env = (merchant.environment as PaycloudEnvironment) ?? "live";
  const tenantId = (merchant as { tenant_id?: string | null }).tenant_id ?? null;

  const credentials = await resolvePaycloudAppCredentials(supabase, {
    environment: env,
    tenantId,
    paycloudAppId: merchant.paycloud_app_id,
  });
  if (!credentials) return null;

  return {
    environment: env,
    merchant_no: merchant.merchant_no,
    store_no: merchant.store_no,
    credentials,
    paycloud_app_db_id: (merchant as { paycloud_app_id?: string | null }).paycloud_app_id ?? null,
    tenant_id: tenantId,
  };
}

export function getPaycloudNotifyUrl(request?: Request): string {
  const host = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
  if (host) {
    const base = host.startsWith("http") ? host : `https://${host}`;
    return `${base}/api/provider/paycloud/webhook`;
  }
  if (request) {
    const url = new URL(request.url);
    return `${url.origin}/api/provider/paycloud/webhook`;
  }
  return "/api/provider/paycloud/webhook";
}
