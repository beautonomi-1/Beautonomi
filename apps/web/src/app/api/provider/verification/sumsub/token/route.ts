/**
 * GET /api/provider/verification/sumsub/token
 * Returns a Sumsub SDK access token for the current provider.
 * Also returns refresh_token for embed flow (mobile WebView) so the embed page can get new tokens without Bearer.
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createEmbedRefreshToken } from "@/lib/verification/sumsub-embed-refresh";
// createEmbedRefreshToken defaults to type="provider" — no change needed
import { getSumsubAccessToken } from "@/lib/verification/sumsub-token";
import { resolveVerificationPolicy } from "@/lib/verification/verification-policy";

function parseEnv(s: string | null): string {
  const ENVS = ["production", "staging", "development"];
  if (s && ENVS.includes(s)) return s;
  return "production";
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = getSupabaseAdmin();

    let provider: { id: string; tenant_id?: string | null } | null = null;
    const { data: byOwner } = await supabase.from("providers").select("id, tenant_id").eq("user_id", user.id).limit(1).maybeSingle();
    if (byOwner) provider = byOwner;
    else {
      const { data: staff } = await supabase.from("provider_staff").select("provider_id").eq("user_id", user.id).limit(1).maybeSingle();
      if (staff?.provider_id) {
        const { data: providerRow } = await supabase
          .from("providers")
          .select("id, tenant_id")
          .eq("id", staff.provider_id)
          .maybeSingle();
        if (providerRow) provider = providerRow;
      }
    }
    if (!provider) return errorResponse("Provider not found", "NOT_FOUND", 404);

    const { searchParams } = new URL(request.url);
    const environment = parseEnv(searchParams.get("environment"));

    // Gate: Sumsub must be enabled (flag + credentials).
    const policy = await resolveVerificationPolicy(provider.tenant_id ?? null, environment);
    if (!policy.sumsubEnabled) {
      return errorResponse(
        "Automated verification is not available. Please upload your document manually.",
        "SUMSUB_DISABLED",
        403,
      );
    }

    const { token, applicantId, levelName } = await getSumsubAccessToken(
      provider.id,
      environment,
      provider.tenant_id ?? null,
    );
    if (!token) {
      return errorResponse("Failed to get verification token", "SUMSUB_ERROR", 502);
    }

    await supabase.from("provider_verification_status").upsert(
      {
        provider_id: provider.id,
        status: "in_progress",
        sumsub_applicant_id: applicantId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id" }
    );

    const refresh_token = createEmbedRefreshToken(provider.id, environment);

    return successResponse({
      access_token: token,
      refresh_token,
      applicant_id: applicantId ?? provider.id,
      level_name: levelName,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to get Sumsub token");
  }
}
