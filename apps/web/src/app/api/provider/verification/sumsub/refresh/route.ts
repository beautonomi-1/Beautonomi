/**
 * GET /api/provider/verification/sumsub/refresh?refresh_token=xxx
 * Public endpoint for Sumsub embed page to get a new access token without Bearer auth.
 * refresh_token is a signed token issued with the initial token (see sumsub-embed-refresh).
 */

import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { verifyEmbedRefreshToken } from "@/lib/verification/sumsub-embed-refresh";
import { getSumsubAccessToken } from "@/lib/verification/sumsub-token";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const refreshToken = searchParams.get("refresh_token");
    if (!refreshToken) {
      return errorResponse("refresh_token required", "VALIDATION", 400);
    }

    const parsed = verifyEmbedRefreshToken(refreshToken);
    if (!parsed || parsed.type !== "provider") {
      return errorResponse("Invalid or expired refresh token", "UNAUTHORIZED", 401);
    }

    const { data: providerRow } = await getSupabaseAdmin()
      .from("providers")
      .select("tenant_id")
      .eq("id", parsed.entityId)
      .maybeSingle();
    const tenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    const { token } = await getSumsubAccessToken(parsed.entityId, parsed.environment, tenantId);
    if (!token) {
      return errorResponse("Failed to get new token", "SUMSUB_ERROR", 502);
    }

    return successResponse({ access_token: token });
  } catch {
    return errorResponse("Refresh failed", "INTERNAL", 500);
  }
}
