/**
 * Sumsub access token generation (shared by token and refresh routes).
 */

import { createHmac } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SUMSUB_BASE = "https://api.sumsub.com";

export async function getSumsubAccessToken(
  providerId: string,
  environment: string
): Promise<{ token: string | null; applicantId?: string | null; levelName: string }> {
  const supabase = getSupabaseAdmin();
  const { data: config, error: configError } = await supabase
    .from("sumsub_integration_config")
    .select("enabled, app_token_secret, secret_key_secret, level_name")
    .eq("environment", environment)
    .maybeSingle();

  const levelName = (config?.level_name as string) || "basic-kyc-level";
  if (configError || !config?.enabled) return { token: null, levelName };
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
    return { token: null, levelName };
  }

  const data = (await res.json()) as { token?: string; userId?: string };
  const token = data?.token ?? null;
  return { token, applicantId: data?.userId ?? userId, levelName };
}
