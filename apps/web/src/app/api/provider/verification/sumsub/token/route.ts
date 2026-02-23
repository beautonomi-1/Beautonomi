/**
 * GET /api/provider/verification/sumsub/token
 * Returns a Sumsub SDK access token for the current provider.
 * Uses sumsub_integration_config (server-only). Creates/updates provider_verification_status.
 */

import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const SUMSUB_BASE = "https://api.sumsub.com";

function parseEnv(s: string | null): string {
  const ENVS = ["production", "staging", "development"];
  if (s && ENVS.includes(s)) return s;
  return "production";
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();

    let provider: { id: string } | null = null;
    const { data: byOwner } = await supabase.from("providers").select("id").eq("user_id", user.id).limit(1).maybeSingle();
    if (byOwner) provider = byOwner;
    else {
      const { data: staff } = await supabase.from("provider_staff").select("provider_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (staff?.provider_id) provider = { id: staff.provider_id };
    }
    if (!provider) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    const { data: config, error: configError } = await supabase
      .from("sumsub_integration_config")
      .select("enabled, app_token_secret, secret_key_secret, level_name")
      .eq("environment", environment)
      .maybeSingle();

    if (configError || !config) {
      return errorResponse("Sumsub not configured", "CONFIG_ERROR", 503);
    }
    if (!config.enabled) {
      return errorResponse("Sumsub verification is disabled", "DISABLED", 403);
    }

    const appToken = config.app_token_secret as string | null;
    const secretKey = config.secret_key_secret as string | null;
    const levelName = (config.level_name as string) || "basic-kyc-level";

    if (!appToken || !secretKey) {
      return errorResponse("Sumsub credentials not set", "CONFIG_ERROR", 503);
    }

    const userId = String(provider.id);
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
      return errorResponse("Failed to get verification token", "SUMSUB_ERROR", 502);
    }

    const data = (await res.json()) as { token?: string; userId?: string };
    const token = data?.token;
    if (!token) {
      return errorResponse("Invalid Sumsub response", "SUMSUB_ERROR", 502);
    }

    await supabase.from("provider_verification_status").upsert(
      {
        provider_id: provider.id,
        status: "in_progress",
        sumsub_applicant_id: data.userId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id" }
    );

    return successResponse({
      access_token: token,
      applicant_id: data.userId ?? userId,
      level_name: levelName,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to get Sumsub token");
  }
}
