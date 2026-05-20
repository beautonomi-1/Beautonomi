/**
 * GET /api/me/verification/sumsub/refresh?refresh_token=xxx
 *
 * Public endpoint used by the customer embed page to get a new SumSub access
 * token without requiring Bearer auth (the mobile WebView doesn't carry cookies).
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
    if (!parsed || parsed.type !== "user") {
      return errorResponse("Invalid or expired refresh token", "UNAUTHORIZED", 401);
    }

    // entityId is the raw user.id (not prefixed); prefix it for SumSub
    const sumsubUserId = `user:${parsed.entityId}`;
    const { data: userRow } = await getSupabaseAdmin()
      .from("users")
      .select("preferred_home_tenant_id")
      .eq("id", parsed.entityId)
      .maybeSingle();
    const tenantId =
      (userRow as { preferred_home_tenant_id?: string | null } | null)?.preferred_home_tenant_id ?? null;
    const { token } = await getSumsubAccessToken(sumsubUserId, parsed.environment, tenantId);
    if (!token) {
      return errorResponse("Failed to get new token", "SUMSUB_ERROR", 502);
    }

    return successResponse({ access_token: token });
  } catch {
    return errorResponse("Refresh failed", "INTERNAL", 500);
  }
}
