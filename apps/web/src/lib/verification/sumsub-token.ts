/**
 * Sumsub access token generation (shared by token and refresh routes).
 */

import { createHmac } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SUMSUB_BASE = "https://api.sumsub.com";

export type SumsubConfig = {
  enabled?: boolean | null;
  app_token_secret?: string | null;
  secret_key_secret?: string | null;
  webhook_secret_secret?: string | null;
  level_name?: string | null;
  tenant_id?: string | null;
};

export async function resolveSumsubConfig(
  environment: string,
  tenantId?: string | null,
  select = "enabled, app_token_secret, secret_key_secret, webhook_secret_secret, level_name, tenant_id",
): Promise<SumsubConfig | null> {
  const supabase = getSupabaseAdmin();
  if (tenantId) {
    const { data: tenantConfig, error: tenantError } = await supabase
      .from("sumsub_integration_config")
      .select(select)
      .eq("environment", environment)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!tenantError && tenantConfig) return tenantConfig as SumsubConfig;
  }

  const { data: globalConfig, error: globalError } = await supabase
    .from("sumsub_integration_config")
    .select(select)
    .eq("environment", environment)
    .is("tenant_id", null)
    .maybeSingle();
  if (globalError) {
    console.warn("Sumsub config lookup failed:", globalError);
    return null;
  }
  return (globalConfig as SumsubConfig | null) ?? null;
}

export async function getSumsubAccessToken(
  providerId: string,
  environment: string,
  tenantId?: string | null,
): Promise<{ token: string | null; applicantId?: string | null; levelName: string; error?: string }> {
  const config = await resolveSumsubConfig(environment, tenantId);
  const levelName = (config?.level_name as string) || "basic-kyc-level";
  if (!config?.enabled) return { token: null, levelName };
  const appToken = config.app_token_secret as string | null;
  const secretKey = config.secret_key_secret as string | null;
  if (!appToken || !secretKey) return { token: null, levelName };

  const userId = String(providerId);
  const path = "/resources/accessTokens/sdk";
  const method = "POST";
  const body = JSON.stringify({
    userId,
    levelName,
    ttlInSecs: 600,
  });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sigPayload = ts + method + path + body;
  const sig = createHmac("sha256", secretKey).update(sigPayload).digest("hex");

  const res = await fetch(`${SUMSUB_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-App-Token": appToken,
      "X-App-Access-Ts": ts,
      "X-App-Access-Sig": sig,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Sumsub accessTokens error:", res.status, text);
    // Surface the Sumsub error text so callers (e.g. admin test endpoint) can
    // report the exact reason without parsing HTTP status codes.
    return { token: null, levelName, error: `${res.status}: ${text}` };
  }

  const data = (await res.json()) as { token?: string; userId?: string };
  const token = data?.token ?? null;
  return { token, applicantId: data?.userId ?? userId, levelName };
}
